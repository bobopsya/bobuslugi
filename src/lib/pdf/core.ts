// Общий каркас официальных бланков Бобуслуг: шапка, печать, подпись, QR-код проверки.
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { latinFileName } from '../translit'

type PdfMake = typeof import('pdfmake/build/pdfmake')

let pdfMakePromise: Promise<PdfMake> | null = null

/** pdfmake грузится только при первом скачивании, чтобы не раздувать основной бандл. */
async function loadPdfMake(): Promise<PdfMake> {
  pdfMakePromise ??= (async () => {
    const mod = await import('pdfmake/build/pdfmake')
    const pdfMake = ((mod as unknown as { default?: PdfMake }).default ?? mod) as PdfMake
    const vfsMod = await import('pdfmake/build/vfs_fonts')
    const vfs = ((vfsMod as unknown as { default?: Record<string, string> }).default ?? vfsMod) as Record<string, string>
    pdfMake.addVirtualFileSystem(vfs)
    pdfMake.setFonts({
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf',
      },
    })
    return pdfMake
  })()
  return pdfMakePromise
}

export async function downloadPdf(def: TDocumentDefinitions, fileName: string) {
  const pdfMake = await loadPdfMake()
  await pdfMake.createPdf(def).download(latinFileName(fileName))
}

export async function pdfBlob(def: TDocumentDefinitions): Promise<Blob> {
  const pdfMake = await loadPdfMake()
  return pdfMake.createPdf(def).getBlob()
}

const sealCache = new Map<string, string>()

/** Круглая синяя печать страны. Рисуется на canvas, гербов реальных стран нет. */
export function seal(countryName: string, agency = 'ПсяМВД'): string {
  const key = `${countryName}|${agency}`
  const cached = sealCache.get(key)
  if (cached) return cached
  const size = 320
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  const cx = size / 2
  ctx.strokeStyle = 'rgba(29,78,216,.85)'
  ctx.fillStyle = 'rgba(29,78,216,.85)'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.arc(cx, cx, 150, 0, Math.PI * 2)
  ctx.stroke()
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cx, 108, 0, Math.PI * 2)
  ctx.stroke()

  const text = `${countryName.toUpperCase()} • БОБОСОЮЗ • ${agency.toUpperCase()} • `
  ctx.font = 'bold 26px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const step = (Math.PI * 2) / text.length
  for (let i = 0; i < text.length; i++) {
    const a = i * step - Math.PI / 2
    ctx.save()
    ctx.translate(cx + Math.cos(a) * 128, cx + Math.sin(a) * 128)
    ctx.rotate(a + Math.PI / 2)
    ctx.fillText(text[i], 0, 0)
    ctx.restore()
  }

  // Звезда в центре
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 62 : 26
    const a = (i * Math.PI) / 5 - Math.PI / 2
    ctx.lineTo(cx + Math.cos(a) * r, cx + 4 + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
  ctx.font = 'bold 20px sans-serif'
  ctx.fillText('12.34.1234', cx, cx + 84)

  const url = c.toDataURL('image/png')
  sealCache.set(key, url)
  return url
}

export async function qr(text: string): Promise<string> {
  const QR = await import('qrcode')
  return QR.toDataURL(text, { margin: 0, width: 220, errorCorrectionLevel: 'M' })
}

export function verifyUrl(number: string) {
  return `${location.origin}${location.pathname}#/verify/${encodeURIComponent(number)}`
}

export const styles: TDocumentDefinitions['styles'] = {
  agency: { fontSize: 9, color: '#475569', characterSpacing: 1 },
  title: { fontSize: 18, bold: true, alignment: 'center', margin: [0, 18, 0, 4] },
  subtitle: { fontSize: 11, alignment: 'center', color: '#475569', margin: [0, 0, 0, 16] },
  label: { fontSize: 8, color: '#64748b' },
  value: { fontSize: 11, bold: true },
  small: { fontSize: 8, color: '#64748b' },
  mrz: { fontSize: 9, characterSpacing: 1.6, color: '#0f172a' },
}

/** Шапка бланка. */
export function header(countryLine: string, agencyLine: string): Content {
  return {
    columns: [
      {
        stack: [
          { text: 'БОБОСОЮЗ · ПЛАНЕТА АСЕЙ', style: 'agency' },
          { text: countryLine.toUpperCase(), bold: true, fontSize: 12, color: '#0b2a5b' },
          { text: agencyLine, style: 'agency' },
        ],
      },
      { text: 'бобо' + 'услуги', alignment: 'right', color: '#0b5bd3', bold: true, fontSize: 14 },
    ],
  }
}

/** Таблица «подпись — ФИО — печать». */
export function signatureBlock(opts: {
  role: string
  name: string
  signature: string | null
  sealImage?: string | null
  date: string
}): Content {
  return {
    margin: [0, 28, 0, 0],
    columns: [
      { width: '*', stack: [{ text: opts.role, style: 'label' }, { text: opts.name, style: 'value' }, { text: opts.date, style: 'small' }] },
      {
        width: 150,
        stack: [
          opts.signature ? { image: opts.signature, fit: [140, 50] } : { text: '', margin: [0, 0, 0, 40] },
          { canvas: [{ type: 'line', x1: 0, y1: 2, x2: 140, y2: 2, lineWidth: 0.6, lineColor: '#94a3b8' }] },
          { text: 'подпись', style: 'small' },
        ],
      },
      { width: 100, stack: opts.sealImage ? [{ image: opts.sealImage, width: 92, opacity: 0.85 }] : [] },
    ],
  }
}

/** Нижний колонтитул с QR-кодом проверки. */
export async function verifyFooter(number: string | null): Promise<Content> {
  if (!number) return { text: '' }
  return {
    margin: [0, 24, 0, 0],
    columns: [
      { image: await qr(verifyUrl(number)), width: 64 },
      {
        margin: [10, 8, 0, 0],
        stack: [
          { text: 'Проверить подлинность документа', style: 'label' },
          { text: verifyUrl(number), fontSize: 8, color: '#0b5bd3' },
        ],
      },
    ],
  }
}

export function kv(rows: [string, string | undefined | null][]): Content {
  return {
    table: {
      widths: [150, '*'],
      body: rows.map(([k, v]) => [
        { text: k, style: 'label', margin: [0, 3, 0, 3] },
        { text: v || '—', style: 'value', margin: [0, 2, 0, 2] },
      ]),
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => '#e2e8f0',
    },
  }
}
