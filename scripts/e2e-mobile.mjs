/**
 * Mobile viewport + touch-input smoke test for Skyline Golf.
 * Uses synthetic PointerEvents (pointerType: "touch") since the game
 * listens to pointer events, which unify mouse and touch.
 *
 * Usage: node scripts/e2e-mobile.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199/";
const SHOTS = new URL("./shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });

// Start screen fits on a phone
check("Start screen renders on mobile", await page.locator(".game-title").isVisible());
check("Play button visible", await page.locator("#play-button").isVisible());
await page.screenshot({ path: `${SHOTS}m1-start.png` });

// How-to modal flow
await page.click("#howto-button");
check("How-to modal opens", await page.locator("#howto-modal").isVisible());
await page.screenshot({ path: `${SHOTS}m2-howto.png` });
await page.click("#howto-gotit");
await page.waitForTimeout(900);
const state = await page.evaluate(() => window.__game.getDebugState());
check("Got-it starts the game", state.state === "playing", state.state);

// Touch drag on the ball via synthetic pointer events
const ball = await page.evaluate(() => window.__game.getBallScreenPos());
await page.evaluate(({ x, y }) => {
  const canvas = document.querySelector("#app canvas");
  const opts = (type, px, py) =>
    new PointerEvent(type, {
      pointerId: 7,
      pointerType: "touch",
      clientX: px,
      clientY: py,
      button: 0,
      bubbles: true,
      cancelable: true,
    });
  canvas.dispatchEvent(opts("pointerdown", x, y));
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    window.dispatchEvent(opts("pointermove", x + i * 4, y + i * 7));
  }
  window.dispatchEvent(opts("pointerup", x + steps * 4, y + steps * 7));
}, { x: ball.x, y: ball.y });
await page.waitForTimeout(400);
const afterTouch = await page.evaluate(() => window.__game.getDebugState());
check("Touch drag shoots the ball", afterTouch.strokes === 1, `strokes=${afterTouch.strokes}`);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${SHOTS}m3-gameplay.png` });

// Menu roundtrip: Escape -> start screen -> Play
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("Escape returns to menu", await page.locator("#start-screen").isVisible());
await page.click("#play-button");
await page.waitForTimeout(700);
const again = await page.evaluate(() => window.__game.getDebugState());
check("Play from menu starts fresh", again.state === "playing" && again.strokes === 0);

check("No page errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} mobile checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
