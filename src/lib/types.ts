export type Role = 'citizen' | 'official' | 'president' | 'superadmin'
export type AppStatus = 'submitted' | 'needs_info' | 'approved' | 'rejected' | 'cancelled' | 'appointment' | 'producing' | 'issued'
export type DocType =
  | 'passport'
  | 'intl_passport'
  | 'driver_license'
  | 'psyals'
  | 'residence_permit'
  | 'visa'
  | 'business_reg'
  | 'license'
  | 'property'
  | 'vehicle'
export type FineKind = 'fine' | 'tax' | 'auto_forbidden' | 'court'
export type FineStatus = 'unpaid' | 'paid' | 'cancelled'
export type TxType = 'grant' | 'withdraw' | 'fee' | 'fine_payment' | 'refund' | 'salary' | 'court' | 'sale'
export type NewsKind = 'news' | 'decree'
export type ElectionStatus = 'draft' | 'open' | 'closed'
export type TargetMode = 'any' | 'own' | 'foreign' | 'fixed'

export type Profile = {
  id: string
  login: string
  display_name: string
  role: Role
  country_code: string | null
  gov_country_code: string | null
  city: string | null
  balance: number
  banned: boolean
  signature_path: string | null
  salary: number
  registered_address: string | null
  created_at: string
}

export type Country = {
  code: string
  name: string
  psy_name: string
  capital: string | null
  cities: string[]
  leader_title: string
  leader_name: string | null
  in_union: boolean
  description: string
  sort: number
  population_bonus: number
  treasury: number
  business_tax: number
  property_tax: number
}

export type ServiceRow = {
  code: string
  category: string
  target_mode: TargetMode
  fixed_target: string | null
  fee: number
  active: boolean
  sort: number
  needs_photo: boolean
  needs_exam: boolean
  doc_type: string | null
}

export type Application = {
  id: number
  user_id: string
  service_code: string
  target_country: string
  data: Record<string, string>
  status: AppStatus
  fee: number
  reviewer_id: string | null
  reviewer_comment: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  photo_path: string | null
  signature_path: string | null
  slot_id: number | null
  exam_attempt_id: number | null
  attended_at: string | null
  ready_at: string | null
  received_at: string | null
  receipt_signature_path: string | null
  decision_signature_path: string | null
}

export type DocumentRow = {
  id: number
  user_id: string
  type: DocType
  country_code: string
  number: string
  data: Record<string, string>
  issued_at: string
  valid_until: string | null
  revoked_at: string | null
  revoke_reason: string | null
  application_id: number | null
  photo_path: string | null
  holder_signature_path: string | null
  issuer: string | null
  division_code: string | null
  issued_by: string | null
}

export type Fine = {
  id: number
  user_id: string
  country_code: string | null
  amount: number
  reason: string
  kind: FineKind
  status: FineStatus
  issued_by: string | null
  beneficiary_id: string | null
  created_at: string
  paid_at: string | null
}

export type Transaction = {
  id: number
  user_id: string
  delta: number
  balance_after: number
  type: TxType
  ref_type: string | null
  ref_id: number | null
  actor_id: string | null
  comment: string | null
  created_at: string
}

export type News = {
  id: number
  country_code: string | null
  author_id: string | null
  kind: NewsKind
  title: string
  body: string
  created_at: string
}

export type Election = {
  id: number
  country_code: string
  title: string
  description: string
  status: ElectionStatus
  created_by: string | null
  created_at: string
  opened_at: string | null
  closed_at: string | null
}

export type Candidate = { id: number; election_id: number; user_id: string | null; name: string; program: string }

export type Wanted = {
  id: number
  country_code: string | null
  name: string
  description: string
  reward: number
  linked_user_id: string | null
  active: boolean
  created_by: string | null
  created_at: string
}

export type Notification = {
  id: number
  user_id: string
  kind: string
  params: Record<string, string | number | boolean | null>
  link: string | null
  read_at: string | null
  created_at: string
}

export type AuditEntry = {
  id: number
  actor_id: string | null
  action: string
  target: string | null
  details: Record<string, unknown>
  created_at: string
}

export type Debtor = {
  user_id: string
  login: string
  display_name: string
  country_code: string | null
  total: number
  fines_count: number
}

export type Slot = {
  id: number
  country_code: string
  starts_at: string
  place: string
  official_id: string | null
  application_id: number | null
  created_at: string
}

export type ExamQuestion = { id: number; question: string; options: string[] }

export type ExamAttempt = {
  id: number
  user_id: string
  question_ids: number[]
  answers: number[] | null
  score: number | null
  passed: boolean | null
  started_at: string
  finished_at: string | null
}

/** Анкетные данные заявителя (хранятся в data заявления и документа). */
export type Anketa = {
  last_name?: string
  first_name?: string
  patronymic?: string
  sex?: 'М' | 'Ж'
  birth_date?: string
  birth_place?: string
}

export type CountryStat = { code: string; population: number; players: number; treasury: number; businesses: number }

export type TreasuryTx = {
  id: number
  country_code: string
  delta: number
  balance_after: number
  type: string
  ref_type: string | null
  ref_id: number | null
  actor_id: string | null
  comment: string | null
  created_at: string
}

export type PropertyOffer = {
  id: number
  document_id: number
  from_user: string
  to_user: string
  price: number
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  created_at: string
}

export type LawsuitStatus = 'filed' | 'hearing' | 'decided' | 'dismissed'

export type Lawsuit = {
  id: number
  plaintiff_id: string
  defendant_id: string
  country_code: string
  amount: number
  claim: string
  defense: string | null
  status: LawsuitStatus
  hearing_at: string | null
  place: string | null
  judge_id: string | null
  judge_signature_path: string | null
  verdict: string | null
  awarded: number | null
  fine_id: number | null
  created_at: string
  decided_at: string | null
}
