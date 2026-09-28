import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { Alert, Button } from './ui'

const BOX_W = 240
const BOX_H = 320
const OUT_W = 600
const OUT_H = 800

type View = { zoom: number; x: number; y: number }

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image'))
    img.src = src
  })
}

/** Рисует изображение в рамку 3×4 с учётом зума и сдвига. */
function draw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, view: View, w: number, h: number) {
  const base = Math.max(w / img.width, h / img.height)
  const scale = base * view.zoom
  const dw = img.width * scale
  const dh = img.height * scale
  const k = w / BOX_W
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, (w - dw) / 2 + view.x * k, (h - dh) / 2 + view.y * k, dw, dh)
}

function Camera({ onShot, onClose }: { onShot: (dataUrl: string) => void; onClose: () => void }) {
  const { t } = useI18n()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
      })
      .catch(() => setError(true))
    if (!navigator.mediaDevices) setError(true)
    return () => stream?.getTracks().forEach((tr) => tr.stop())
  }, [])

  const shoot = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    const ctx = c.getContext('2d')!
    // Зеркалим, как в превью фронтальной камеры
    ctx.translate(c.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(v, 0, 0)
    onShot(c.toDataURL('image/jpeg', 0.92))
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-2xl bg-white p-4">
        {error ? (
          <Alert tone="red">{t('docflow.cameraError')}</Alert>
        ) : (
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="w-full -scale-x-100" />
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="h-3/4 aspect-[3/4] rounded-[45%] border-4 border-white/70" />
            </div>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          {!error && (
            <Button type="button" onClick={shoot}>
              {t('docflow.shoot')}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Фото на документ: файл или камера, затем кадрирование 3×4.
 * onChange получает JPEG 600×800.
 */
export function PhotoCapture({ onChange, preview }: { onChange: (blob: Blob | null) => void; preview?: string | null }) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [view, setView] = useState<View>({ zoom: 1, x: 0, y: 0 })
  const [camera, setCamera] = useState(false)
  const [done, setDone] = useState<string | null>(preview ?? null)
  const [error, setError] = useState(false)
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!img || !canvasRef.current) return
    draw(canvasRef.current.getContext('2d')!, img, view, BOX_W, BOX_H)
  }, [img, view])

  const open = useCallback(async (src: string) => {
    try {
      setError(false)
      setImg(await loadImage(src))
      setView({ zoom: 1, x: 0, y: 0 })
      setDone(null)
      onChange(null)
    } catch {
      setError(true)
    }
  }, [onChange])

  const onFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => open(reader.result as string)
    reader.readAsDataURL(file)
  }

  const confirm = () => {
    if (!img) return
    const out = document.createElement('canvas')
    out.width = OUT_W
    out.height = OUT_H
    draw(out.getContext('2d')!, img, view, OUT_W, OUT_H)
    out.toBlob(
      (blob) => {
        if (!blob) return
        setDone(URL.createObjectURL(blob))
        setImg(null)
        onChange(blob)
      },
      'image/jpeg',
      0.88,
    )
  }

  return (
    <div className="space-y-3">
      <Alert tone="yellow">{t('docflow.photoRules')}</Alert>

      {done && !img && (
        <div className="flex items-end gap-4">
          <img src={done} alt="" data-testid="photo-preview" className="h-40 w-30 rounded-lg object-cover ring-1 ring-slate-300" />
          <span className="text-sm font-bold text-emerald-700">✓ {t('docflow.photoReady')}</span>
        </div>
      )}

      {img && (
        <div className="flex flex-col items-start gap-3 sm:flex-row">
          <canvas
            ref={canvasRef}
            width={BOX_W}
            height={BOX_H}
            className="touch-none cursor-grab rounded-lg ring-2 ring-brand-500"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { x: e.clientX, y: e.clientY }
            }}
            onPointerMove={(e) => {
              if (!drag.current) return
              const dx = e.clientX - drag.current.x
              const dy = e.clientY - drag.current.y
              drag.current = { x: e.clientX, y: e.clientY }
              setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
            }}
            onPointerUp={() => (drag.current = null)}
          />
          <div className="space-y-3">
            <p className="text-sm text-muted">{t('docflow.cropHint')}</p>
            <label className="block text-sm font-bold">
              {t('docflow.zoom')}
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={view.zoom}
                onChange={(e) => setView((v) => ({ ...v, zoom: Number(e.target.value) }))}
                className="mt-1 block w-48"
              />
            </label>
            <Button type="button" onClick={confirm}>
              {t('docflow.usePhoto')}
            </Button>
          </div>
        </div>
      )}

      {error && <Alert tone="red">{t('docflow.photoError')}</Alert>}

      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-100">
          📁 {t('docflow.chooseFile')}
          <input
            type="file"
            accept="image/*"
            data-testid="photo-input"
            className="sr-only"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </label>
        <Button type="button" variant="secondary" onClick={() => setCamera(true)}>
          📷 {t('docflow.takePhoto')}
        </Button>
      </div>

      {camera && (
        <Camera
          onClose={() => setCamera(false)}
          onShot={(src) => {
            setCamera(false)
            open(src)
          }}
        />
      )}
    </div>
  )
}
