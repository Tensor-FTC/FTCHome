import { describe, expect, it } from 'vitest'
import { meshAdvice, meshSupport, parseMesh } from './mesh'

/** A cube-corner triangle, encoded as a real binary STL. */
function binaryStl(triangles: [number, number, number][][]): Blob {
  const buffer = new ArrayBuffer(84 + triangles.length * 50)
  const view = new DataView(buffer)
  view.setUint32(80, triangles.length, true)
  let offset = 84
  for (const tri of triangles) {
    // Leave the normal at zero, so the parser has to derive it.
    offset += 12
    for (const [x, y, z] of tri) {
      view.setFloat32(offset, x, true)
      view.setFloat32(offset + 4, y, true)
      view.setFloat32(offset + 8, z, true)
      offset += 12
    }
    offset += 2
  }
  return new Blob([buffer])
}

const ASCII_STL = `solid bracket
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 2 0 0
    vertex 0 3 0
  endloop
endfacet
endsolid bracket
`

describe('mesh support', () => {
  it('knows what it can and cannot draw', () => {
    expect(meshSupport('arm.stl')).toBe('mesh')
    expect(meshSupport('ARM.STL')).toBe('mesh')
    expect(meshSupport('chassis.obj')).toBe('mesh')
    expect(meshSupport('drivetrain.step')).toBe('kernel-required')
    expect(meshSupport('robot.f3d')).toBe('proprietary')
    expect(meshSupport('robot.f3z')).toBe('proprietary')
    expect(meshSupport('layout.dxf')).toBe('not-3d')
  })

  it('tells a team what to export instead, rather than failing silently', () => {
    expect(meshAdvice('robot.f3d')).toMatch(/Save as Mesh/)
    expect(meshAdvice('robot.step')).toMatch(/STL/)
    expect(meshAdvice('arm.stl')).toBe('')
  })

  it('refuses a format it cannot read, with the advice as the message', async () => {
    await expect(parseMesh('robot.f3d', new Blob(['PK']))).rejects.toThrow(/Fusion archives/)
  })
})

describe('parsing', () => {
  it('reads a binary STL and derives the missing normals', async () => {
    const mesh = await parseMesh('part.stl', binaryStl([[[0, 0, 0], [2, 0, 0], [0, 3, 0]]]))
    expect(mesh.triangles).toBe(1)
    expect([...mesh.positions]).toEqual([0, 0, 0, 2, 0, 0, 0, 3, 0])
    // Wound counter-clockwise in the XY plane, so the face points along +Z.
    expect([...mesh.normals.slice(0, 3)]).toEqual([0, 0, 1])
    expect(mesh.min).toEqual([0, 0, 0])
    expect(mesh.max).toEqual([2, 3, 0])
  })

  it('reads an ASCII STL, which is not distinguishable by its header', async () => {
    const mesh = await parseMesh('part.stl', new Blob([ASCII_STL]))
    expect(mesh.triangles).toBe(1)
    expect(mesh.max).toEqual([2, 3, 0])
  })

  it('triangulates an OBJ quad into two triangles', async () => {
    const obj = `
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
f 1 2 3 4
`
    const mesh = await parseMesh('plate.obj', new Blob([obj]))
    expect(mesh.triangles).toBe(2)
    expect(mesh.max).toEqual([1, 1, 0])
  })

  it('resolves negative OBJ indices, which count back from the end', async () => {
    const obj = `
v 0 0 0
v 4 0 0
v 0 4 0
f -3 -2 -1
`
    const mesh = await parseMesh('plate.obj', new Blob([obj]))
    expect(mesh.triangles).toBe(1)
    expect([...mesh.positions]).toEqual([0, 0, 0, 4, 0, 0, 0, 4, 0])
  })

  it('rejects an empty model rather than showing an blank canvas', async () => {
    await expect(parseMesh('empty.stl', binaryStl([]))).rejects.toThrow(/no triangles/)
  })
})
