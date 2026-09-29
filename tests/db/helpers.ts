import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'

// Значения по умолчанию — стандартные ключи локального Supabase CLI.
export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()
  try {
    const res = await client.query(text, params)
    return res.rows as T[]
  } finally {
    await client.end()
  }
}

export async function resetDb() {
  await sql('truncate auth.users cascade')
  await sql(
    `truncate public.news, public.elections, public.wanted, public.audit_log, public.appointment_slots,
      public.treasury_tx, public.lawsuits, public.property_offers restart identity cascade`,
  )
  await sql(`update public.app_settings set value = '' where key = 'invite_code'`)
  await sql(`update public.app_settings set value = '123' where key = 'forbidden_fine'`)
  await sql(`update public.app_settings set value = '30' where key = 'passport_production_minutes'`)
  await sql(`update public.countries set population_bonus = 0, treasury = 0, business_tax = 123, property_tax = 123`)
}

export function anon(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type User = { client: SupabaseClient; id: string; login: string }

export async function signUp(login: string, displayName = login, invite?: string): Promise<User> {
  const client = anon()
  const { data, error } = await client.auth.signUp({
    email: `${login.toLowerCase()}@bobuslugi.local`,
    password: 'password1234',
    options: { data: { login, display_name: displayName, invite_code: invite } },
  })
  if (error) throw error
  return { client, id: data.user!.id, login }
}

/** Вызывает RPC и бросает ошибку с кодом из базы (E_...). */
export async function rpc<T = { ok: boolean; id?: number; error?: string }>(
  u: User,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await u.client.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

export async function balance(u: User): Promise<number> {
  const rows = await sql<{ balance: number }>('select balance from profiles where id = $1', [u.id])
  return rows[0].balance
}

// Минимальные валидные картинки для загрузки в хранилище.
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

let fileCounter = 0

export async function uploadPhoto(u: User): Promise<string> {
  const path = `${u.id}/photo-${Date.now()}-${fileCounter++}.jpg`
  const { error } = await u.client.storage.from('photos').upload(path, JPEG, { contentType: 'image/jpeg' })
  if (error) throw error
  return path
}

export async function uploadSignature(u: User): Promise<string> {
  const path = `${u.id}/sig-${Date.now()}-${fileCounter++}.png`
  const { error } = await u.client.storage.from('signatures').upload(path, PNG, { contentType: 'image/png' })
  if (error) throw error
  return path
}

/** Сохраняет подпись в профиле (нужна чиновникам для решений). */
export async function setSignature(u: User) {
  await rpc(u, 'set_signature', { p_path: await uploadSignature(u) })
}

/** Сдаёт экзамен: правильные ответы берутся прямо из базы. */
export async function passExam(u: User, wrong = 0): Promise<number> {
  const exam = await rpc<{ attempt_id: number; questions: { id: number; options: string[] }[] }>(u, 'start_exam')
  const correct = await sql<{ id: number; correct: number }>('select id, correct from exam_questions')
  const map = new Map(correct.map((c) => [c.id, c.correct]))
  const answers = exam.questions.map((q, i) => {
    const right = map.get(q.id)!
    return i < wrong ? (right === 1 ? 2 : 1) : right
  })
  await rpc(u, 'submit_exam', { p_attempt: exam.attempt_id, p_answers: answers })
  return exam.attempt_id
}

/** Чиновник публикует один слот приёма через час, возвращает его id. */
export async function createSlot(staff: User, country?: string): Promise<number> {
  await rpc(staff, 'create_slots', {
    p_starts_at: new Date(Date.now() + 3600_000).toISOString(),
    p_count: 1,
    p_interval_minutes: 15,
    p_place: 'Псяленд, ПсяМВД, окно 1',
    p_country: country ?? null,
  })
  const [row] = await sql<{ id: number }>('select max(id)::int as id from appointment_slots')
  return row.id
}

export const ANKETA = {
  last_name: 'Псянская',
  first_name: 'Алиса',
  patronymic: 'Бобовна',
  sex: 'Ж',
  birth_date: '2010-05-24',
  birth_place: 'г. Псяленд',
  city: 'Псяленд',
}

/** Подаёт заявление на документ с фото и подписью. */
export async function submitDoc(u: User, service: string, target: string | null, data: Record<string, string> = {}) {
  return rpc(u, 'submit_application', {
    p_service: service,
    p_target: target,
    p_data: { ...ANKETA, ...data },
    p_photo_path: await uploadPhoto(u),
    p_signature_path: await uploadSignature(u),
  })
}

/** Одобрение → изготовление → получение с подписью. */
export async function approveAndReceive(u: User, appId: number, reviewer: User) {
  const r = await rpc(reviewer, 'review_application', { p_id: appId, p_decision: 'approve', p_comment: 'Сиф' })
  if (!r.ok) throw new Error(JSON.stringify(r))
  await rpc(reviewer, 'speed_up_production', { p_app: appId })
  return rpc(u, 'receive_document', { p_app: appId, p_signature_path: await uploadSignature(u) })
}

/** Полный путь гражданства: экзамен, анкета, фото, присяга, приём, одобрение, получение. */
export async function getCitizenship(u: User, country: string, reviewer: User) {
  const attempt = await passExam(u)
  const slot = await createSlot(reviewer, country)
  const app = await rpc(u, 'submit_application', {
    p_service: 'citizenship',
    p_target: country,
    p_data: { ...ANKETA, oath: 'true' },
    p_photo_path: await uploadPhoto(u),
    p_signature_path: await uploadSignature(u),
    p_slot_id: slot,
    p_exam_attempt: attempt,
  })
  await rpc(reviewer, 'mark_attendance', { p_app: app.id, p_attended: true })
  await approveAndReceive(u, app.id!, reviewer)
  return app.id!
}
