/** DOM-based UI overlay: start screen, HUD, and modals. */
export class UI {
  onPlay: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onMenu: (() => void) | null = null;
  onCheckpoint: (() => void) | null = null;
  onNextHole: (() => void) | null = null;
  onRandomCourse: (() => void) | null = null;
  onLevelSelect: ((index: number) => void) | null = null;
  onShowLevelSelect: (() => void) | null = null;
  onInfuriatingChange: ((on: boolean) => void) | null = null;

  private el = {
    startScreen: byId("start-screen"),
    playButton: byId("play-button"),
    howtoButton: byId("howto-button"),
    howtoModal: byId("howto-modal"),
    howtoGotit: byId("howto-gotit"),
    infuriating: byId("infuriating-checkbox") as HTMLInputElement,
    levelDate: byId("level-date-text"),
    levelYear: byId("level-year-text"),
    levelNumber: byId("level-number-text"),
    hud: byId("hud"),
    hudStrokes: byId("hud-strokes"),
    hudPar: byId("hud-par"),
    hudCheckpoint: byId("hud-checkpoint"),
    hudRestart: byId("hud-restart"),
    hudMenu: byId("hud-menu"),
    hudHint: byId("hud-hint"),
    hudWrongWay: byId("hud-wrongway"),
    levelSelectModal: byId("level-select-modal"),
    levelGrid: byId("level-grid"),
    levelSelectClose: byId("level-select-close"),
    winModal: byId("win-modal"),
    winTitle: byId("win-title"),
    winParCorner: byId("win-par-corner"),
    winScore: byId("win-score"),
    winDiff: byId("win-diff"),
    winBestLine: byId("win-best-line"),
    winSubLine: byId("win-sub-line"),
    winMap: byId("win-map") as HTMLCanvasElement,
    winCountdown: byId("win-countdown"),
    winReplay: byId("win-replay"),
    winShare: byId("win-share"),
    winNext: byId("win-next"),
  };

  private countdownTimer: number | null = null;

  constructor() {
    this.el.playButton.addEventListener("click", () => this.onPlay?.());
    this.el.howtoButton.addEventListener("click", () => this.showHowTo());
    this.el.howtoGotit.addEventListener("click", () => {
      this.hideHowTo();
      this.onPlay?.();
    });
    byId("random-button").addEventListener("click", () => this.onRandomCourse?.());
    byId("select-level-button")?.addEventListener("click", () => this.onShowLevelSelect?.());
    this.el.howtoModal
      .querySelector(".modal-backdrop")
      ?.addEventListener("click", () => this.hideHowTo());
    this.el.levelSelectModal
      .querySelector(".modal-backdrop")
      ?.addEventListener("click", () => this.hideLevelSelect());
    this.el.levelSelectClose.addEventListener("click", () => this.hideLevelSelect());
    this.el.winModal
      .querySelector(".modal-backdrop")
      ?.addEventListener("click", () => {}); // deliberate: no dismiss on backdrop

    this.el.hudCheckpoint.addEventListener("click", () => this.onCheckpoint?.());
    this.el.hudRestart.addEventListener("click", () => this.onRestart?.());
    this.el.hudMenu.addEventListener("click", () => this.onMenu?.());
    this.el.winReplay.addEventListener("click", () => this.onRestart?.());
    this.el.winNext.addEventListener("click", () => this.onNextHole?.());
    this.el.winShare.addEventListener("click", () => this.shareScore());
    this.el.infuriating.addEventListener("change", () => {
      this.onInfuriatingChange?.(this.el.infuriating.checked);
    });
  }

  get infuriatingMode(): boolean {
    return this.el.infuriating.checked;
  }

  // ---------- Start screen ----------

  setStartInfo(date: Date, holeNumber: number): void {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    this.el.levelDate.textContent = `${months[date.getMonth()]} ${date.getDate()}`;
    this.el.levelYear.textContent = `${date.getFullYear()}`;
    this.el.levelNumber.textContent = `${holeNumber}`;
  }

  showStart(): void {
    this.el.startScreen.classList.remove("hidden");
    this.el.hud.classList.add("hidden");
    this.el.winModal.classList.add("hidden");
  }

  hideStart(): void {
    this.el.startScreen.classList.add("hidden");
  }

  showHowTo(): void {
    this.el.howtoModal.classList.remove("hidden");
  }

  hideHowTo(): void {
    this.el.howtoModal.classList.add("hidden");
  }

  // ---------- Level select ----------

  showLevelSelect(levels: { title: string; par: number }[]): void {
    this.el.levelGrid.innerHTML = "";
    levels.forEach((level, index) => {
      const card = document.createElement("button");
      card.className = "level-card-item";
      card.innerHTML = `
        <span class="level-card-no">${index + 1}</span>
        <span class="level-card-title">${escapeHtml(level.title)}</span>
        <span class="level-card-par">Par ${level.par}</span>
      `;
      card.addEventListener("click", () => this.onLevelSelect?.(index));
      this.el.levelGrid.appendChild(card);
    });
    this.el.levelSelectModal.classList.remove("hidden");
  }

  hideLevelSelect(): void {
    this.el.levelSelectModal.classList.add("hidden");
  }

  // ---------- HUD ----------

  showHUD(par: number): void {
    this.el.hud.classList.remove("hidden");
    this.el.hudPar.textContent = `Par ${par}`;
    this.setStrokes(0);
  }

  hideHUD(): void {
    this.el.hud.classList.add("hidden");
  }

  setStrokes(n: number): void {
    this.el.hudStrokes.textContent = `Strokes: ${n}`;
  }

  setWrongWay(visible: boolean): void {
    this.el.hudWrongWay.classList.toggle("hidden", !visible);
  }

  setHint(text: string | null): void {
    if (text === null) {
      this.el.hudHint.style.opacity = "0";
    } else {
      this.el.hudHint.textContent = text;
      this.el.hudHint.style.opacity = "1";
    }
  }

  // ---------- Win modal ----------

  private lastShareText = "";

  showWin(data: {
    score: number;
    par: number;
    best: number | null;
    isNewBest: boolean;
    completions: number;
    holeNumber: number;
    drawMinimap: ((canvas: HTMLCanvasElement) => void) | null;
  }): void {
    const { score, par, best, isNewBest, completions, holeNumber, drawMinimap } = data;

    this.el.winParCorner.textContent = `Par: ${par}`;
    this.el.winScore.textContent = `${score}`;

    const diff = score - par;
    this.el.winDiff.textContent = diff === 0 ? "±0" : diff > 0 ? `+${diff}` : `${diff}`;
    this.el.winDiff.className = "win-diff " + (diff < 0 ? "under" : diff > 0 ? "over" : "even");

    this.el.winBestLine.textContent = isNewBest
      ? "★ New personal best!"
      : best !== null
        ? `Personal best: ${best}`
        : "";
    this.el.winSubLine.textContent =
      completions <= 1
        ? "You reached the summit"
        : `You've finished this hole ${completions} times`;

    if (drawMinimap) drawMinimap(this.el.winMap);

    this.el.winShare.textContent = "📋 Share Score";
    this.lastShareText = `Skyline Golf — Hole ${holeNumber}: ${score} strokes (par ${par}) ⛳`;

    this.el.winModal.classList.remove("hidden");
    this.startCountdown();
  }

  hideWin(): void {
    this.el.winModal.classList.add("hidden");
    this.stopCountdown();
  }

  /** "New hole in HH:MM:SS" — ticks down to local midnight. */
  private startCountdown(): void {
    this.stopCountdown();
    const tick = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const ms = midnight.getTime() - now.getTime();
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      const pad = (n: number) => String(n).padStart(2, "0");
      this.el.winCountdown.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    };
    tick();
    this.countdownTimer = window.setInterval(tick, 1000);
  }

  private stopCountdown(): void {
    if (this.countdownTimer !== null) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private async shareScore(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.lastShareText);
      this.el.winShare.textContent = "Copied!";
    } catch {
      // Clipboard unavailable (permissions / non-secure context)
      this.el.winShare.textContent = this.lastShareText;
    }
    setTimeout(() => {
      this.el.winShare.textContent = "Share";
    }, 1800);
  }
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing UI element #${id}`);
  return el;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
