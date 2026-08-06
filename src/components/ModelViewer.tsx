import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui'
import { meshAdvice, meshSupport, parseMesh, type Mesh } from '@/lib/mesh'

/**
 * A CAD viewer, in WebGL, with no 3D library.
 *
 * A team's mesh is a few thousand flat-shaded triangles that need to spin — that
 * is one vertex shader, one fragment shader and a drag handler. Pulling in a
 * scene graph for it would cost several hundred kilobytes on every load of an
 * app whose whole premise is working on venue wifi.
 *
 * The renderer is lazy: nothing here runs, and no GL context is created, until
 * somebody actually opens a model.
 */

const VERTEX_SHADER = `
attribute vec3 position;
attribute vec3 normal;
uniform mat4 modelView;
uniform mat4 projection;
uniform mat3 normalMatrix;
varying vec3 vNormal;
varying vec3 vPosition;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 eye = modelView * vec4(position, 1.0);
  vPosition = eye.xyz;
  gl_Position = projection * eye;
}
`

/**
 * Two lights and a rim, chosen so a grey part reads as a shape rather than a
 * silhouette. The rim is what makes an edge visible against a dark background.
 */
const FRAGMENT_SHADER = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vPosition;
uniform vec3 tint;
void main() {
  vec3 n = normalize(vNormal);
  vec3 key = normalize(vec3(0.4, 0.8, 0.6));
  vec3 fill = normalize(vec3(-0.6, -0.2, 0.4));
  float lambert = max(dot(n, key), 0.0) * 0.78 + max(dot(n, fill), 0.0) * 0.22;
  float rim = pow(1.0 - max(dot(n, normalize(-vPosition)), 0.0), 2.5);
  vec3 base = vec3(0.34, 0.37, 0.38) * (0.28 + lambert);
  gl_FragColor = vec4(base + tint * rim * 0.55, 1.0);
}
`

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Could not create a shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader failed to compile')
  }
  return shader
}

/** Column-major perspective, the layout GL wants. */
function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2)
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ])
}

/** Orbit the camera around the model's own centre, then push it back by `distance`. */
function orbitMatrix(yaw: number, pitch: number, distance: number, centre: [number, number, number]): Float32Array {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)

  // Rotate about Y, then X. Written out rather than multiplied at runtime.
  const r = [cy, sp * sy, -cp * sy, 0, 0, cp, sp, 0, sy, -sp * cy, cp * cy, 0]
  const [tx, ty, tz] = centre
  return new Float32Array([
    r[0], r[1], r[2], 0,
    r[4], r[5], r[6], 0,
    r[8], r[9], r[10], 0,
    -(r[0] * tx + r[4] * ty + r[8] * tz),
    -(r[1] * tx + r[5] * ty + r[9] * tz),
    -(r[2] * tx + r[6] * ty + r[10] * tz) - distance,
    1,
  ])
}

function normalMatrixFrom(mv: Float32Array): Float32Array {
  // Rotation only, so the upper-left 3×3 is already orthonormal.
  return new Float32Array([mv[0], mv[1], mv[2], mv[4], mv[5], mv[6], mv[8], mv[9], mv[10]])
}

export function ModelViewer({ name, blob, height = 320 }: { name: string; blob: Blob; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mesh, setMesh] = useState<Mesh | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const view = useRef({ yaw: 0.6, pitch: -0.35, zoom: 1 })
  /** Set by the render effect so the reset button can ask for a frame. */
  const redraw = useRef<() => void>(() => {})

  const support = meshSupport(name)

  useEffect(() => {
    if (support !== 'mesh') {
      setError(meshAdvice(name))
      setLoading(false)
      return
    }
    let live = true
    setLoading(true)
    setError('')
    parseMesh(name, blob)
      .then((parsed) => live && setMesh(parsed))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : 'Could not read that file'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [name, blob, support])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !mesh) return

    const gl = canvas.getContext('webgl', { antialias: true, alpha: false })
    if (!gl) {
      setError('This browser has no WebGL, so the model cannot be drawn here. The file still downloads.')
      return
    }

    let program: WebGLProgram | null = null
    let frame = 0
    try {
      program = gl.createProgram()
      if (!program) throw new Error('Could not create a GL program')
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) ?? 'Shaders failed to link')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The 3D viewer failed to start')
      return
    }

    gl.useProgram(program)
    gl.enable(gl.DEPTH_TEST)
    gl.clearColor(0.063, 0.075, 0.082, 1)

    const bind = (data: Float32Array, attribute: string) => {
      const buffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
      const location = gl.getAttribLocation(program!, attribute)
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0)
      return buffer
    }
    const positionBuffer = bind(mesh.positions, 'position')
    const normalBuffer = bind(mesh.normals, 'normal')

    const centre: [number, number, number] = [
      (mesh.min[0] + mesh.max[0]) / 2,
      (mesh.min[1] + mesh.max[1]) / 2,
      (mesh.min[2] + mesh.max[2]) / 2,
    ]
    const radius =
      Math.max(mesh.max[0] - mesh.min[0], mesh.max[1] - mesh.min[1], mesh.max[2] - mesh.min[2]) / 2 || 1

    const uModelView = gl.getUniformLocation(program, 'modelView')
    const uProjection = gl.getUniformLocation(program, 'projection')
    const uNormal = gl.getUniformLocation(program, 'normalMatrix')
    const uTint = gl.getUniformLocation(program, 'tint')
    gl.uniform3f(uTint, 0.776, 0.91, 0.306) // the brand lime, as a rim light

    function draw() {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2)
      const width = canvas!.clientWidth * dpr
      const heightPx = canvas!.clientHeight * dpr
      if (canvas!.width !== width || canvas!.height !== heightPx) {
        canvas!.width = width
        canvas!.height = heightPx
      }
      gl!.viewport(0, 0, canvas!.width, canvas!.height)
      gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT)

      const { yaw, pitch, zoom } = view.current
      const modelView = orbitMatrix(yaw, pitch, (radius * 3.2) / zoom, centre)
      gl!.uniformMatrix4fv(uModelView, false, modelView)
      gl!.uniformMatrix3fv(uNormal, false, normalMatrixFrom(modelView))
      gl!.uniformMatrix4fv(
        uProjection,
        false,
        perspective(0.9, canvas!.width / canvas!.height || 1, radius * 0.05, radius * 40),
      )
      gl!.drawArrays(gl!.TRIANGLES, 0, mesh!.triangles * 3)
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(draw)
    }
    redraw.current = schedule
    schedule()

    // ── input ──
    let dragging = false
    let lastX = 0
    let lastY = 0

    const down = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      canvas.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (!dragging) return
      view.current.yaw += (e.clientX - lastX) * 0.01
      // Stop just short of the poles, where the orbit would flip over.
      view.current.pitch = Math.max(
        -Math.PI / 2 + 0.05,
        Math.min(Math.PI / 2 - 0.05, view.current.pitch + (e.clientY - lastY) * 0.01),
      )
      lastX = e.clientX
      lastY = e.clientY
      schedule()
    }
    const up = (e: PointerEvent) => {
      dragging = false
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      view.current.zoom = Math.max(0.25, Math.min(8, view.current.zoom * (e.deltaY > 0 ? 0.9 : 1.1)))
      schedule()
    }
    const resize = () => schedule()

    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('wheel', wheel, { passive: false })
    globalThis.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(frame)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('wheel', wheel)
      globalThis.removeEventListener('resize', resize)
      gl.deleteBuffer(positionBuffer)
      gl.deleteBuffer(normalBuffer)
      if (program) gl.deleteProgram(program)
      // Free the GPU context rather than waiting for it to be collected; browsers
      // cap how many live at once and a build log can open a lot of models.
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [mesh])

  if (loading) {
    return (
      <div className="card-dashed" style={{ height, display: 'grid', placeItems: 'center' }}>
        <span className="meta">Reading the model…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="card-quiet card-pad">
        <div className="label" style={{ marginBottom: 6 }}>
          {support === 'proprietary' ? 'Fusion archive' : support === 'kernel-required' ? 'Exact-surface CAD' : 'Cannot draw this'}
        </div>
        <p className="meta pretty">{error}</p>
      </div>
    )
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height,
          display: 'block',
          borderRadius: 14,
          background: 'var(--srf-app)',
          border: '1px solid var(--line-2)',
          cursor: 'grab',
          touchAction: 'none',
        }}
        aria-label={`3D model of ${name}. Drag to rotate.`}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 10 }}>
        <span className="meta-mono">
          {mesh?.triangles.toLocaleString('en-US')} triangles · drag to rotate, scroll to zoom
        </span>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => {
            view.current = { yaw: 0.6, pitch: -0.35, zoom: 1 }
            redraw.current()
          }}
        >
          Reset view
        </Button>
      </div>
    </div>
  )
}
