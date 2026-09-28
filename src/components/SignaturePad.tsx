import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { Button } from './ui'

/** Обрезает пустые края холста и возвращает PNG. */
function trimmedPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const ctx = canvas.getContext('2d')!
  const { width, height } = canvas
  const pixels = ctx.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return Promise.resolve(null)
  const pad = 8
  const out = document.createElement('canvas')
  out.width = Math.min(width, maxX - minX + pad * 2)
  out.height = Math.min(height, maxY - minY + pad * 2)
  out.getContext('2d')!.drawImage(canvas, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height)
  return new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'))
}

/**
 * Поле для подписи мышкой или пальцем.
 * onChange получает PNG подписи (или null, если поле пустое).
 */
export function SignaturePad({ onChange, height = 160 }: { onChange: (blob: Blob | null) => void; height?: number }) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current!
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)
    const ctx = canvas.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0b2a5b'
  }, [])

  const point = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const finish = async () => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    onChange(await trimmedPng(canvasRef.current!))
  }

  const clear = () => {
    const canvas = canvasRef.current!
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setEmpty(true)
    onChange(null)
  }

  return (
    <div>
      <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-white">
        <canvas
          ref={canvasRef}
          data-testid="signature-pad"
          aria-label={t('docflow.signHere')}
          className="block w-full touch-none cursor-crosshair"
          style={{ height }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            drawing.current = true
            last.current = point(e)
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return
            const ctx = canvasRef.current!.getContext('2d')!
            const p = point(e)
            ctx.beginPath()
            ctx.moveTo(last.current.x, last.current.y)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
            last.current = p
            if (empty) setEmpty(false)
          }}
          onPointerUp={finish}
          onPointerLeave={finish}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted">{t('docflow.signHere')}</span>
        )}
        <span className="pointer-events-none absolute bottom-6 left-6 right-6 border-b border-slate-300" />
      </div>
      <div className="mt-2">
        <Button type="button" variant="ghost" onClick={clear} disabled={empty}>
          {t('docflow.clear')}
        </Button>
      </div>
    </div>
  )
}
