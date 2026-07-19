/**
 * Renders a screenshot of each of the 10 default levels so they can be
 * inspected for playability issues.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5199/";
const SHOTS = new URL("./shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

for (let i = 0; i < 10; i++) {
  await page.goto(`${BASE}?level=${i}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 20000 });
  const title = await page.evaluate(() => window.__game?.getDebugState()?.level?.title ?? "unknown");
  console.log(`Level ${i}: ${title}`);
  await page.click("#play-button");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}level-${i}.png` });
  console.log(`Screenshot level ${i}`);
}

// Level select modal screenshot
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await page.click("#select-level-button");
await page.waitForTimeout(400);
await page.screenshot({ path: `${SHOTS}level-select.png` });
console.log("Screenshot level select");

await browser.close();
console.log("Done");
