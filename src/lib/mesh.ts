/**
 * Mesh parsing for the CAD viewer.
 *
 * Deliberately dependency-free and format-honest. Teams upload whatever Fusion
 * gave them, and only some of that can be drawn in a browser at all:
 *
 *  - **STL** (binary and ASCII) and **OBJ** are triangle soup. Parsed here.
 *  - **STEP / IGES** are boundary representations. Turning one into triangles
 *    needs a real geometry kernel — OpenCascade compiled to wasm is roughly ten
 *    megabytes, which is not something to ship to a phone on venue wifi.
 *  - **.f3d / .f3z** are Fusion's own archives: a proprietary container holding
 *    a proprietary parametric model. Nothing outside Autodesk can open one, and
 *    saying so plainly is better than a viewer that silently shows nothing.
 *
 * The file is still stored and still syncs in every case. This only decides
 * whether we can draw it.
 */

export type MeshSupport = 'mesh' | 'kernel-required' | 'proprietary' | 'not-3d'

export interface Mesh {
  /** Flat xyz triples, three vertices per triangle. */
  positions: Float32Array
  /** Per-vertex normals, same length as positions. */
  normals: Float32Array
  triangles: number
  /** Axis-aligned bounds, used to frame the model. */
  min: [number, number, number]
  max: [number, number, number]
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/** What can be done with this file, before spending anything reading it. */
export function meshSupport(name: string): MeshSupport {
  const ext = extensionOf(name)
  if (ext === 'stl' || ext === 'obj') return 'mesh'
  if (ext === 'step' || ext === 'stp' || ext === 'iges' || ext === 'igs' || ext === 'sldprt') {
    return 'kernel-required'
  }
  if (ext === 'f3d' || ext === 'f3z') return 'proprietary'
  return 'not-3d'
}

/** Why a file cannot be drawn, and what to export instead. */
export function meshAdvice(name: string): string {
  switch (meshSupport(name)) {
    case 'proprietary':
      return 'Fusion archives (.f3d, .f3z) are a closed format — only Fusion 360 can open one. In Fusion, right-click the body or component and choose Save as Mesh (STL or OBJ) to get something the whole team can spin here on a phone.'
    case 'kernel-required':
      return 'STEP and IGES describe exact surfaces rather than triangles, and converting one in the browser would mean shipping a ten-megabyte geometry kernel. Export a mesh alongside it: in Fusion, File → Export → STL, or right-click the body → Save as Mesh.'
    case 'not-3d':
      return 'This is not a 3D model file. Drawings (.dxf, .dwg) and other documents are stored and synced but there is nothing to render.'
    default:
      return ''
  }
}

/**
 * `Blob.arrayBuffer` and `Blob.text` are missing on Safari before 14, which is
 * still on plenty of school iPads. FileReader is the universal path.
 */
function readBlob(blob: Blob, as: 'buffer'): Promise<ArrayBuffer>
function readBlob(blob: Blob, as: 'text'): Promise<string>
function readBlob(blob: Blob, as: 'buffer' | 'text'): Promise<ArrayBuffer | string> {
  if (as === 'buffer' && typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  if (as === 'text' && typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer | string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file'))
    if (as === 'buffer') reader.readAsArrayBuffer(blob)
    else reader.readAsText(blob)
  })
}

// ── STL ─────────────────────────────────────────────────────

/**
 * Binary STL is 80 bytes of header, a triangle count, then 50 bytes each. ASCII
 * STL is text. The header is not a reliable discriminator — plenty of binary
 * files begin with "solid" — so the length is checked instead, which is exact.
 */
function isBinaryStl(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 84) return false
  const triangles = new DataView(buffer).getUint32(80, true)
  return 84 + triangles * 50 === buffer.byteLength
}

function parseBinaryStl(buffer: ArrayBuffer): Mesh {
  const view = new DataView(buffer)
  const count = view.getUint32(80, true)
  const positions = new Float32Array(count * 9)
  const normals = new Float32Array(count * 9)

  let offset = 84
  for (let i = 0; i < count; i++) {
    const nx = view.getFloat32(offset, true)
    const ny = view.getFloat32(offset + 4, true)
    const nz = view.getFloat32(offset + 8, true)
    offset += 12
    for (let v = 0; v < 3; v++) {
      const at = i * 9 + v * 3
      positions[at] = view.getFloat32(offset, true)
      positions[at + 1] = view.getFloat32(offset + 4, true)
      positions[at + 2] = view.getFloat32(offset + 8, true)
      normals[at] = nx
      normals[at + 1] = ny
      normals[at + 2] = nz
      offset += 12
    }
    offset += 2 // attribute byte count, unused
  }
  return finish(positions, normals, count)
}

function parseAsciiStl(text: string): Mesh {
  const positions: number[] = []
  const normals: number[] = []
  let normal: [number, number, number] = [0, 0, 1]

  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts[0] === 'facet' && parts[1] === 'normal') {
      normal = [Number(parts[2]) || 0, Number(parts[3]) || 0, Number(parts[4]) || 0]
    } else if (parts[0] === 'vertex') {
      positions.push(Number(parts[1]) || 0, Number(parts[2]) || 0, Number(parts[3]) || 0)
      normals.push(...normal)
    }
  }
  return finish(new Float32Array(positions), new Float32Array(normals), positions.length / 9)
}

// ── OBJ ─────────────────────────────────────────────────────

/**
 * Only `v`, `vn` and `f` are read. Materials, texture coordinates, smoothing
 * groups and curves are all irrelevant to "does the bracket look right", and
 * ignoring them keeps this small enough to read.
 */
function parseObj(text: string): Mesh {
  const verts: number[] = []
  const vnorms: number[] = []
  const positions: number[] = []
  const normals: number[] = []

  /** OBJ indices are 1-based, and negative means "counting back from the end". */
  const resolve = (raw: string, length: number): number => {
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) return -1
    return n > 0 ? n - 1 : length / 3 + n
  }

  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts[0] === 'v') verts.push(Number(parts[1]) || 0, Number(parts[2]) || 0, Number(parts[3]) || 0)
    else if (parts[0] === 'vn') {
      vnorms.push(Number(parts[1]) || 0, Number(parts[2]) || 0, Number(parts[3]) || 0)
    } else if (parts[0] === 'f') {
      const corners = parts.slice(1).map((token) => token.split('/'))
      // Fan-triangulate, so quads and n-gons both work.
      for (let i = 1; i + 1 < corners.length; i++) {
        for (const corner of [corners[0], corners[i], corners[i + 1]]) {
          const vi = resolve(corner[0], verts.length)
          if (vi < 0) continue
          positions.push(verts[vi * 3] ?? 0, verts[vi * 3 + 1] ?? 0, verts[vi * 3 + 2] ?? 0)
          const ni = corner[2] ? resolve(corner[2], vnorms.length) : -1
          if (ni >= 0) normals.push(vnorms[ni * 3] ?? 0, vnorms[ni * 3 + 1] ?? 0, vnorms[ni * 3 + 2] ?? 0)
          else normals.push(0, 0, 0)
        }
      }
    }
  }
  return finish(new Float32Array(positions), new Float32Array(normals), positions.length / 9)
}

// ── shared ──────────────────────────────────────────────────

/** Bounds, plus face normals for anything the file did not supply. */
function finish(positions: Float32Array, normals: Float32Array, triangles: number): Mesh {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]

  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[i + axis]
      if (value < min[axis]) min[axis] = value
      if (value > max[axis]) max[axis] = value
    }
  }

  for (let t = 0; t < triangles; t++) {
    const at = t * 9
    if (normals[at] || normals[at + 1] || normals[at + 2]) continue
    // Right-hand rule across the triangle's own edges.
    const ax = positions[at + 3] - positions[at]
    const ay = positions[at + 4] - positions[at + 1]
    const az = positions[at + 5] - positions[at + 2]
    const bx = positions[at + 6] - positions[at]
    const by = positions[at + 7] - positions[at + 1]
    const bz = positions[at + 8] - positions[at + 2]
    let nx = ay * bz - az * by
    let ny = az * bx - ax * bz
    let nz = ax * by - ay * bx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len
    ny /= len
    nz /= len
    for (let v = 0; v < 3; v++) {
      normals[at + v * 3] = nx
      normals[at + v * 3 + 1] = ny
      normals[at + v * 3 + 2] = nz
    }
  }

  if (!Number.isFinite(min[0])) {
    return { positions, normals, triangles: 0, min: [0, 0, 0], max: [0, 0, 0] }
  }
  return { positions, normals, triangles, min, max }
}

/** Reads whatever the team uploaded, or explains why it cannot be drawn. */
export async function parseMesh(name: string, blob: Blob): Promise<Mesh> {
  const support = meshSupport(name)
  if (support !== 'mesh') throw new Error(meshAdvice(name))

  if (extensionOf(name) === 'obj') return parseObj(await readBlob(blob, 'text'))

  const buffer = await readBlob(blob, 'buffer')
  const mesh = isBinaryStl(buffer) ? parseBinaryStl(buffer) : parseAsciiStl(new TextDecoder().decode(buffer))
  if (mesh.triangles === 0) throw new Error('That file has no triangles in it — it may be empty or truncated.')
  return mesh
}
