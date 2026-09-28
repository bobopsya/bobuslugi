export type Role = 'citizen' | 'official' | 'president' | 'superadmin'
export type AppStatus = 'submitted' | 'needs_info' | 'approved' | 'rejected' | 'cancelled'
export type DocType = 'passport' | 'intl_passport' | 'driver_license' | 'psyals' | 'residence_permit' | 'visa'
export type FineKind = 'fine' | 'tax' | 'auto_forbidden'
export type FineStatus = 'unpaid' | 'paid' | 'cancelled'
export type TxType = 'grant' | 'withdraw' | 'fee' | 'fine_payment' | 'refund'
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
}

export type ServiceRow = {
  code: string
  category: string
  target_mode: TargetMode
  fixed_target: string | null
  fee: number
  active: boolean
  sort: number
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
