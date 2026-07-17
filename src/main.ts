import { Application } from "pixi.js";
import { Game } from "./game/Game";
import { UI } from "./ui/UI";

async function main(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: 0x2f7cc4,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  const host = document.getElementById("app");
  if (!host) throw new Error("Missing #app host element");
  host.appendChild(app.canvas);

  const ui = new UI();
  const game = new Game(app, ui);
  await game.init();

  if (import.meta.env.DEV) {
    // Dev-only handle used by the E2E test scripts.
    (window as unknown as Record<string, unknown>).__game = game;
    (window as unknown as Record<string, unknown>).__ready = true;
  }
}

void main();
