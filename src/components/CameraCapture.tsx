import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Sheet } from './ui'

/**
 * Taking a photo on a device with no camera app.
 *
 * The Camera button used to set `capture="environment"` on a file input. On a
 * phone that is exactly right — it opens the real camera app, full resolution,
 * an interface everybody already knows. On a laptop the attribute is simply
 * ignored, so the button opened a file picker: a control labelled Camera that
 * could not take a picture.
 *
 * So phones keep the native path and desktops get this — a live preview from
 * `getUserMedia` and a shutter. Two implementations because they are genuinely
 * two situations, not one with a polyfill.
 */
export function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState<string>()
  const [ready, setReady] = useState(false)

  /**
   * Release the camera.
   *
   * Called on unmount *and* after a successful shot. Without it the webcam
   * light stays on after the sheet closes, which is alarming and reads as the
   * app still watching.
   */
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let live = true
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open a camera. Use Upload instead.')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1600 } }, audio: false })
      .then((stream) => {
        if (!live) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play()
        }
        setReady(true)
      })
      .catch((err: unknown) => {
        if (!live) return
        // Name the two that actually happen, rather than printing a DOMException.
        const name = err instanceof Error ? err.name : ''
        setError(
          name === 'NotAllowedError'
            ? 'Camera permission was refused. Allow it in your browser’s site settings, or use Upload.'
            : name === 'NotFoundError'
              ? 'No camera found on this device. Use Upload instead.'
              : 'Could not start the camera. Use Upload instead.',
        )
      })
    return () => {
      live = false
      stop()
    }
  }, [stop])

  function shoot() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        // Named with a timestamp so a build day of shots does not collide.
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        onCapture(new File([blob], `photo-${stamp}.jpg`, { type: 'image/jpeg' }))
        stop()
        onClose()
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <Sheet
      title="Take a photo"
      subtitle="Goes straight into the build log."
      onClose={onClose}
      footer={
        <Button variant="primary" block disabled={!ready} onClick={shoot}>
          {ready ? 'Capture' : 'Starting camera…'}
        </Button>
      }
    >
      {error ? (
        <p className="body" style={{ color: 'var(--ink-3)' }}>
          {error}
        </p>
      ) : (
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            width: '100%',
            borderRadius: 12,
            background: '#000',
            aspectRatio: '4 / 3',
            objectFit: 'cover',
          }}
        />
      )}
    </Sheet>
  )
}

/**
 * Whether the native camera app is the better route.
 *
 * Touch devices get it: better optics, full resolution, and an interface people
 * already know. Everything else falls through to `getUserMedia`.
 */
export function prefersNativeCapture(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.maxTouchPoints > 0 && 'capture' in HTMLInputElement.prototype
}
