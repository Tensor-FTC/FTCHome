/**
 * The FTC Home mark, as geometry.
 *
 * A house with cubes and game balls coming out of the chimney.
 *
 * Everything is built from **one projection function**. The first version of
 * this file placed each face by hand, and hand-placed faces do not meet: edges
 * missed each other by a fraction, the gaps between planes read as cracks, and
 * the whole thing looked misaligned because it was. Here every vertex comes out
 * of `P(u, v, z)`, so shared edges are shared exactly, by construction.
 *
 * The separations between faces are drawn as lines *in the tile colour on top
 * of a solid silhouette*, rather than by shrinking each face away from its
 * neighbours. Same reason: a gap you draw is a gap you control, and the
 * silhouette underneath stays a single solid shape at any size.
 *
 * `scripts/generate-icons.mjs` renders this to the favicon, the PNG app icons
 * and `src/components/brandArt.ts`. Nothing here is transcribed by hand
 * anywhere else — run `npm run icons` after changing it.
 */

export const BOX = 64
/** Corner radius of the lime tile, as a fraction of its edge. */
export const TILE_RADIUS = 0.24

/** The brand lime, sampled from the supplied logo. */
export const LIME = '#c6e84e'
export const INK = '#0b0e10'

/** Width of the drawn separations between faces, in final units. */
export const SEAM = 0.85

const r2 = (n) => Math.round(n * 100) / 100

// ── projection ──────────────────────────────────────────────

/**
 * Three-quarter view. `u` recedes to the right and up, `v` to the left and up,
 * `z` is height. The near vertical corner of the house is the origin.
 */
const KX = 0.866
/**
 * How steeply depth recedes. Every unit further back also raises the ridge on
 * screen, so a steep value forces the chimney to be absurdly tall just to clear
 * a roof that is climbing away from it. 0.3 keeps the house readably solid
 * while leaving the chimney room to be a chimney.
 */
const KY = 0.3
const P = (u, v, z) => [(u - v) * KX, -(u + v) * KY - z]

// ── the house ───────────────────────────────────────────────

const W = 15 // front-left wall, across the gable
const D = 8 // right wall, along the ridge
const H = 12 // wall height
const OVER = 2.6 // roof overhang past the walls
const RISE = 11 // eave to ridge

// Walls, as one silhouette. Both visible faces share the near corner exactly.
const walls = [
  P(0, W, 0),
  P(0, 0, 0),
  P(D, 0, 0),
  P(D, 0, H),
  P(0, 0, H),
  P(0, W, H),
]
// Roof. The gable end faces the viewer, so the peak and both slopes are visible,
// and the plane over the right wall runs back from the ridge.
const eaveNearRight = P(-OVER, -OVER, H)
const eaveNearLeft = P(-OVER, W + OVER, H)
const eaveFarLeft = P(D + OVER, W + OVER, H)
const eaveFarRight = P(D + OVER, -OVER, H)
const ridgeFront = P(-OVER, W / 2, H + RISE)
const ridgeBack = P(D + OVER, W / 2, H + RISE)

const roof = [eaveNearLeft, ridgeFront, ridgeBack, eaveFarRight, eaveNearRight]

/**
 * The vertical corner where the two walls meet, stopping at the eave.
 *
 * Taken from `eaveNearRight` rather than derived: it sits at the same x as the
 * wall corner, so it *is* the end of this line. Computing the height instead
 * got the sign wrong and ran the seam up through the roof.
 */
const wallSeam = [P(0, 0, 0), eaveNearRight]
/** Where the gable end folds into the roof plane over the right wall. */
const roofSeam = [eaveNearRight, ridgeFront]
/** The eave: what separates the roof from the walls underneath it. */
const eaveSeam = [eaveNearLeft, eaveNearRight, eaveFarRight]

/** Height of the roof plane over the right wall at a given `v`. */
const roofZ = (v) => H + (RISE * (v + OVER)) / (W / 2 + OVER)

/**
 * Chimney: a box standing on the roof plane, close to the ridge and toward the
 * front of it. High `v` puts its base high on the slope, which is what lets it
 * be a normal stubby chimney rather than a tower.
 */
const CH_U0 = 1.6
const CH_U1 = CH_U0 + 3.2
const CH_V0 = 4.6
const CH_V1 = 7.4 // stops just short of the ridge, so it stands on one plane
/** Measured from the roof it stands on, not from the ridge it does not touch. */
const CH_TOP = roofZ(CH_V0) + 7

/**
 * The body runs well below the roof so the two merge into one black mass with
 * no gap. That is safe because both are ink — but the *seam* is not, so it has
 * to stop exactly where the chimney meets the roof, or a lime line runs down
 * over the roof and reads as a crack.
 */
const CH_BOT = roofZ(CH_V0) - 1.6

const chimney = [
  P(CH_U0, CH_V1, CH_TOP),
  P(CH_U1, CH_V1, CH_TOP),
  P(CH_U1, CH_V0, CH_TOP),
  P(CH_U1, CH_V0, CH_BOT),
  P(CH_U0, CH_V0, CH_BOT),
  P(CH_U0, CH_V1, CH_BOT),
]
/**
 * Only the top face is seamed. The chimney's vertical corner has no visible
 * end — it disappears into a roof of the same colour — so a seam drawn down it
 * stops in the middle of a black shape and reads as a scratch.
 */
const chimneySeams = [
  [P(CH_U0, CH_V0, CH_TOP), P(CH_U1, CH_V0, CH_TOP)],
  [P(CH_U0, CH_V0, CH_TOP), P(CH_U0, CH_V1, CH_TOP)],
]
/**
 * The point the flying objects are arranged around: just clear of the chimney's
 * mouth. There is no drawn trail — a stroke thin enough not to dominate the
 * mark is one that reads as a scratch at icon size, and the objects convey
 * "out of the chimney" by where they sit.
 */
const CHIMNEY_MOUTH = (() => {
  const [x, y] = P((CH_U0 + CH_U1) / 2, (CH_V0 + CH_V1) / 2, CH_TOP)
  return [x, y - 1.1]
})()

// Window: four panes on the front-left wall, cut out of it.
function pane(v0, z0, w, h) {
  return [P(0, v0, z0), P(0, v0 + w, z0), P(0, v0 + w, z0 + h), P(0, v0, z0 + h)]
}
const PANE_W = 3.1
const PANE_H = 2.7
const panes = [
  pane(4.4, 6.4, PANE_W, PANE_H),
  pane(8.3, 6.4, PANE_W, PANE_H),
  pane(4.4, 2.9, PANE_W, PANE_H),
  pane(8.3, 2.9, PANE_W, PANE_H),
]

/**
 * Door: cut out of the right wall, standing on the floor.
 *
 * Kept well clear of both wall edges. Ending it a fraction from the corner left
 * a hairline of wall that read as a detached slit rather than as a door frame.
 */
const DOOR_U0 = 3.0
const DOOR_U1 = 5.8
const door = [P(DOOR_U0, 0, 0), P(DOOR_U1, 0, 0), P(DOOR_U1, 0, 6.6), P(DOOR_U0, 0, 6.6)]
const doorHandle = { at: P(DOOR_U0 + 0.7, 0, 3.2), r: 0.42 }

// ── what comes out of it ────────────────────────────────────

/**
 * A game ball: perforated, the way an FTC ball is. Positioned relative to the
 * chimney mouth so the whole group moves with the house.
 */
function ball(dx, dy, r, rotation) {
  const cx = CHIMNEY_MOUTH[0] + dx
  const cy = CHIMNEY_MOUTH[1] + dy
  const holeR = r * 0.175
  const ring = Array.from({ length: 6 }, (_, i) => {
    const t = rotation + (i / 6) * Math.PI * 2
    return { at: [cx + Math.cos(t) * r * 0.54, cy + Math.sin(t) * r * 0.54], r: holeR }
  })
  return { at: [cx, cy], r, holes: [{ at: [cx, cy], r: holeR }, ...ring] }
}

/**
 * A cube, on true isometric axes rather than the house's.
 *
 * The house is deliberately shallow so its ridge does not climb away from the
 * chimney; borrowing that for a small free-floating cube squashed the top face
 * into a sliver and made every cube look like a bent card.
 */
const CUBE_KY = 0.5
function cube(dx, dy, w) {
  const cx = CHIMNEY_MOUTH[0] + dx
  const cy = CHIMNEY_MOUTH[1] + dy
  const a = w * KX
  const b = w * CUBE_KY
  const T = [cx, cy - w]
  const R = [cx + a, cy - w + b]
  const BR = [cx + a, cy + b]
  const B = [cx, cy + w]
  const BL = [cx - a, cy + b]
  const L = [cx - a, cy - w + b]
  const M = [cx, cy]
  return {
    outline: [T, R, BR, B, BL, L],
    seams: [
      [M, L],
      [M, R],
      [M, B],
    ],
  }
}

/** Sizes and offsets follow the supplied logo: a big ball high right, cubes between. */
const balls = [ball(6.0, -14.4, 4.2, 0.2), ball(-9.6, -6.2, 3.2, 0.9), ball(9.8, -2.2, 2.6, 1.7)]
const cubes = [cube(-2.8, -12.6, 2.8), cube(12.0, -8.4, 3.0), cube(6.8, -6.6, 1.7)]


// ── fit everything into the box ─────────────────────────────

const MARGIN = 5.5

/** Every point that has to end up inside the box, including stroke reach. */
function allPoints() {
  const pts = [
    ...walls,
    ...roof,
    ...chimney,
    ...panes.flat(),
    ...door,
    ...cubes.flatMap((c) => c.outline),
  ]
  for (const b of balls) {
    pts.push([b.at[0] - b.r, b.at[1] - b.r], [b.at[0] + b.r, b.at[1] + b.r])
  }
  return pts
}

const pts = allPoints()
const minX = Math.min(...pts.map((p) => p[0]))
const maxX = Math.max(...pts.map((p) => p[0]))
const minY = Math.min(...pts.map((p) => p[1]))
const maxY = Math.max(...pts.map((p) => p[1]))
const SCALE = (BOX - MARGIN * 2) / Math.max(maxX - minX, maxY - minY)
const OFF_X = (BOX - (maxX - minX) * SCALE) / 2 - minX * SCALE
const OFF_Y = (BOX - (maxY - minY) * SCALE) / 2 - minY * SCALE

const T = ([x, y]) => [r2(x * SCALE + OFF_X), r2(y * SCALE + OFF_Y)]
const TR = (r) => r2(r * SCALE)

// ── output shapes ───────────────────────────────────────────

function polyPath(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${T(p)[0]} ${T(p)[1]}`).join(' ') + ' Z'
}

function circlePath({ at, r }) {
  const [x, y] = T(at)
  const rad = TR(r)
  return `M${r2(x - rad)} ${y} a${rad} ${rad} 0 1 0 ${r2(rad * 2)} 0 a${rad} ${rad} 0 1 0 ${r2(-rad * 2)} 0 Z`
}

function linePath(points) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${T(p)[0]} ${T(p)[1]}`).join(' ')
}

/**
 * The solid silhouette. One black mass at any size, which is exactly what a
 * monochrome mask icon wants and what keeps the mark readable at 16px.
 */
export function solidPaths() {
  return [
    polyPath(walls),
    polyPath(roof),
    polyPath(chimney),
    ...cubes.map((c) => polyPath(c.outline)),
    ...balls.map((b) => polyPath(circleAsPoly(b))),
  ]
}

/** Balls as a path with their holes punched out, for the full-colour marks. */
function ballPath(b) {
  return [circlePath(b), ...b.holes.map(circlePath)].join(' ')
}

/** For the flat silhouette, a ball is just a disc — holes would fill in at 16px. */
function circleAsPoly(b) {
  return Array.from({ length: 40 }, (_, i) => {
    const t = (i / 40) * Math.PI * 2
    return [b.at[0] + Math.cos(t) * b.r, b.at[1] + Math.sin(t) * b.r]
  })
}

/** Everything drawn in ink. */
export function inkPaths() {
  return [
    polyPath(walls),
    polyPath(roof),
    polyPath(chimney),
    ...cubes.map((c) => polyPath(c.outline)),
    ...balls.map(ballPath),
  ]
}

/** Everything cut back out in the tile colour: seams, window and door. */
export function cutPaths() {
  return [...panes.map(polyPath), polyPath(door)]
}

/** Seam width scales with the shape: a cube fold is not a roof eave. */
export const CUBE_SEAM = 0.5

export function cutStrokes() {
  return [
    { d: linePath(eaveSeam), width: SEAM },
    { d: linePath(roofSeam), width: SEAM },
    { d: linePath(wallSeam), width: SEAM },
    ...chimneySeams.map((l) => ({ d: linePath(l), width: SEAM })),
    ...cubes.flatMap((c) => c.seams.map((l) => ({ d: linePath(l), width: CUBE_SEAM }))),
  ]
}

export function inkDots() {
  return [circlePath(doorHandle)]
}

export const SEAM_WIDTH = SEAM

/**
 * The mark as SVG. `tile` is the colour the seams are cut in — pass the tile
 * colour for the full mark, or omit it for a flat silhouette (mask icons,
 * anywhere the mark must survive as one shape).
 */
export function markSvgBody(ink, tile) {
  if (!tile) {
    return solidPaths()
      .map((d) => `<path d="${d}" fill="${ink}"/>`)
      .join('')
  }

  return [
    ...inkPaths().map((d) => `<path d="${d}" fill="${ink}" fill-rule="evenodd"/>`),
    ...cutPaths().map((d) => `<path d="${d}" fill="${tile}"/>`),
    ...cutStrokes().map(
      (s) =>
        `<path d="${s.d}" fill="none" stroke="${tile}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    ),
    ...inkDots().map((d) => `<path d="${d}" fill="${ink}"/>`),
  ].join('')
}

/**
 * The same geometry for the rasteriser: polygons, circles and polylines rather
 * than path strings. Kept here so the PNG icons cannot drift from the SVG.
 */
export function rasterShapes() {
  const poly = (points) => points.map(T)
  const disc = (c) => ({ at: T(c.at), r: TR(c.r) })
  return {
    ink: [
      { poly: poly(walls) },
      { poly: poly(roof) },
      { poly: poly(chimney) },
      ...cubes.map((c) => ({ poly: poly(c.outline) })),
      ...balls.map((b) => ({ disc: disc(b), holes: b.holes.map(disc) })),
    ],
    cuts: [...panes.map((p) => ({ poly: poly(p) })), { poly: poly(door) }],
    seams: [
      { line: poly(eaveSeam), width: SEAM },
      { line: poly(roofSeam), width: SEAM },
      { line: poly(wallSeam), width: SEAM },
      ...chimneySeams.map((l) => ({ line: poly(l), width: SEAM })),
      ...cubes.flatMap((c) => c.seams.map((l) => ({ line: poly(l), width: CUBE_SEAM }))),
    ],
    dots: [disc(doorHandle)],
  }
}
