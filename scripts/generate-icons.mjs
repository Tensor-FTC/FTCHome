/**
 * Renders the FTC Home mark to every form the app ships it in.
 *
 * Deliberately dependency-free: it scan-converts the same geometry the SVG uses
 * and encodes the PNG with node's built-in zlib, so `npm run build` never needs
 * a native image toolchain.
 *
 *   node scripts/generate-icons.mjs
 *
 * Writes public/favicon.svg, public/brand/*.svg, the PNG icons, and
 * src/components/brandArt.ts — everything downstream of scripts/brand-geometry.mjs.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BOX,
  INK,
  LIME,
  TILE_RADIUS,
  cutPaths,
  cutStrokes,
  inkDots,
  inkPaths,
  markSvgBody,
  rasterShapes,
  solidPaths,
  SEAM_WIDTH,
} from './brand-geometry.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]
const LIME_RGB = hex(LIME)
const INK_RGB = hex(INK)

// ── geometry helpers for the rasteriser ─────────────────────

function inPoly(poly, px, py) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const inDisc = (c, px, py) => (px - c.at[0]) ** 2 + (py - c.at[1]) ** 2 <= c.r * c.r

/** Distance from a point to a segment — how the seams and trails get width. */
function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function nearPolyline(points, px, py, width) {
  for (let i = 0; i + 1 < points.length; i++) {
    if (distToSegment(px, py, points[i], points[i + 1]) <= width / 2) return true
  }
  return false
}

const SHAPES = rasterShapes()

/**
 * Bounding boxes, computed once. Without them the inner loop walks every vertex
 * of every shape for all four million supersamples of a 512px icon, which turns
 * a build step into a coffee break.
 */
function bbox(points, pad = 0) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad]
}
const discBox = (c, pad = 0) => [c.at[0] - c.r - pad, c.at[1] - c.r - pad, c.at[0] + c.r + pad, c.at[1] + c.r + pad]
const within = (box, x, y) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]

const INK_HIT = SHAPES.ink.map((s) => ({ ...s, box: s.poly ? bbox(s.poly) : discBox(s.disc) }))
const CUT_HIT = SHAPES.cuts.map((s) => ({ ...s, box: bbox(s.poly) }))
const SEAM_HIT = SHAPES.seams.map((s) => ({ ...s, box: bbox(s.line, s.width) }))
const DOT_HIT = SHAPES.dots.map((d) => ({ d, box: discBox(d) }))

/**
 * Paint order, matching the SVG exactly: ink, then the tile colour cut back out
 * for the window, door and every seam, then the door handle on top in ink again.
 */
function inkAt(mx, my) {
  for (const d of DOT_HIT) if (within(d.box, mx, my) && inDisc(d.d, mx, my)) return true
  for (const s of SEAM_HIT) {
    if (within(s.box, mx, my) && nearPolyline(s.line, mx, my, s.width)) return false
  }
  for (const c of CUT_HIT) if (within(c.box, mx, my) && inPoly(c.poly, mx, my)) return false
  for (const s of INK_HIT) {
    if (!within(s.box, mx, my)) continue
    if (s.poly) {
      if (inPoly(s.poly, mx, my)) return true
      continue
    }
    if (!inDisc(s.disc, mx, my)) continue
    // Holes are ellipses, so they are polygons rather than discs.
    if (s.holes.some((h) => inPoly(h, mx, my))) return false
    return true
  }
  return false
}

function inRoundedSquare(px, py, size, r) {
  if (px < 0 || py < 0 || px > size || py > size) return false
  const cx = Math.min(Math.max(px, r), size - r)
  const cy = Math.min(Math.max(py, r), size - r)
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
}

/**
 * @param {number} size output edge in px
 * @param {boolean} maskable pad the mark into the safe zone for maskable icons
 */
function render(size, maskable) {
  const SS = 4 // supersampling factor, for edge quality at 192px
  const px = new Uint8Array(size * size * 4)
  const scale = size / BOX
  // Maskable icons get cropped to a circle by some launchers; keep the mark
  // inside the 80% safe zone so the roof never loses its peak.
  const inset = maskable ? 0.8 : 1
  const markScale = scale * inset
  const off = (size - BOX * markScale) / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS
          const fy = y + (sy + 0.5) / SS
          let c = null
          if (inRoundedSquare(fx / scale, fy / scale, BOX, BOX * TILE_RADIUS)) c = LIME_RGB
          if (c && inkAt((fx - off) / markScale, (fy - off) / markScale)) c = INK_RGB
          if (c) {
            r += c[0]
            g += c[1]
            b += c[2]
            a += 255
          }
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      if (a > 0) {
        // un-premultiply so edges stay the right hue
        px[i] = Math.round(r / (a / 255))
        px[i + 1] = Math.round(g / (a / 255))
        px[i + 2] = Math.round(b / (a / 255))
      }
      px[i + 3] = Math.round(a / n)
    }
  }
  return px
}

// ── PNG encoding ────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: None
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── outputs ─────────────────────────────────────────────────

function tileSvg(size) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}" width="${size}" height="${size}">`,
    `<rect width="${BOX}" height="${BOX}" rx="${BOX * TILE_RADIUS}" fill="${LIME}"/>`,
    markSvgBody(INK, LIME),
    '</svg>',
  ].join('')
}

mkdirSync(resolve(ROOT, 'public/brand'), { recursive: true })

const wrote = []
function write(rel, content) {
  writeFileSync(resolve(ROOT, rel), content)
  wrote.push(rel)
}

write('public/favicon.svg', tileSvg(64))
write('public/brand/logo.svg', tileSvg(512))
write(
  'public/brand/mark.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}" width="512" height="512">${markSvgBody('currentColor')}</svg>`,
)

write(
  'src/components/brandArt.ts',
  [
    '// Generated by scripts/generate-icons.mjs — do not edit by hand.',
    '// Geometry lives in scripts/brand-geometry.mjs; run `npm run icons` after changing it.',
    '',
    `export const BRAND_BOX = ${BOX}`,
    `export const BRAND_LIME = '${LIME}'`,
    `export const BRAND_TILE_RADIUS = ${TILE_RADIUS}`,
    `export const BRAND_SEAM_WIDTH = ${SEAM_WIDTH}`,
    '',
    '/** Filled in ink. Balls carry their holes, so these need fill-rule="evenodd". */',
    `export const BRAND_INK: string[] = ${JSON.stringify(inkPaths(), null, 2)}`,
    '',
    '/** Filled in the tile colour, on top: the window panes and the door. */',
    `export const BRAND_CUTS: string[] = ${JSON.stringify(cutPaths(), null, 2)}`,
    '',
    '/** Stroked in the tile colour: the seams where one face meets another. */',
    `export const BRAND_SEAMS: { d: string; width: number }[] = ${JSON.stringify(cutStrokes(), null, 2)}`,
    '',
    '/** Back in ink, over the cuts: the door handle. */',
    `export const BRAND_DOTS: string[] = ${JSON.stringify(inkDots(), null, 2)}`,
    '',
    '/** One flat silhouette, for anywhere the mark must survive as a single shape. */',
    `export const BRAND_SOLID: string[] = ${JSON.stringify(solidPaths(), null, 2)}`,
    '',
  ].join('\n'),
)

for (const [size, maskable, name] of [
  [192, false, 'icon-192.png'],
  [512, false, 'icon-512.png'],
  [512, true, 'icon-maskable-512.png'],
  [180, false, 'apple-touch-icon.png'],
]) {
  write(`public/brand/${name}`, encodePng(size, render(size, maskable)))
}

for (const f of wrote) console.log('wrote', f)
