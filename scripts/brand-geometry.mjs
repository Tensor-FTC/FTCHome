/**
 * The FTC Home mark, as geometry.
 *
 * A house with cubes and game balls tumbling out of the chimney: the two things
 * a season is made of, coming out of the place the team works. Drawn on a 64×64
 * box with an even ~10px margin.
 *
 * This module is the single source of truth. `scripts/generate-icons.mjs`
 * renders it to the favicon, the PNG app icons and `src/components/brandArt.ts`,
 * so the mark in the app, the tab and the home screen are literally the same
 * numbers. Nothing here is transcribed by hand anywhere else.
 */

export const BOX = 64
/** Corner radius of the lime tile, as a fraction of its edge. */
export const TILE_RADIUS = 0.24

/** The brand lime, sampled from the supplied logo. */
export const LIME = '#c6e84e'
export const INK = '#0b0e10'

const r2 = (n) => Math.round(n * 100) / 100

// ── primitives ──────────────────────────────────────────────

function polyPath(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${r2(x)} ${r2(y)}`).join(' ') + ' Z'
}

function circlePath(cx, cy, r) {
  const [x, y, rad] = [r2(cx), r2(cy), r2(r)]
  return `M${r2(x - rad)} ${y} a${rad} ${rad} 0 1 0 ${r2(rad * 2)} 0 a${rad} ${rad} 0 1 0 ${r2(-rad * 2)} 0 Z`
}

/** A circle as a polygon, for the scan-converting rasteriser. */
function circlePoly(cx, cy, r, steps = 56) {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2
    return [cx + Math.cos(t) * r, cy + Math.sin(t) * r]
  })
}

/** Shrinks a face toward its own centroid, which is what draws the hairline folds. */
function inset(points, factor) {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length
  return points.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor])
}

// ── the house ───────────────────────────────────────────────

/**
 * Three-quarter view. One consistent projection: the front wall recedes to the
 * left and up, the right wall to the right and up, so every edge that should be
 * parallel is.
 */
const NEAR_X = 35.8 // the vertical corner nearest the viewer
const WALL_L = 14.3
const WALL_R = 45.6
const WALL_TOP_NEAR = 49.8
const WALL_BOT_NEAR = 61.0
/** How much a wall rises across its own width, from the near corner outward. */
const RISE_L = 2.8
const RISE_R = 2.4

const frontWall = [
  [WALL_L, WALL_TOP_NEAR - RISE_L],
  [NEAR_X, WALL_TOP_NEAR],
  [NEAR_X, WALL_BOT_NEAR],
  [WALL_L, WALL_BOT_NEAR - RISE_L],
]

const rightWall = [
  [NEAR_X, WALL_TOP_NEAR],
  [WALL_R, WALL_TOP_NEAR - RISE_R],
  [WALL_R, WALL_BOT_NEAR - RISE_R],
  [NEAR_X, WALL_BOT_NEAR],
]

/** Cut out of the right wall, so the door is the background showing through. */
const door = [
  [39.8, 54.8],
  [43.1, 54.0],
  [43.1, 59.22],
  [39.8, 60.02],
]
const doorHandle = [40.7, 57.4, 0.45]

/** Four panes on the front wall, skewed onto the same plane as the wall. */
const PANE_SLOPE = -RISE_L / (NEAR_X - WALL_L)
function pane(x, y, w, h) {
  return [
    [x, y],
    [x + w, y + PANE_SLOPE * w],
    [x + w, y + h + PANE_SLOPE * w],
    [x, y + h],
  ]
}
const PANE_W = 3.5
const PANE_H = 2.8
const panes = [
  pane(18.6, 51.1, PANE_W, PANE_H),
  pane(23.0, 51.1 + PANE_SLOPE * 4.4, PANE_W, PANE_H),
  pane(18.6, 54.6, PANE_W, PANE_H),
  pane(23.0, 54.6 + PANE_SLOPE * 4.4, PANE_W, PANE_H),
]

/**
 * The roof, in two planes with a hairline between them. Overhangs the walls on
 * both sides — the eave is most of what makes a shape read as a house at 16px.
 */
const PEAK = [23.6, 29.6]

/**
 * Two planes meeting at a fold, with the peak belonging to the left one so it
 * stays a single sharp point rather than splitting into two spikes.
 */
const roofFront = [[9.9, 46.0], PEAK, [34.0, 47.9]]
const roofRight = [
  [25.4, 32.6],
  [49.2, 45.6],
  [35.3, 47.9],
]

/** Rises out of the right plane, just clear of the peak. */
const chimney = [
  [34.2, 29.4],
  [38.8, 27.6],
  [38.8, 38.6],
  [34.2, 40.3],
]

// ── what comes out of it ────────────────────────────────────

/**
 * A game ball: perforated, the way an FTC ball is. Holes are cut with even-odd
 * rather than painted in the tile colour, so the mark still works on any
 * background.
 */
function ball(cx, cy, r, rotation) {
  const holeR = r * 0.225
  const ring = Array.from({ length: 6 }, (_, i) => {
    const t = rotation + (i / 6) * Math.PI * 2
    return [cx + Math.cos(t) * r * 0.58, cy + Math.sin(t) * r * 0.58, holeR]
  })
  return { cx, cy, r, holes: [[cx, cy, holeR], ...ring] }
}

/** An isometric cube: three faces, each pulled off the others by a hairline. */
function cube(cx, cy, w) {
  const a = w * 0.866
  const b = w * 0.5
  const T = [cx, cy - w]
  const R = [cx + a, cy - b]
  const BR = [cx + a, cy + b]
  const B = [cx, cy + w]
  const BL = [cx - a, cy + b]
  const L = [cx - a, cy - b]
  const M = [cx, cy]
  return [
    inset([T, R, M, L], 0.9),
    inset([L, M, B, BL], 0.9),
    inset([M, R, BR, B], 0.9),
  ]
}

const balls = [
  ball(45.0, 7.3, 4.3, 0.2),
  ball(28.7, 21.6, 3.4, 0.9),
  ball(48.2, 28.1, 2.9, 1.7),
]

const cubes = [cube(34.2, 10.8, 3.1), cube(51.1, 17.3, 3.4), cube(43.3, 21.3, 1.9)]

/**
 * The trails. Three strokes, not a puff of smoke: the point is that things are
 * being launched out of the workshop, not that something is burning.
 */
export const TRAILS = [
  'M35.4 28.7 C33.7 24.9 32.1 21.9 30.7 19.6',
  'M36.9 28.1 C36.9 24.2 36.8 20.9 36.6 18.1',
  'M38.3 27.6 C40.2 25.6 41.9 24.2 43.6 23.2',
]
export const TRAIL_WIDTH = 0.85

// ── assembled ───────────────────────────────────────────────

/** Every filled shape, in paint order. `holes` are cut with even-odd. */
export const SHAPES = [
  { outer: frontWall, holes: [], stroke: 1.7 },
  { outer: rightWall, holes: [door] },
  { outer: circlePoly(...doorHandle), holes: [] },
  ...panes.map((p) => ({ outer: p, holes: [] })),
  { outer: chimney, holes: [] },
  { outer: roofFront, holes: [] },
  { outer: roofRight, holes: [] },
  ...cubes.flat().map((f) => ({ outer: f, holes: [] })),
  ...balls.map((b) => ({
    outer: circlePoly(b.cx, b.cy, b.r),
    holes: b.holes.map(([hx, hy, hr]) => circlePoly(hx, hy, hr, 20)),
  })),
]

/** The same shapes as SVG path data. */
export function pathData() {
  return {
    /** Stroked, because the front wall is an outline with the tile showing through. */
    outlined: [{ d: polyPath(frontWall), width: 1.7 }],
    filled: [
      polyPath(rightWall) + ' ' + polyPath(door),
      circlePath(...doorHandle),
      ...panes.map(polyPath),
      polyPath(chimney),
      polyPath(roofFront),
      polyPath(roofRight),
      ...cubes.flat().map(polyPath),
      ...balls.map(
        (b) => circlePath(b.cx, b.cy, b.r) + ' ' + b.holes.map(([hx, hy, hr]) => circlePath(hx, hy, hr)).join(' '),
      ),
    ],
  }
}

/** The mark on its own, for embedding anywhere. `ink` may be `currentColor`. */
export function markSvgBody(ink) {
  const { outlined, filled } = pathData()
  const parts = [
    ...outlined.map(
      (o) => `<path d="${o.d}" fill="none" stroke="${ink}" stroke-width="${o.width}" stroke-linejoin="round"/>`,
    ),
    ...filled.map((d) => `<path d="${d}" fill="${ink}" fill-rule="evenodd"/>`),
    ...TRAILS.map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${TRAIL_WIDTH}" stroke-linecap="round"/>`,
    ),
  ]
  return parts.join('')
}
