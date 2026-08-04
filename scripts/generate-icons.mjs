/**
 * Rasterises the FTC Home mark to PNG app icons.
 *
 * Deliberately dependency-free: it scan-converts the same geometry the SVG uses
 * and encodes the PNG with node's built-in zlib, so `npm run build` never needs
 * a native image toolchain. Run it after editing public/brand/logo.svg.
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const LIME = [0xc8, 0xf7, 0x51]
const DARK = [0x0b, 0x0e, 0x10]

/** The mark, in a 78×78 design box. Same numbers as public/brand/logo.svg. */
const Y = 3
const ROOF = [
  [39, 4],
  [77, 41],
  [66, 41],
  [39, 16],
  [12, 41],
  [1, 41],
].map(([x, y]) => [x, y + Y])
const CHIMNEY = rect(50, 4 + Y, 9, 26)
const BODY = rect(16, 41 + Y, 46, 27)
const WINDOWS = [
  rect(28, 47 + Y, 9, 9),
  rect(41, 47 + Y, 9, 9),
  rect(28, 58 + Y, 9, 9),
  rect(41, 58 + Y, 9, 9),
]

function rect(x, y, w, h) {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
}

/** Even-odd point-in-polygon. */
function inPoly(poly, px, py) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function inRoundedSquare(px, py, size, r) {
  if (px < 0 || py < 0 || px > size || py > size) return false
  const cx = Math.min(Math.max(px, r), size - r)
  const cy = Math.min(Math.max(py, r), size - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

/**
 * @param {number} size output edge in px
 * @param {boolean} maskable pad the mark into the safe zone for maskable icons
 */
function render(size, maskable) {
  const SS = 4 // supersampling factor, for edge quality at 192px
  const px = new Uint8Array(size * size * 4)
  const scale = size / 78
  // Maskable icons get cropped to a circle by some launchers; keep the mark
  // inside the 80% safe zone so the roof never loses its peak.
  const inset = maskable ? 0.8 : 1
  const markScale = scale * inset
  const off = (size - 78 * markScale) / 2

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
          // background plate, in output space
          const bgX = fx / scale
          const bgY = fy / scale
          let c = null
          if (inRoundedSquare(bgX, bgY, 78, 18)) c = LIME
          // mark, in mark space
          const mx = (fx - off) / markScale
          const my = (fy - off) / markScale
          if (c) {
            if (inPoly(ROOF, mx, my) || inPoly(CHIMNEY, mx, my) || inPoly(BODY, mx, my)) c = DARK
            if (WINDOWS.some((w) => inPoly(w, mx, my))) c = LIME
          }
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
  // one filter byte (0 = None) per scanline
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
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

const outDir = resolve(ROOT, 'public/brand')
mkdirSync(outDir, { recursive: true })
for (const [size, maskable, name] of [
  [192, false, 'icon-192.png'],
  [512, false, 'icon-512.png'],
  [180, false, 'apple-touch-icon.png'],
]) {
  const file = resolve(outDir, name)
  writeFileSync(file, encodePng(size, render(size, maskable)))
  console.log('wrote', file)
}
