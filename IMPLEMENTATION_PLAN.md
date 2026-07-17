# Implementation Plan: Skyline Golf

> Working title — replace with final branding before launch.
> This document is written for the next implementing agent.

---

## 1. Project Goal

Build a browser-based vertical golf climbing game. The player drags the ball to aim, releases to shoot, and tries to reach the top of the course in as few strokes as possible. The game must feel smooth, support checkpoints, run on desktop and mobile, and ship as a single static site.

**Critical constraints:**
- Do not mention the original reference game name anywhere in code, comments, UI, or metadata.
- Do not include "clone" language in user-facing copy.
- Use the neutral working title "Skyline Golf" until final branding is chosen.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Rendering | **PixiJS v8** | Excellent 2D renderer, camera containers, particles, mobile-friendly. |
| Physics | **Rapier 2D** (`@dimforge/rapier2d-compat`) | Deterministic, supports CCD, sensors, convex slopes. |
| Build | **Vite** | Fast dev server, easy static output. |
| Language | **TypeScript** | Safer iteration. |
| State | Vanilla classes + small event bus | Keep game loop clean; avoid heavy state libraries. |
| Assets | Procedural Canvas drawings + optional tile atlas | Start without external art dependencies. |

---

## 3. Core Mechanics

### Coordinate Scale
- **Tile size:** 32 px.
- **Physics scale:** 50 px per physics unit.
- Therefore each tile is `32 / 50 = 0.64` physics units wide.

### Ball Physics
- Dynamic circle collider, radius `0.3` physics units (~15 px).
- Linear damping: `0.4`.
- Angular damping: `15`.
- Restitution: `0.86`.
- Friction: `0.1`.
- Enable CCD to prevent tunneling.
- Gravity: `(0, 33)` physics units/s².
- Run physics at **180 Hz** internally; game loop ticks at ~**135 FPS**.

### Aim / Shoot (Pull-Back Slingshot)
1. Pointer down on the ball starts drag **only** when the ball is nearly stopped and grounded.
2. Max drag length: `150 * scaleFactor` px.
3. Min drag length: `15 * scaleFactor` px.
4. Normalized power = `dragDistance / maxDrag`, clamped `[0, 1]`.
5. Final power = `power^1.2 * 150`.
   - The `1.2` exponent gives fine low-power control.
6. Rough tiles cap max drag to **50%** and power multiplier to **0.6**.
7. **Block** shots aimed downward more than **45°** below horizontal; show a "Wrong Way" hint.
8. Impulse = `(cosθ * power, sinθ * power) * 15 / physicsScale`.
9. Add a tiny upward nudge if aiming up while grounded.

### Trajectory Line
- Draw a dotted/gradient line from the ball opposite the drag direction.
- Color by power:
  - 0.0–0.4: green → yellow
  - 0.4–0.8: yellow → orange
  - 0.8–1.0: orange → red
- Clear line after release.

### Camera
- All gameplay objects live inside a Pixi `Container` named `world`.
- Default zoom = `window.innerHeight / 672`.
- While ball is moving: smoothly lerp scale toward default zoom and center the ball.
- During drag: zoom out slightly and re-center on the ball.
- When ball is stopped: clicking/dragging on empty ground pans the camera.

---

## 4. Tile System & Colliders

### Tile Types

| Tile | Example ID | Behavior |
|---|---|---|
| Empty | `0` | Nothing. |
| Spawn | `209` | Ball start position. If missing, use bottom-left solid tile. |
| Solid ground | `1` | Merged into rectangle/voxel colliders. |
| Ice | `103` | Solid, friction `0`. |
| Rough | `496–499` | Sensor; high damping + low restitution while inside; caps drag power. |
| Water | `176` | Sensor; after 500 ms reset to last checkpoint. |
| Slope | `169, 172, 173, 202, 273, 274` | Convex-hull polygon collider. |
| Checkpoint flag | `153` | Activates when ball is slow, grounded, and within 6 tiles horizontally on the flag's row. |
| Finish | `111–113, 154` | Win when ball is slow and grounded on it. |
| Bird / hazard | `11–18` | Kinematic circle that bobs; touch triggers reset after 400 ms. |

### Collider Generation

Implement `createMergedColliders(tilemap, width, height)`:
1. Scan rows/columns and merge contiguous same-type rectangles.
2. Add world boundary walls on all four edges.
3. Return `{x, y, width, height, type, tileId}`.
4. Build Rapier colliders from those rectangles.
5. Diagonal/slope tiles become convex-hull polygons.

### Grounded Detection

Each physics step, inspect contact normals. If any contact normal has `|y| > 0.5`, the ball is grounded.

---

## 5. Checkpoint & Reset System

- On level load, scan for all flag tiles (`153`) and store positions.
- Default order: highest Y first (top of map), then left-to-right.
- Optional `metadata.checkpointOrder` array overrides ordering.
- Track `highestCheckpoint` (the best flag reached).
- Press `C` or tap the UI button to teleport back to `highestCheckpoint`.
- On water / hazard / out-of-bounds: auto-return to `highestCheckpoint` after the specified delay.
- **Infuriating mode** removes all flag tiles from the map.

---

## 6. Score & Finish

- Each valid shot increments strokes for the current checkpoint section.
- `TotalScore` = sum of strokes across all checkpoint sections.
- Finish detection: ball is slow + grounded on a finish tile.
- Win screen shows:
  - Total strokes.
  - Par / target strokes.
  - Restart / share / next level buttons.
- For MVP, store the player's best score in `localStorage`.
- A backend for daily scores is out of scope for MVP.

---

## 7. Level Data Format

Use Tiled JSON export or a minimal custom JSON.

### Tiled-style format

```json
{
  "width": 20,
  "height": 40,
  "layers": [
    {
      "name": "terrain",
      "data": [1, 1, 0, ...]
    }
  ],
  "metadata": {
    "title": "Morning Climb",
    "creator": "Player",
    "par": 4,
    "checkpointOrder": [
      {"x": 5, "y": 35},
      {"x": 12, "y": 20}
    ]
  }
}
```

### Compressed/shared map variant

```json
{
  "width": 20,
  "height": 40,
  "tiles": [1, 1, 0, ...],
  "metadata": {...}
}
```

### Validation

- `width * height === tiles.length`.
- Contains at least one spawn tile (`209`) or defaults to bottom-left solid tile.

---

## 8. Architecture / File Structure

```
src/
  main.ts                 # Entry, Vite init, start screen wiring
  game/
    Game.ts               # Top-level controller, state machine
    GameLoop.ts           # Ticker, physics stepping
    InputManager.ts       # Pointer drag, camera pan, keyboard
    Camera.ts             # World container transform, zoom, follow
  physics/
    PhysicsWorld.ts       # Rapier world setup, gravity, step
    ColliderBuilder.ts    # Tilemap → colliders
    Ball.ts               # Ball body, visual, reset
  level/
    LevelLoader.ts        # Parse Tiled/compressed JSON
    Tilemap.ts            # Grid data + tile rendering
    CheckpointManager.ts  # Flag discovery and activation
    HazardManager.ts      # Water, rough, birds
  ui/
    StartScreen.ts
    GameplayHUD.ts        # Stroke count, par, checkpoint button
    WinModal.ts
    HowToPlayModal.ts
  effects/
    ParticleSystem.ts     # Dust, splash, leaves
    TrajectoryLine.ts
  utils/
    Vec2.ts
    Math.ts
    Events.ts
public/
  maps/
    level-1.json
    level-2.json
  fonts/
  textures/
    tiles.png (optional)
index.html
vite.config.ts
package.json
tsconfig.json
```

---

## 9. UI / Screen Flow

1. **Start Screen**
   - Title.
   - "Play Daily Hole" button.
   - "How to Play" button.
   - Toggle for "Infuriating Mode" (no checkpoints).

2. **How to Play Modal**
   - Drag and Shoot.
   - Climb to the Top.
   - Use Checkpoints.
   - "Got it!" button to start.

3. **Gameplay HUD**
   - Top-left: stroke count, par.
   - Top-right: menu / reset / checkpoint buttons.
   - Bottom: subtle drag instruction if idle.

4. **Win Modal**
   - Final score, par comparison, replay / next buttons.

---

## 10. Implementation Phases

### Phase 1 — MVP (playable single level)
- [ ] Vite + Pixi + Rapier setup.
- [ ] Load a hardcoded level JSON.
- [ ] Render tilemap.
- [ ] Build static colliders.
- [ ] Spawn ball.
- [ ] Drag-to-aim input.
- [ ] Shoot impulse.
- [ ] Camera follow.
- [ ] Win detection on finish tile.
- [ ] Stroke counter.

### Phase 2 — Checkpoint & reset
- [ ] Flag discovery and activation.
- [ ] Return-to-checkpoint (`C` key + UI button).
- [ ] Water / hazard reset.
- [ ] Infuriating mode toggle.

### Phase 3 — Polish
- [ ] Trajectory preview line.
- [ ] Particle effects (dust on bounce, water splash).
- [ ] Rough / ice physics changes.
- [ ] Slope colliders.
- [ ] Sound effects (optional).

### Phase 4 — Content & sharing
- [ ] Multiple levels, daily level selection.
- [ ] Level loader from `public/maps/`.
- [ ] LocalStorage best score.
- [ ] Share score as text.
- [ ] Map editor (optional, large scope).

---

## 11. Assets Needed

| Asset | Notes |
|---|---|
| Tile atlas | 16×16 or 32×32 tiles for ground, ice, water, rough, slopes, flag, finish, spawn. Can be generated via Canvas if no designer. |
| Ball | Drawn with Pixi Graphics (shadow, white sphere, highlight, dimples). |
| UI icons | Restart, checkpoint, menu, close. Use inline SVG. |
| Fonts | One rounded friendly font (e.g., Nunito or Baloo 2) from Google Fonts. |

---

## 12. Testing Checklist

- [ ] Ball can be dragged and released in all 360 directions.
- [ ] Power scales correctly from low-power tap to full drag.
- [ ] Ball collides with solids and bounces believably.
- [ ] Camera centers ball and does not jitter.
- [ ] Checkpoint activates only when slow + grounded + near flag row.
- [ ] `C` key returns to highest activated checkpoint.
- [ ] Water triggers reset after ~500 ms.
- [ ] Finish triggers win only when slow + grounded.
- [ ] Stroke count increments once per valid shot.
- [ ] Mobile touch works (no page scroll, single-finger drag).
- [ ] Infuriating mode removes checkpoints.

---

## 13. Notes for the Implementing Agent

- Prioritize **Phase 1** before anything else. A single playable level is the primary deliverable.
- Keep physics constants tunable (expose as a `PHYSICS_CONFIG` object) so feel can be iterated quickly.
- Use Pixi `Graphics` for placeholder art; do not wait on external assets.
- Make sure `touch-action: none` and `user-select: none` are set on the canvas to prevent mobile scrolling.
- Avoid referencing the original game name in git commits, file names, and comments.
