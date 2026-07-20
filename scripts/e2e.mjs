/**
 * E2E smoke test for Skyline Golf (run against the vite dev server).
 *
 * Usage: node scripts/e2e.mjs [baseUrl]
 *
 * Covers:
 *  1. Page loads without console errors, start screen renders.
 *  2. Play button starts the game, HUD appears.
 *  3. Drag-and-release on the ball launches it (position changes, stroke counted).
 *  4. Wrong-way drag is blocked (no stroke).
 *  5. C key respawns the ball.
 *  6. Teleporting to the finish triggers the win modal + minimap.
 *  7. Screenshots saved to scripts/shots/.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199/?level=0";
const SHOTS = new URL("./shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));
page.on("response", (res) => {
  if (res.status() >= 400) consoleErrors.push(`${res.status()} ${res.url()}`);
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });

// 1. Start screen
const titleVisible = await page.locator(".game-title").isVisible();
check("Start screen renders", titleVisible);
await page.screenshot({ path: `${SHOTS}01-start.png` });

// 2. Start the game
await page.click("#play-button");
await page.waitForTimeout(1200);
const hudVisible = await page.locator("#hud").isVisible();
check("HUD visible after Play", hudVisible);
const state1 = await page.evaluate(() => window.__game.getDebugState());
check("Game state is playing", state1.state === "playing", JSON.stringify(state1));
// Level 0 is 22 wide; spawn should be near x=48, y=848.
check("Spawn position looks correct", state1.ballPx && state1.ballPx.x < 100 && state1.ballPx.y > 800, JSON.stringify(state1.ballPx));
await page.screenshot({ path: `${SHOTS}02-gameplay.png` });

// 3. Drag-and-release launches the ball (pull down-right => fly up-left)
const ballPos = await page.evaluate(() => window.__game.getBallScreenPos());
check("Ball position available", !!ballPos, JSON.stringify(ballPos));
const before = await page.evaluate(() => window.__game.getDebugState());

await page.mouse.move(ballPos.x, ballPos.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(ballPos.x + i * 7, ballPos.y + i * 9);
  await page.waitForTimeout(16);
}
await page.screenshot({ path: `${SHOTS}03-aiming.png` });
await page.mouse.up();
await page.waitForTimeout(400);

const afterShot = await page.evaluate(() => window.__game.getDebugState());
check(
  "Stroke counted after release",
  afterShot.strokes === 1,
  `strokes=${afterShot.strokes}`,
);
const movedDist = Math.hypot(afterShot.ballPx.x - before.ballPx.x, afterShot.ballPx.y - before.ballPx.y);
check("Ball moved after launch", movedDist > 20, `moved ${movedDist.toFixed(1)}px`);
await page.waitForTimeout(1600);
await page.screenshot({ path: `${SHOTS}04-after-shot.png` });

// 4. Wait for the ball to settle, then attempt a wrong-way shot (drag up => launch down)
await page.waitForFunction(
  () => {
    const s = window.__game.getDebugState();
    return s.canShoot === true;
  },
  null,
  { timeout: 15000 },
);
const settled = await page.evaluate(() => window.__game.getDebugState());
const pos2 = await page.evaluate(() => window.__game.getBallScreenPos());
await page.mouse.move(pos2.x, pos2.y);
await page.mouse.down();
// Drag upward: launch direction points down => wrong way
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(pos2.x + i * 2, pos2.y - i * 10);
  await page.waitForTimeout(16);
}
const wrongWayVisible = await page.locator("#hud-wrongway").isVisible();
check("Wrong-way hint appears", wrongWayVisible);
await page.screenshot({ path: `${SHOTS}05-wrong-way.png` });
await page.mouse.up();
await page.waitForTimeout(300);
const afterWrong = await page.evaluate(() => window.__game.getDebugState());
check(
  "Wrong-way shot blocked (no stroke)",
  afterWrong.strokes === settled.strokes,
  `strokes ${settled.strokes} -> ${afterWrong.strokes}`,
);

// 5. C key respawns the ball (position jumps back toward spawn/checkpoint)
await page.keyboard.press("c");
await page.waitForTimeout(400);
const afterC = await page.evaluate(() => window.__game.getDebugState());
check("C respawn keeps game playing", afterC.state === "playing");

// 6. Teleport to the finish tile -> win modal with minimap
await page.evaluate(() => window.__game.debugTeleportTile(10, 2));
await page.waitForTimeout(2500);
const winVisible = await page.locator("#win-modal").isVisible();
check("Win modal appears at finish", winVisible);
const scoreText = await page.locator("#win-score").textContent();
check("Win score shown", !!scoreText, `score=${scoreText}`);
const mapDrawn = await page.evaluate(() => {
  const canvas = document.getElementById("win-map");
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let nonEmpty = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) nonEmpty++;
  return nonEmpty > 1000;
});
check("Minimap rendered", mapDrawn);
const countdown = await page.locator("#win-countdown").textContent();
check("Countdown ticking", /\d{2}:\d{2}:\d{2}/.test(countdown ?? ""), countdown);
await page.screenshot({ path: `${SHOTS}06-win.png` });

// 7. Play Again restarts
await page.click("#win-replay");
await page.waitForTimeout(800);
const replayState = await page.evaluate(() => window.__game.getDebugState());
check(
  "Play Again resets strokes",
  replayState.state === "playing" && replayState.strokes === 0,
  JSON.stringify({ state: replayState.state, strokes: replayState.strokes }),
);

// 8. Checkpoint activation: teleport next to the lowest flag on level 0 (4,22).
// Wait for the ball to actually land and settle on the platform (not the stale
// grounded state carried over from before the teleport).
await page.evaluate(() => window.__game.debugTeleportTile(4, 21));
await page.waitForFunction(
  () => {
    const s = window.__game.getDebugState();
    return s.canShoot === true && s.ballPx.y > 640;
  },
  null,
  { timeout: 10000 },
);
await page.waitForTimeout(300);
const cpState = await page.evaluate(() => window.__game.getDebugState());
check(
  "Checkpoint activates near flag",
  cpState.highestCheckpoint >= 0,
  `highestCheckpoint=${cpState.highestCheckpoint}`,
);
await page.screenshot({ path: `${SHOTS}07-checkpoint.png` });

// 9. C respawns at the activated checkpoint after moving away.
// Launch up-left (drag down-right) so the ball doesn't fly past a higher flag,
// which would now activate it on proximity and change the respawn point.
const ballPosCp = await page.evaluate(() => window.__game.getBallScreenPos());
check("Ball grabbable at checkpoint", !!ballPosCp);
await page.mouse.move(ballPosCp.x, ballPosCp.y);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(ballPosCp.x + i * 8, ballPosCp.y + i * 6);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(900);
await page.keyboard.press("c");
await page.waitForTimeout(400);
const afterRespawn = await page.evaluate(() => window.__game.getDebugState());
// Flag (13,25) center = (432, 816) world px
// Flag (4,22) center = (144, 720) world px
const distToFlag = Math.hypot(afterRespawn.ballPx.x - 144, afterRespawn.ballPx.y - 720);
check("C respawns at checkpoint flag", distToFlag < 90, `dist=${distToFlag.toFixed(0)}px`);

// 10. Camera pan: drag empty space while ball rests
const camBefore = (await page.evaluate(() => window.__game.getDebugState())).cameraPos;
await page.mouse.move(640, 300);
await page.mouse.down();
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(640, 300 + i * 8);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(700);
const camAfter = (await page.evaluate(() => window.__game.getDebugState())).cameraPos;
check(
  "Camera pans on empty-space drag",
  camAfter.y > camBefore.y + 20,
  `y ${camBefore.y.toFixed(0)} -> ${camAfter.y.toFixed(0)}`,
);

// 11. Water hazard resets the ball to the checkpoint
await page.evaluate(() => window.__game.debugTeleportTile(10, 28));
await page.waitForTimeout(250);
const duringWater = await page.evaluate(() => window.__game.getDebugState());
check("Water triggers reset state", duringWater.state === "resetting", duringWater.state);
await page.waitForTimeout(900);
const afterWater = await page.evaluate(() => window.__game.getDebugState());
check(
  "Ball respawns after water",
  afterWater.state === "playing" &&
    Math.hypot(afterWater.ballPx.x - 144, afterWater.ballPx.y - 720) < 90,
  `state=${afterWater.state} pos=(${afterWater.ballPx.x.toFixed(0)},${afterWater.ballPx.y.toFixed(0)})`,
);
await page.screenshot({ path: `${SHOTS}08-after-water.png` });

// 12. Checkpoint activates on proximity (mid-air, no settling) and C returns there
await page.evaluate(() => window.__game.debugTeleportTile(13, 10));
await page.waitForTimeout(500);
const proxState = await page.evaluate(() => window.__game.getDebugState());
check(
  "Checkpoint activates on proximity (no rest needed)",
  proxState.highestCheckpoint === 1,
  `highestCheckpoint=${proxState.highestCheckpoint}`,
);
await page.keyboard.press("c");
await page.waitForTimeout(400);
const afterProxC = await page.evaluate(() => window.__game.getDebugState());
// Flag (13,10) center = (432, 336) world px
const distToFlag1 = Math.hypot(afterProxC.ballPx.x - 432, afterProxC.ballPx.y - 336);
check("C returns ball to latest checkpoint", distToFlag1 < 90, `dist=${distToFlag1.toFixed(0)}px`);

// 13. Level 1 smoke test via ?level=0
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
await page.click("#play-button");
await page.waitForTimeout(1000);
const l1 = await page.evaluate(() => window.__game.getDebugState());
check("Level 1 loads and plays", l1.state === "playing", l1.state);
const l1Ball = await page.evaluate(() => window.__game.getBallScreenPos());
await page.mouse.move(l1Ball.x, l1Ball.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(l1Ball.x + i * 8, l1Ball.y + i * 8);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(500);
const l1After = await page.evaluate(() => window.__game.getDebugState());
check("Level 1 shot registers", l1After.strokes === 1, `strokes=${l1After.strokes}`);
await page.screenshot({ path: `${SHOTS}09-level1.png` });

// 13. Level select: open modal and choose a generated level
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.click("#select-level-button");
await page.waitForTimeout(300);
check("Level select modal opens", await page.locator("#level-select-modal").isVisible());
await page.locator("#level-grid .level-card-item").nth(4).click();
await page.waitForTimeout(800);
const selected = await page.evaluate(() => window.__game.getDebugState());
check("Selected level starts", selected.state === "playing", selected.state);

// 14. Random course loads a different procedural level
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.click("#random-button");
await page.waitForTimeout(800);
const random = await page.evaluate(() => window.__game.getDebugState());
check("Random course starts", random.state === "playing", random.state);

// Console errors
check(
  "No console errors",
  consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(" | "),
);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
