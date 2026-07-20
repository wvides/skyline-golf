import type { Application } from "pixi.js";
import { FINISH_TILES, PHYSICS_CONFIG, TILE_SIZE } from "../config";
import { Background } from "../effects/Background";
import { ParticleSystem } from "../effects/ParticleSystem";
import { TrajectoryLine } from "../effects/TrajectoryLine";
import { CheckpointManager } from "../level/CheckpointManager";
import { LevelLoader, type LevelData } from "../level/LevelLoader";
import { LEVELS, type RawLevel } from "../level/levels";
import { Tilemap } from "../level/Tilemap";
import { generateLevel } from "../level/ProceduralLevel";
import { Ball } from "../physics/Ball";
import { ColliderBuilder, type SensorColliders } from "../physics/ColliderBuilder";
import { PhysicsWorld } from "../physics/PhysicsWorld";
import { renderMinimap, type TrailPoint } from "../ui/Minimap";
import type { UI } from "../ui/UI";
import { Camera } from "./Camera";
import { InputManager, type AimState } from "./InputManager";

type GameState = "menu" | "playing" | "resetting" | "won";

const EPOCH = new Date(2026, 0, 1).getTime();
const DAY_MS = 86_400_000;

export class Game {
  private readonly app: Application;
  private readonly ui: UI;
  private readonly input: InputManager;

  private physics: PhysicsWorld | null = null;
  private camera: Camera | null = null;
  private tilemap: Tilemap | null = null;
  private background: Background | null = null;
  private checkpoints: CheckpointManager | null = null;
  private ball: Ball | null = null;
  private sensors: SensorColliders = { water: [], rough: [] };
  private trajectory = new TrajectoryLine();
  private particles = new ParticleSystem();

  private state: GameState = "menu";
  private level: LevelData | null = null;
  private levelIndex = 0;
  private holeNumber = 1;
  private isRandomCourse = false;
  private randomSeed: number | null = null;

  private strokes = 0;
  private strokesBySection = new Map<number, number>();
  private aimPowerNorm = 0;
  private resetTimer = -1;
  private hasEverShot = false;
  private trail: TrailPoint[] = [];
  private trailSampleTimer = 0;

  constructor(app: Application, ui: UI) {
    this.app = app;
    this.ui = ui;
    this.input = new InputManager();
    this.input.attach(app.canvas);
    this.input.onShoot = this.onShoot;
    this.input.onAimChange = this.onAimChange;

    ui.onPlay = () => void this.startFromMenu();
    ui.onRestart = () => void this.restartLevel();
    ui.onMenu = () => this.goToMenu();
    ui.onCheckpoint = () => this.returnToCheckpoint();
    ui.onNextHole = () => void this.nextHole();
    ui.onRandomCourse = () => void this.playRandomCourse();
    ui.onShowLevelSelect = () => this.ui.showLevelSelect(LEVELS.map((l) => ({ title: l.title, par: l.par })));
    ui.onLevelSelect = (index) => void this.playSelectedLevel(index);

    window.addEventListener("keydown", this.onKeyDown);

    app.ticker.add((ticker) => this.update(ticker.deltaMS));
  }

  /** Pick today's hole from the date. */
  static dailyLevelIndex(now = new Date()): { index: number; holeNumber: number } {
    const days = Math.max(0, Math.floor((now.getTime() - EPOCH) / DAY_MS));
    return { index: days % LEVELS.length, holeNumber: days + 1 };
  }

  // ---------- Dev/test helpers (used by E2E scripts) ----------

  getBallScreenPos(): { x: number; y: number } | null {
    if (!this.ball || !this.camera) return null;
    return this.camera.worldToScreen(this.ball.x, this.ball.y);
  }

  getDebugState(): Record<string, unknown> {
    return {
      state: this.state,
      strokes: this.strokes,
      ballPx: this.ball ? { x: this.ball.x, y: this.ball.y } : null,
      ballSpeed: this.ball?.speed ?? null,
      grounded: this.ball?.isGrounded ?? null,
      canShoot: this.ball?.canShoot ?? null,
      highestCheckpoint: this.checkpoints?.highestIndex ?? null,
      trailLength: this.trail.length,
      cameraPos: this.camera ? { x: this.camera.world.x, y: this.camera.world.y } : null,
      level: this.level ? { title: this.level.title, par: this.level.par, width: this.level.width, height: this.level.height } : null,
    };
  }

  debugTeleportTile(col: number, row: number): void {
    if (!this.ball) return;
    this.ball.placeAt(((col + 0.5) * TILE_SIZE) / 50, ((row + 0.5) * TILE_SIZE) / 50);
  }

  async init(): Promise<void> {
    const { index, holeNumber } = Game.dailyLevelIndex();
    this.levelIndex = index;
    this.holeNumber = holeNumber;

    // Dev-only: ?level=N forces a specific hole for testing.
    if (import.meta.env.DEV) {
      const param = new URLSearchParams(window.location.search).get("level");
      const forced = param !== null ? Number(param) : NaN;
      if (Number.isInteger(forced) && forced >= 0 && forced < LEVELS.length) {
        this.levelIndex = forced;
      }
    }

    await this.loadLevel(this.levelIndex, this.ui.infuriatingMode);
    this.ui.setStartInfo(new Date(), this.holeNumber);
    this.ui.showStart();
  }

  private async loadLevel(index: number, infuriating: boolean, rawLevel?: RawLevel): Promise<void> {
    // Fresh physics world per level (simple, leak-free).
    this.physics = await PhysicsWorld.create();
    const source = rawLevel ?? LEVELS[index];
    const level = LevelLoader.fromRaw(source, infuriating);
    this.level = level;

    const worldW = level.width * TILE_SIZE;
    const worldH = level.height * TILE_SIZE;

    // Rebuild the scene graph.
    if (this.camera) {
      this.app.stage.removeChild(this.camera.world);
      this.camera.world.destroy({ children: true });
    }
    this.camera = new Camera(worldW, worldH);
    this.app.stage.addChildAt(this.camera.world, 0);

    this.background = new Background(worldW, worldH);
    this.camera.world.addChild(this.background.container);

    this.tilemap = new Tilemap(level);
    this.camera.world.addChild(this.tilemap.container);

    this.sensors = ColliderBuilder.build(level, this.physics);

    this.trajectory = new TrajectoryLine();
    this.camera.world.addChild(this.trajectory.view);

    this.particles = new ParticleSystem();
    this.camera.world.addChild(this.particles.view);

    // Spawn the ball.
    const spawnX = (level.spawn.col + 0.5) * TILE_SIZE;
    const spawnY = (level.spawn.row + 0.5) * TILE_SIZE;
    this.ball = Ball.create(this.physics, spawnX / 50, spawnY / 50);
    this.camera.world.addChild(this.ball.view);

    this.checkpoints = new CheckpointManager(level);
    this.input.bind(this.ball, this.camera);

    this.strokes = 0;
    this.strokesBySection.clear();
    this.resetTimer = -1;
    this.aimPowerNorm = 0;
    this.trail = [];
    this.trailSampleTimer = 0;

    this.camera.setViewport(this.app.screen.width, this.app.screen.height);
    this.camera.snapTo(this.ball.x, this.ball.y);
  }

  // ---------- Flow ----------

  private async startFromMenu(): Promise<void> {
    this.isRandomCourse = false;
    this.ui.hideStart();
    this.ui.hideHowTo();
    this.ui.hideLevelSelect();
    // Always start on a fresh attempt of today's hole.
    await this.loadLevel(this.levelIndex, this.ui.infuriatingMode);
    this.state = "playing";
    this.input.inputEnabled = true;
    this.hasEverShot = false;
    this.ui.showHUD(this.level?.par ?? 3);
    this.ui.setHint("Pull the ball back to aim");
  }

  private async playRandomCourse(): Promise<void> {
    this.isRandomCourse = true;
    this.randomSeed = Math.floor(Math.random() * 1_000_000);
    this.ui.hideStart();
    this.ui.hideHowTo();
    this.ui.hideLevelSelect();
    await this.loadLevel(0, this.ui.infuriatingMode, generateLevel(this.randomSeed));
    this.state = "playing";
    this.input.inputEnabled = true;
    this.hasEverShot = false;
    this.ui.showHUD(this.level?.par ?? 3);
    this.ui.setHint("Pull the ball back to aim");
  }

  private async playSelectedLevel(index: number): Promise<void> {
    this.isRandomCourse = false;
    this.levelIndex = index;
    this.holeNumber = index + 1;
    this.ui.hideStart();
    this.ui.hideHowTo();
    this.ui.hideLevelSelect();
    await this.loadLevel(index, this.ui.infuriatingMode);
    this.state = "playing";
    this.input.inputEnabled = true;
    this.hasEverShot = false;
    this.ui.showHUD(this.level?.par ?? 3);
    this.ui.setHint("Pull the ball back to aim");
  }

  private async restartLevel(): Promise<void> {
    this.ui.hideWin();
    if (this.isRandomCourse && this.randomSeed !== null) {
      await this.loadLevel(0, this.ui.infuriatingMode, generateLevel(this.randomSeed));
    } else {
      await this.loadLevel(this.levelIndex, this.ui.infuriatingMode);
    }
    this.state = "playing";
    this.input.inputEnabled = true;
    this.hasEverShot = false;
    this.ui.showHUD(this.level?.par ?? 3);
    this.ui.setHint("Pull the ball back to aim");
  }

  private async nextHole(): Promise<void> {
    this.ui.hideWin();
    if (this.isRandomCourse) {
      this.randomSeed = Math.floor(Math.random() * 1_000_000);
      await this.loadLevel(0, this.ui.infuriatingMode, generateLevel(this.randomSeed));
    } else {
      this.levelIndex = (this.levelIndex + 1) % LEVELS.length;
      this.holeNumber = this.levelIndex + 1;
      await this.loadLevel(this.levelIndex, this.ui.infuriatingMode);
    }
    this.state = "playing";
    this.input.inputEnabled = true;
    this.hasEverShot = false;
    this.ui.setStartInfo(new Date(), this.holeNumber);
    this.ui.showHUD(this.level?.par ?? 3);
    this.ui.setHint("Pull the ball back to aim");
  }

  private goToMenu(): void {
    this.state = "menu";
    this.input.inputEnabled = false;
    this.input.cancelAim();
    this.trajectory.hide();
    this.ui.setWrongWay(false);
    this.ui.hideWin();
    this.ui.showStart();
  }

  private returnToCheckpoint(): void {
    if (this.state !== "playing" || !this.ball || !this.checkpoints) return;
    this.input.cancelAim();
    this.respawn();
  }

  private respawn(): void {
    if (!this.ball || !this.checkpoints || !this.camera) return;
    const pos = this.checkpoints.respawnPosPx;
    this.ball.unfreeze();
    this.ball.placeAt(pos.x / 50, pos.y / 50);
    this.resetTimer = -1;
    if (this.state === "resetting") {
      this.state = "playing";
      this.input.inputEnabled = true;
    }
    this.particles.dust(pos.x, pos.y, 1);
  }

  // ---------- Input handlers ----------

  private onShoot = (vxPhys: number, vyPhys: number): void => {
    if (this.state !== "playing" || !this.ball || !this.camera) return;

    this.ball.launch(vxPhys, vyPhys);
    this.camera.resetPan();

    const section = this.checkpoints?.highestIndex ?? -1;
    this.strokesBySection.set(section, (this.strokesBySection.get(section) ?? 0) + 1);
    this.strokes += 1;
    this.ui.setStrokes(this.strokes);

    this.trajectory.hide();
    this.aimPowerNorm = 0;

    if (!this.hasEverShot) {
      this.hasEverShot = true;
      this.ui.setHint(null);
    }
    this.particles.dust(this.ball.x, this.ball.y + 10, 0.8);
  };

  private onAimChange = (aim: AimState): void => {
    if (this.state !== "playing" || !this.ball) return;

    if (!aim.active || aim.belowMin) {
      this.trajectory.hide();
      this.ui.setWrongWay(false);
      this.aimPowerNorm = 0;
      return;
    }

    if (aim.wrongWay) {
      this.trajectory.hide();
      this.ui.setWrongWay(true);
      this.aimPowerNorm = aim.powerNorm * 0.4;
      return;
    }

    this.ui.setWrongWay(false);
    this.aimPowerNorm = aim.powerNorm;
    this.trajectory.show(this.ball.x, this.ball.y, aim.vxPhys, aim.vyPhys, aim.powerNorm);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    switch (e.key.toLowerCase()) {
      case "c":
        this.returnToCheckpoint();
        break;
      case "r":
        if (this.state === "playing" || this.state === "won") void this.restartLevel();
        break;
      case "escape":
        if (this.state !== "menu") this.goToMenu();
        break;
      case "z":
        this.camera?.cycleZoom();
        break;
    }
  };

  // ---------- Per-frame update ----------

  private update(dtMs: number): void {
    if (!this.physics || !this.ball || !this.camera || !this.level) return;

    const simulate = this.state === "playing" || this.state === "resetting" || this.state === "won";
    if (simulate) {
      this.physics.step(dtMs);
      this.handleCollisionEvents();
      this.ball.updateContacts(this.physics, this.sensors.rough);
    }

    if (this.state === "playing") {
      this.checkWater();
      this.checkCheckpointActivation();
      this.checkFinish();
      this.sampleTrail(dtMs);
    } else if (this.state === "resetting") {
      this.resetTimer += dtMs;
      if (this.resetTimer >= PHYSICS_CONFIG.water.resetDelayMs) {
        this.respawn();
      }
    }

    // Visual sync
    this.ball.syncVisual(dtMs);
    this.tilemap?.update(dtMs);
    this.background?.update(dtMs);
    this.particles.update(dtMs);

    this.camera.setViewport(this.app.screen.width, this.app.screen.height);
    this.camera.update(dtMs, this.ball.x, this.ball.y, this.aimPowerNorm);
  }

  private handleCollisionEvents(): void {
    if (!this.physics || !this.ball) return;
    this.physics.drainCollisionEvents((c1, c2, started) => {
      if (!started || !this.ball) return;
      if (c1 !== this.ball.collider && c2 !== this.ball.collider) return;
      const speed = this.ball.speed;
      if (speed > 2.2) {
        this.particles.dust(this.ball.x, this.ball.y + 8, Math.min(2.5, speed / 6));
      }
    });
  }

  private checkWater(): void {
    if (!this.physics || !this.ball) return;
    for (const water of this.sensors.water) {
      if (this.physics.world.intersectionPair(this.ball.collider, water)) {
        this.state = "resetting";
        this.resetTimer = 0;
        this.ball.freeze();
        this.particles.splash(this.ball.x, this.ball.y);
        this.input.inputEnabled = false;
        this.input.cancelAim();
        this.trajectory.hide();
        this.ui.setWrongWay(false);
        return;
      }
    }
  }

  private checkCheckpointActivation(): void {
    if (!this.ball || !this.checkpoints || !this.tilemap) return;

    const activated = this.checkpoints.checkActivation(this.ball.x, this.ball.y);
    if (activated >= 0) {
      this.tilemap.setFlagActive(activated);
      this.particles.confetti(this.ball.x, this.ball.y - 20);
      if (this.hasEverShot) {
        this.ui.setHint("Checkpoint reached! Press C to return here");
        setTimeout(() => this.ui.setHint(null), 2600);
      }
    }
  }

  private checkFinish(): void {
    if (!this.ball || !this.level) return;
    if (!this.ball.canShoot) return;

    const col = Math.floor(this.ball.x / TILE_SIZE);
    const row = Math.floor(this.ball.y / TILE_SIZE);
    const inBounds =
      row >= 0 && row < this.level.height && col >= 0 && col < this.level.width;
    if (!inBounds) return;

    const tileHere = this.level.tiles[row][col];
    const tileBelow = row + 1 < this.level.height ? this.level.tiles[row + 1][col] : 0;
    if (!FINISH_TILES.has(tileHere) && !FINISH_TILES.has(tileBelow)) return;

    this.win();
  }

  /** Record ball positions while it moves so the score page can show a trail. */
  private sampleTrail(dtMs: number): void {
    if (!this.ball) return;
    if (this.ball.speed < 0.3) return;
    this.trailSampleTimer += dtMs;
    if (this.trailSampleTimer < 55) return;
    this.trailSampleTimer = 0;
    if (this.trail.length < 4000) {
      this.trail.push({ x: this.ball.x, y: this.ball.y });
    }
  }

  private win(): void {
    if (!this.ball || !this.level || !this.checkpoints) return;
    this.state = "won";
    this.input.inputEnabled = false;
    this.input.cancelAim();
    this.trajectory.hide();
    this.ui.setWrongWay(false);
    this.particles.confetti(this.ball.x, this.ball.y - 10);

    // Persist best score + completion count.
    const bestKey = `skyline-golf-best-${this.levelIndex}`;
    const prevBestRaw = localStorage.getItem(bestKey);
    const prevBest = prevBestRaw !== null ? Number(prevBestRaw) : null;
    const isNewBest = prevBest === null || this.strokes < prevBest;
    if (isNewBest) localStorage.setItem(bestKey, String(this.strokes));

    const completionsKey = `skyline-golf-completions-${this.levelIndex}`;
    const completions = Number(localStorage.getItem(completionsKey) ?? "0") + 1;
    localStorage.setItem(completionsKey, String(completions));

    const level = this.level;
    const trail = this.trail.slice();
    const ballPos = { x: this.ball.x, y: this.ball.y };
    const flagsReached = level.flags.map((_, i) => this.checkpoints!.isActivated(i));

    this.ui.showWin({
      score: this.strokes,
      par: level.par,
      best: prevBest,
      isNewBest,
      completions,
      holeNumber: this.holeNumber,
      drawMinimap: (canvas) => renderMinimap(canvas, level, trail, ballPos, flagsReached),
    });
  }
}
