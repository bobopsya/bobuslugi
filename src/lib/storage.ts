import { useQuery } from '@tanstack/react-query'
import { ApiError } from './api'
import { supabase } from './supabase'

export type Bucket = 'photos' | 'signatures'

function randomName(ext: string) {
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now())
  return `${id}.${ext}`
}

/** Загружает файл в папку пользователя и возвращает путь в бакете. */
export async function uploadFile(bucket: Bucket, userId: string, blob: Blob): Promise<string> {
  const ext = blob.type === 'image/png' ? 'png' : 'jpg'
  const path = `${userId}/${randomName(ext)}`
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType: blob.type, upsert: false })
  if (error) throw new ApiError('E_UPLOAD', error.message)
  return path
}

/** Временная ссылка на файл из закрытого бакета (живёт час). */
export function useSignedUrl(bucket: Bucket, path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-url', bucket, path],
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path!, 3600)
      if (error) return null
      return data.signedUrl
    },
  })
}

/** Файл из хранилища как data URL — для вставки в PDF. Если доступа нет, вернёт null. */
export async function fileAsDataUrl(bucket: Bucket, path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) return null
  return blobToDataUrl(data)
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
