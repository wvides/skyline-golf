/**
 * Quick smoke test against the production build (no dev handles available).
 * Just verifies the page loads, the start screen is visible, and no errors fire.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:5200/";
const SHOTS = new URL("./shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (err) => errors.push(String(err)));
page.on("response", (res) => {
  if (res.status() >= 400) errors.push(`${res.status()} ${res.url()}`);
});

await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SHOTS}prod-start.png` });

const title = await page.locator(".game-title").isVisible();
const noErrors = errors.length === 0;
console.log(`${title ? "✅" : "❌"} Start screen visible in production build`);
console.log(`${noErrors ? "✅" : "❌"} No resource / JS errors`);
if (!noErrors) console.log(errors.slice(0, 3).join("\n"));

await browser.close();
process.exit(title && noErrors ? 0 : 1);
