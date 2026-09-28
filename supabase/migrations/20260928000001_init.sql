-- =====================================================================
-- Бобуслуги: схема базы данных
-- Все изменения данных идут только через функции (RPC) ниже.
-- Прямая запись в таблицы для пользователей закрыта политиками RLS.
-- =====================================================================

create schema if not exists private;

-- ---------------------------------------------------------------------
-- Типы
-- ---------------------------------------------------------------------
create type public.user_role as enum ('citizen', 'official', 'president', 'superadmin');
create type public.app_status as enum ('submitted', 'needs_info', 'approved', 'rejected', 'cancelled');
create type public.doc_type as enum ('passport', 'intl_passport', 'driver_license', 'psyals', 'residence_permit', 'visa');
create type public.fine_kind as enum ('fine', 'tax', 'auto_forbidden');
create type public.fine_status as enum ('unpaid', 'paid', 'cancelled');
create type public.tx_type as enum ('grant', 'withdraw', 'fee', 'fine_payment', 'refund');
create type public.news_kind as enum ('news', 'decree');
create type public.election_status as enum ('draft', 'open', 'closed');
create type public.target_mode as enum ('any', 'own', 'foreign', 'fixed');

-- ---------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------
create table public.countries (
  code text primary key,
  name text not null,
  psy_name text not null,
  capital text,
  cities text[] not null default '{}',
  leader_title text not null,
  leader_name text,
  in_union boolean not null default false,
  description text not null default '',
  sort int not null default 0
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  login text not null unique,
  display_name text not null,
  role public.user_role not null default 'citizen',
  country_code text references public.countries (code),
  gov_country_code text references public.countries (code),
  city text,
  balance int not null default 0 check (balance >= 0),
  banned boolean not null default false,
  created_at timestamptz not null default now(),
  constraint gov_country_matches_role check (
    (role in ('official', 'president') and gov_country_code is not null)
    or (role in ('citizen', 'superadmin') and gov_country_code is null)
  )
);

create table public.app_settings (
  key text primary key,
  value text not null
);

create table public.services (
  code text primary key,
  category text not null,
  target_mode public.target_mode not null,
  fixed_target text references public.countries (code),
  fee int not null default 0 check (fee >= 0),
  active boolean not null default true,
  sort int not null default 0
);

create table public.applications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  service_code text not null references public.services (code),
  target_country text not null references public.countries (code),
  data jsonb not null default '{}',
  status public.app_status not null default 'submitted',
  fee int not null default 0,
  reviewer_id uuid references public.profiles (id) on delete set null,
  reviewer_comment text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.applications (user_id);
create index on public.applications (target_country, status);

create table public.documents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.doc_type not null,
  country_code text not null references public.countries (code),
  number text not null unique,
  data jsonb not null default '{}',
  issued_at timestamptz not null default now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  application_id bigint references public.applications (id) on delete set null
);
create index on public.documents (user_id);

create table public.fines (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  country_code text references public.countries (code),
  amount int not null check (amount > 0),
  reason text not null,
  kind public.fine_kind not null default 'fine',
  status public.fine_status not null default 'unpaid',
  issued_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index on public.fines (user_id);

create table public.transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta int not null,
  balance_after int not null,
  type public.tx_type not null,
  ref_type text,
  ref_id bigint,
  actor_id uuid references public.profiles (id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);
create index on public.transactions (user_id);

create table public.news (
  id bigint generated always as identity primary key,
  country_code text references public.countries (code),
  author_id uuid references public.profiles (id) on delete set null,
  kind public.news_kind not null default 'news',
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.elections (
  id bigint generated always as identity primary key,
  country_code text not null references public.countries (code),
  title text not null,
  description text not null default '',
  status public.election_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz
);

create table public.candidates (
  id bigint generated always as identity primary key,
  election_id bigint not null references public.elections (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  name text not null,
  program text not null default ''
);

create table public.votes (
  election_id bigint not null references public.elections (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  candidate_id bigint not null references public.candidates (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (election_id, user_id)
);

create table public.wanted (
  id bigint generated always as identity primary key,
  country_code text references public.countries (code),
  name text not null,
  description text not null default '',
  reward int not null default 0 check (reward >= 0),
  linked_user_id uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  params jsonb not null default '{}',
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, read_at);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Справочные данные из лора
-- ---------------------------------------------------------------------
insert into public.countries (code, name, psy_name, capital, cities, leader_title, leader_name, in_union, description, sort) values
  ('BOBO', 'Бобокаунтри', 'Бобокаунтри', 'Псяленд',
   array['Псяленд', 'Псябург', 'Псякатеринбург', 'Пупасибирск', 'Реутов'],
   'Президент', 'Псянский', true,
   'Первоначальная страна на Асее. Основана великим Пися15412, столица — Псяленд. Жители — сляйнеры. Главный район столицы — Псярфино, где орудуют банды Балсас и Писяганг.', 1),
  ('SSHP', 'Соединённые Штаты Псянского', 'СШП', 'Псю-йорк',
   array['Псю-йорк'],
   'Президент', 'Пупянский', true,
   'Сверхдержава Асея. Нейтральные отношения с Бобокаунтри, немного конфликтные — с Бобостаном. Здесь тоже живут кляйнеры.', 2),
  ('BOBOSTAN', 'Бобостан', 'Бобостан', null,
   array[]::text[],
   'Президент', 'Сися', true,
   'Дружит с Бобокаунтри, нейтрален к СШП. Бобостанские учёные открыли Мигрантское окно — окно в неизвестность.', 3),
  ('PONOSSO', 'Поноссо', 'Поноссо', null,
   array[]::text[],
   'Правитель', 'Мщрщз', false,
   'Страна вечного льда и темноты с огромными запасами ценных ресурсов. Появилась после ядерного конфликта СШП и Бобостана. Цивилизация практически отсутствует.', 4),
  ('INDUSIA', 'Северная Индусия', 'Сев. Индусия', null,
   array[]::text[],
   'Правитель', null, false,
   'Копия земной Индии. Долго оставалась непризнанной — первым её признало Поноссо. Торгует с Поноссо ископаемыми.', 5);

insert into public.app_settings (key, value) values
  ('invite_code', ''),
  ('forbidden_fine', '123');

insert into public.services (code, category, target_mode, fixed_target, fee, sort) values
  ('citizenship',        'citizenship', 'any',     null,       0,    1),
  ('change_citizenship', 'citizenship', 'foreign', null,       321,  2),
  ('residence_permit',   'citizenship', 'foreign', null,       0,    3),
  ('passport_reissue',   'documents',   'own',     null,       123,  10),
  ('intl_passport',      'documents',   'own',     null,       123,  11),
  ('driver_license',     'documents',   'own',     null,       123,  12),
  ('psyals',             'documents',   'own',     null,       0,    13),
  ('visa',               'travel',      'foreign', null,       321,  20),
  ('samenka_delivery',   'travel',      'any',     null,       123,  21),
  ('migrant_window',     'travel',      'fixed',   'BOBOSTAN', 1234, 22),
  ('letter_president',   'appeals',     'own',     null,       0,    30),
  ('gang_complaint',     'appeals',     'own',     null,       0,    31);

-- ---------------------------------------------------------------------
-- Вспомогательные функции для политик (безопасны: говорят только о себе)
-- ---------------------------------------------------------------------
create function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'superadmin' and not banned);
$$;

create function public.is_staff_of(p_country text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and not banned
      and (role = 'superadmin' or (role in ('official', 'president') and gov_country_code = p_country))
  );
$$;

create function public.is_president_of(p_country text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and not banned
      and (role = 'superadmin' or (role = 'president' and gov_country_code = p_country))
  );
$$;

create function public.is_any_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and not banned and role <> 'citizen');
$$;

-- ---------------------------------------------------------------------
-- Внутренние функции (схема private не видна через API)
-- ---------------------------------------------------------------------

-- Приводит текст к виду для проверки: нижний регистр, латиница-двойники → кириллица.
create function private.normalize_text(t text) returns text
language sql immutable as $$
  select translate(lower(coalesce(t, '')), 'aceopxykmtbh0', 'асеорхукмтвно');
$$;

-- Запрещённые слова и числа лора: 52, 1488, 67, 42, «Свастон».
create function private.is_forbidden(t text) returns boolean
language plpgsql immutable as $$
declare
  norm text := private.normalize_text(t);
  digits text;
  letters text;
begin
  -- Цифры: убираем пробелы и знаки между ними, чтобы «5 2» и «1.4.8.8» тоже ловились.
  digits := regexp_replace(coalesce(t, ''), '[\s.,:;_\-–—/\\|+*''"`]+', '', 'g');
  if digits ~ '(52|1488|67|42)' then
    return true;
  end if;
  -- Буквы: убираем всё, кроме букв, чтобы «с в а с т о н» тоже ловилось.
  letters := regexp_replace(norm, '[^а-яё]+', '', 'g');
  if letters ~ '(свастон|свастик)' then
    return true;
  end if;
  return false;
end;
$$;

create function private.setting(p_key text) returns text
language sql stable security definer set search_path = public as $$
  select value from app_settings where key = p_key;
$$;

create function private.notify(p_user uuid, p_kind text, p_params jsonb default '{}', p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, params, link) values (p_user, p_kind, coalesce(p_params, '{}'), p_link);
$$;

create function private.audit(p_actor uuid, p_action text, p_target text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor_id, action, target, details) values (p_actor, p_action, p_target, coalesce(p_details, '{}'));
$$;

-- Проверяет тексты. Если что-то запрещено — выписывает автоштраф и возвращает true.
create function private.guard(p_user uuid, p_texts text[]) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  t text;
  amount int := coalesce(nullif(private.setting('forbidden_fine'), '')::int, 123);
  fine_id bigint;
begin
  foreach t in array coalesce(p_texts, '{}') loop
    if private.is_forbidden(t) then
      insert into fines (user_id, country_code, amount, reason, kind)
      values (p_user, (select country_code from profiles where id = p_user), amount,
              'Использование запрещённых слов или чисел', 'auto_forbidden')
      returning id into fine_id;
      perform private.notify(p_user, 'fine_new', jsonb_build_object('fine_id', fine_id, 'amount', amount, 'auto', true), '/cabinet/fines');
      perform private.audit(p_user, 'forbidden_attempt', p_user::text, jsonb_build_object('fine_id', fine_id));
      return true;
    end if;
  end loop;
  return false;
end;
$$;

create function private.jsonb_texts(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(value), '{}') from jsonb_each_text(coalesce(p, '{}'));
$$;

create function private.require_profile() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then
    raise exception 'E_AUTH';
  end if;
  if p.banned then
    raise exception 'E_BANNED';
  end if;
  return p;
end;
$$;

-- Единственное место, где меняется баланс. Пишет запись в журнал транзакций.
create function private.move_coins(
  p_user uuid, p_delta int, p_type public.tx_type,
  p_ref_type text default null, p_ref_id bigint default null,
  p_actor uuid default null, p_comment text default null
) returns int language plpgsql security definer set search_path = public as $$
declare
  new_balance int;
begin
  if p_delta = 0 then
    return (select balance from profiles where id = p_user);
  end if;
  update profiles set balance = balance + p_delta
  where id = p_user and balance + p_delta >= 0
  returning balance into new_balance;
  if new_balance is null then
    raise exception 'E_NO_MONEY';
  end if;
  insert into transactions (user_id, delta, balance_after, type, ref_type, ref_id, actor_id, comment)
  values (p_user, p_delta, new_balance, p_type, p_ref_type, p_ref_id, p_actor, p_comment);
  return new_balance;
end;
$$;

-- Номер документа из шести лорных чисел: например «1234 321 123 4321 321 1234».
-- Стыки этих чисел никогда не дают запрещённых сочетаний.
create function private.gen_doc_number() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  parts text[] := array['123', '321', '1234', '4321'];
  result text;
  i int;
begin
  loop
    result := '';
    for i in 1..6 loop
      if i > 1 then result := result || ' '; end if;
      result := result || parts[1 + floor(random() * 4)::int];
    end loop;
    exit when not exists (select 1 from documents where number = result);
  end loop;
  return result;
end;
$$;

create function private.issue_document(
  p_user uuid, p_type public.doc_type, p_country text, p_app bigint,
  p_valid interval default null, p_data jsonb default '{}'
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  new_id bigint;
begin
  insert into documents (user_id, type, country_code, number, data, valid_until, application_id)
  values (p_user, p_type, p_country, private.gen_doc_number(), coalesce(p_data, '{}'),
          case when p_valid is null then null else now() + p_valid end, p_app)
  returning id into new_id;
  return new_id;
end;
$$;

create function private.has_doc(p_user uuid, p_type public.doc_type, p_country text default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from documents
    where user_id = p_user and type = p_type and revoked_at is null
      and (valid_until is null or valid_until > now())
      and (p_country is null or country_code = p_country)
  );
$$;

create function private.revoke_docs(p_user uuid, p_types public.doc_type[], p_country text, p_reason text)
returns void language sql security definer set search_path = public as $$
  update documents set revoked_at = now(), revoke_reason = p_reason
  where user_id = p_user and type = any (p_types) and country_code = p_country and revoked_at is null;
$$;

-- Ошибка регистрации или null, если всё хорошо.
create function private.signup_error(p_login text, p_name text, p_invite text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  code text := coalesce(private.setting('invite_code'), '');
begin
  if p_login is null or p_login !~ '^[a-zA-Z0-9_]{3,24}$' then
    return 'E_LOGIN_FORMAT';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 40 then
    return 'E_NAME_LENGTH';
  end if;
  if private.is_forbidden(p_login) or private.is_forbidden(p_name) then
    return 'E_FORBIDDEN_NAME';
  end if;
  if exists (select 1 from profiles where lower(login) = lower(p_login)) then
    return 'E_LOGIN_TAKEN';
  end if;
  -- Первый пользователь (будущий суперадмин) регистрируется без кода.
  if code <> '' and exists (select 1 from profiles) and coalesce(p_invite, '') <> code then
    return 'E_INVITE';
  end if;
  return null;
end;
$$;

-- Создаёт профиль при регистрации в Supabase Auth.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  err text;
  first_user boolean;
begin
  err := private.signup_error(meta ->> 'login', meta ->> 'display_name', meta ->> 'invite_code');
  if err is not null then
    raise exception '%', err;
  end if;
  first_user := not exists (select 1 from profiles);
  insert into profiles (id, login, display_name, role)
  values (new.id, meta ->> 'login', btrim(meta ->> 'display_name'),
          case when first_user then 'superadmin'::public.user_role else 'citizen'::public.user_role end);
  perform private.notify(new.id, 'welcome', '{}', '/services/citizenship');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.can_review(p public.profiles, a public.applications) returns boolean
language sql stable as $$
  select p.role = 'superadmin'
    or (p.role in ('official', 'president')
        and p.gov_country_code = a.target_country
        and a.user_id <> p.id
        and (a.service_code <> 'letter_president' or p.role = 'president'));
$$;

create function private.notify_staff(p_country text, p_kind text, p_params jsonb, p_link text, p_presidents_only boolean default false)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, params, link)
  select id, p_kind, p_params, p_link from profiles
  where gov_country_code = p_country and not banned
    and (role = 'president' or (not p_presidents_only and role = 'official'));
$$;

create function private.notify_citizens(p_country text, p_kind text, p_params jsonb, p_link text)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, params, link)
  select id, p_kind, p_params, p_link from profiles
  where not banned and (p_country is null or country_code = p_country);
$$;

-- =====================================================================
-- Публичные функции (RPC)
-- =====================================================================

-- Регистрация -----------------------------------------------------------
create function public.check_signup(p_login text, p_display_name text, p_invite text default null)
returns text language sql stable security definer set search_path = public as $$
  select private.signup_error(p_login, p_display_name, p_invite);
$$;

create function public.invite_required() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(private.setting('invite_code'), '') <> '' and exists (select 1 from profiles);
$$;

-- Профиль ---------------------------------------------------------------
create function public.update_profile(p_display_name text, p_city text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if private.guard(me.id, array[p_display_name, p_city]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 40 then
    raise exception 'E_NAME_LENGTH';
  end if;
  update profiles set display_name = btrim(p_display_name), city = nullif(btrim(coalesce(p_city, '')), '')
  where id = me.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Заявления -------------------------------------------------------------
create function public.submit_application(p_service text, p_target text default null, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  svc public.services;
  target text;
  app_id bigint;
begin
  select * into svc from services where code = p_service and active;
  if svc.code is null then
    raise exception 'E_SERVICE_UNAVAILABLE';
  end if;
  p_data := coalesce(p_data, '{}');
  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'E_BAD_DATA';
  end if;

  if private.guard(me.id, private.jsonb_texts(p_data)) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;

  -- Куда подаётся заявление
  case svc.target_mode
    when 'own' then
      if me.country_code is null then raise exception 'E_NOT_CITIZEN'; end if;
      target := me.country_code;
    when 'fixed' then
      target := svc.fixed_target;
    else
      if p_target is null or not exists (select 1 from countries where code = p_target) then
        raise exception 'E_BAD_COUNTRY';
      end if;
      if svc.target_mode = 'foreign' and p_target = me.country_code then
        raise exception 'E_SAME_COUNTRY';
      end if;
      target := p_target;
  end case;

  if exists (select 1 from applications where user_id = me.id and service_code = p_service
             and status in ('submitted', 'needs_info')) then
    raise exception 'E_DUPLICATE';
  end if;

  -- Условия услуг
  case p_service
    when 'citizenship' then
      if me.country_code is not null then raise exception 'E_ALREADY_CITIZEN'; end if;
    when 'change_citizenship' then
      if me.country_code is null then raise exception 'E_NOT_CITIZEN'; end if;
    when 'residence_permit' then
      if private.has_doc(me.id, 'residence_permit', target) then raise exception 'E_ALREADY_HAS'; end if;
    when 'passport_reissue' then
      null;
    when 'intl_passport' then
      if not private.has_doc(me.id, 'passport', me.country_code) then raise exception 'E_NEED_PASSPORT'; end if;
      if private.has_doc(me.id, 'intl_passport', me.country_code) then raise exception 'E_ALREADY_HAS'; end if;
    when 'driver_license', 'psyals' then
      if not private.has_doc(me.id, 'passport', me.country_code) then raise exception 'E_NEED_PASSPORT'; end if;
      if private.has_doc(me.id, p_service::public.doc_type, me.country_code) then raise exception 'E_ALREADY_HAS'; end if;
    when 'visa' then
      if me.country_code is null then raise exception 'E_NOT_CITIZEN'; end if;
      if not private.has_doc(me.id, 'intl_passport', me.country_code) then raise exception 'E_NEED_INTL_PASSPORT'; end if;
      if private.has_doc(me.id, 'visa', target) then raise exception 'E_ALREADY_HAS'; end if;
    when 'samenka_delivery' then
      if me.country_code is null then raise exception 'E_NOT_CITIZEN'; end if;
    when 'migrant_window' then
      if not private.has_doc(me.id, 'visa', 'BOBOSTAN') and me.country_code is distinct from 'BOBOSTAN' then
        raise exception 'E_NEED_VISA';
      end if;
    else
      null;
  end case;

  insert into applications (user_id, service_code, target_country, data, fee)
  values (me.id, p_service, target, p_data, svc.fee)
  returning id into app_id;

  if svc.fee > 0 then
    perform private.move_coins(me.id, -svc.fee, 'fee', 'application', app_id, me.id, p_service);
  end if;

  perform private.notify_staff(target, 'app_new',
    jsonb_build_object('id', app_id, 'service', p_service),
    '/gov/applications/' || app_id,
    p_service = 'letter_president');

  return jsonb_build_object('ok', true, 'id', app_id);
end;
$$;

create function public.update_application(p_id bigint, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  a public.applications;
begin
  select * into a from applications where id = p_id and user_id = me.id for update;
  if a.id is null then raise exception 'E_NOT_FOUND'; end if;
  if a.status <> 'needs_info' then raise exception 'E_BAD_STATUS'; end if;
  p_data := coalesce(p_data, '{}');
  if jsonb_typeof(p_data) <> 'object' then raise exception 'E_BAD_DATA'; end if;
  if private.guard(me.id, private.jsonb_texts(p_data)) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  update applications set data = a.data || p_data, status = 'submitted', updated_at = now() where id = p_id;
  perform private.notify_staff(a.target_country, 'app_updated',
    jsonb_build_object('id', a.id, 'service', a.service_code),
    '/gov/applications/' || a.id,
    a.service_code = 'letter_president');
  return jsonb_build_object('ok', true);
end;
$$;

create function public.cancel_application(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  a public.applications;
begin
  select * into a from applications where id = p_id and user_id = me.id for update;
  if a.id is null then raise exception 'E_NOT_FOUND'; end if;
  if a.status not in ('submitted', 'needs_info') then raise exception 'E_BAD_STATUS'; end if;
  update applications set status = 'cancelled', updated_at = now() where id = p_id;
  if a.fee > 0 then
    perform private.move_coins(me.id, a.fee, 'refund', 'application', a.id, me.id, a.service_code);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.review_application(p_id bigint, p_decision text, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  a public.applications;
  applicant public.profiles;
  new_status public.app_status;
  old_country text;
begin
  select * into a from applications where id = p_id for update;
  if a.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not private.can_review(me, a) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if p_decision not in ('approve', 'reject', 'needs_info') then raise exception 'E_BAD_DATA'; end if;
  if a.status <> 'submitted' and not (a.status = 'needs_info' and p_decision = 'reject') then
    raise exception 'E_BAD_STATUS';
  end if;
  if p_decision = 'needs_info' and coalesce(btrim(p_comment), '') = '' then
    raise exception 'E_COMMENT_REQUIRED';
  end if;

  if private.guard(me.id, array[p_comment]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;

  select * into applicant from profiles where id = a.user_id for update;

  if p_decision = 'approve' then
    new_status := 'approved';
    case a.service_code
      when 'citizenship' then
        if applicant.country_code is not null then raise exception 'E_ALREADY_CITIZEN'; end if;
        update profiles set country_code = a.target_country, city = nullif(a.data ->> 'city', '') where id = applicant.id;
        perform private.issue_document(applicant.id, 'passport', a.target_country, a.id);
      when 'change_citizenship' then
        old_country := applicant.country_code;
        if old_country is not null then
          perform private.revoke_docs(applicant.id, array['passport', 'intl_passport', 'psyals', 'driver_license']::public.doc_type[],
                                      old_country, 'Смена гражданства');
        end if;
        update profiles set country_code = a.target_country, city = nullif(a.data ->> 'city', ''),
          role = case when role in ('official', 'president') and gov_country_code = old_country then 'citizen' else role end,
          gov_country_code = case when role in ('official', 'president') and gov_country_code = old_country then null else gov_country_code end
        where id = applicant.id;
        perform private.issue_document(applicant.id, 'passport', a.target_country, a.id);
      when 'residence_permit' then
        perform private.issue_document(applicant.id, 'residence_permit', a.target_country, a.id, interval '1 year',
                                       jsonb_build_object('city', a.data ->> 'city'));
      when 'passport_reissue' then
        if applicant.country_code is distinct from a.target_country then raise exception 'E_NOT_CITIZEN'; end if;
        perform private.revoke_docs(applicant.id, array['passport']::public.doc_type[], a.target_country, 'Замена паспорта');
        perform private.issue_document(applicant.id, 'passport', a.target_country, a.id);
      when 'intl_passport' then
        perform private.issue_document(applicant.id, 'intl_passport', a.target_country, a.id, interval '5 years');
      when 'driver_license' then
        perform private.issue_document(applicant.id, 'driver_license', a.target_country, a.id, interval '10 years',
                                       jsonb_build_object('category', a.data ->> 'category'));
      when 'psyals' then
        perform private.issue_document(applicant.id, 'psyals', a.target_country, a.id);
      when 'visa' then
        perform private.issue_document(applicant.id, 'visa', a.target_country, a.id, interval '30 days',
                                       jsonb_build_object('purpose', a.data ->> 'purpose'));
      else
        null; -- услуги без документа: доставка, окно, обращения
    end case;
  elsif p_decision = 'reject' then
    new_status := 'rejected';
    if a.fee > 0 then
      perform private.move_coins(applicant.id, a.fee, 'refund', 'application', a.id, me.id, a.service_code);
    end if;
  else
    new_status := 'needs_info';
  end if;

  update applications
  set status = new_status, reviewer_id = me.id, reviewer_comment = nullif(btrim(coalesce(p_comment, '')), ''),
      reviewed_at = now(), updated_at = now()
  where id = a.id;

  perform private.notify(applicant.id, 'app_status',
    jsonb_build_object('id', a.id, 'service', a.service_code, 'status', new_status),
    '/cabinet/applications/' || a.id);
  perform private.audit(me.id, 'review_application', a.id::text,
    jsonb_build_object('decision', p_decision, 'service', a.service_code));
  return jsonb_build_object('ok', true);
end;
$$;

-- Документы -------------------------------------------------------------
create function public.revoke_document(p_id bigint, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  d public.documents;
begin
  select * into d from documents where id = p_id for update;
  if d.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not public.is_staff_of(d.country_code) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if d.revoked_at is not null then raise exception 'E_BAD_STATUS'; end if;
  if private.guard(me.id, array[p_reason]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  update documents set revoked_at = now(), revoke_reason = nullif(btrim(coalesce(p_reason, '')), '') where id = p_id;
  perform private.notify(d.user_id, 'doc_revoked', jsonb_build_object('id', d.id, 'type', d.type), '/cabinet/documents');
  perform private.audit(me.id, 'revoke_document', d.id::text, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end;
$$;

-- Псякоины --------------------------------------------------------------
create function public.grant_coins(p_user uuid, p_amount int, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  target public.profiles;
begin
  select * into target from profiles where id = p_user;
  if target.id is null then raise exception 'E_NOT_FOUND'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'E_BAD_AMOUNT'; end if;
  if me.role = 'superadmin' then
    null;
  elsif me.role = 'president' and target.country_code = me.gov_country_code and p_amount > 0 then
    null;
  else
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  if private.guard(me.id, array[p_comment]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  perform private.move_coins(p_user, p_amount, case when p_amount > 0 then 'grant' else 'withdraw' end::public.tx_type,
                             null, null, me.id, nullif(btrim(coalesce(p_comment, '')), ''));
  perform private.notify(p_user, 'coins', jsonb_build_object('amount', p_amount, 'comment', p_comment), '/cabinet/wallet');
  perform private.audit(me.id, 'grant_coins', p_user::text, jsonb_build_object('amount', p_amount, 'comment', p_comment));
  return jsonb_build_object('ok', true);
end;
$$;

-- Штрафы и налоги -------------------------------------------------------
create function public.issue_fine(p_user uuid, p_amount int, p_reason text, p_kind public.fine_kind default 'fine',
                                  p_country text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  country text;
  fine_id bigint;
begin
  if me.role = 'citizen' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if p_kind not in ('fine', 'tax') then raise exception 'E_BAD_DATA'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'E_BAD_AMOUNT'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'E_REASON_REQUIRED'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'E_NOT_FOUND'; end if;
  country := case when me.role = 'superadmin' then p_country else me.gov_country_code end;
  if private.guard(me.id, array[p_reason]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  insert into fines (user_id, country_code, amount, reason, kind, issued_by)
  values (p_user, country, p_amount, btrim(p_reason), p_kind, me.id)
  returning id into fine_id;
  perform private.notify(p_user, 'fine_new', jsonb_build_object('fine_id', fine_id, 'amount', p_amount, 'kind', p_kind), '/cabinet/fines');
  perform private.audit(me.id, 'issue_fine', p_user::text, jsonb_build_object('fine_id', fine_id, 'amount', p_amount));
  return jsonb_build_object('ok', true, 'id', fine_id);
end;
$$;

create function public.pay_fine(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  f public.fines;
begin
  select * into f from fines where id = p_id and user_id = me.id for update;
  if f.id is null then raise exception 'E_NOT_FOUND'; end if;
  if f.status <> 'unpaid' then raise exception 'E_BAD_STATUS'; end if;
  perform private.move_coins(me.id, -f.amount, 'fine_payment', 'fine', f.id, me.id, f.reason);
  update fines set status = 'paid', paid_at = now() where id = f.id;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.cancel_fine(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  f public.fines;
begin
  select * into f from fines where id = p_id for update;
  if f.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not (me.role = 'superadmin' or (f.country_code is not null and public.is_staff_of(f.country_code))) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  if f.status <> 'unpaid' then raise exception 'E_BAD_STATUS'; end if;
  update fines set status = 'cancelled' where id = f.id;
  perform private.notify(f.user_id, 'fine_cancelled', jsonb_build_object('fine_id', f.id, 'amount', f.amount), '/cabinet/fines');
  perform private.audit(me.id, 'cancel_fine', f.id::text, '{}');
  return jsonb_build_object('ok', true);
end;
$$;

-- Новости и указы -------------------------------------------------------
create function public.post_news(p_kind public.news_kind, p_title text, p_body text, p_country text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  country text;
  news_id bigint;
begin
  if me.role = 'citizen' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if me.role = 'official' and p_kind = 'decree' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_body), '') = '' then raise exception 'E_REQUIRED'; end if;
  country := case when me.role = 'superadmin' then p_country else me.gov_country_code end;
  if private.guard(me.id, array[p_title, p_body]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  insert into news (country_code, author_id, kind, title, body)
  values (country, me.id, p_kind, btrim(p_title), btrim(p_body))
  returning id into news_id;
  if p_kind = 'decree' then
    perform private.notify_citizens(country, 'decree', jsonb_build_object('id', news_id, 'title', btrim(p_title)), '/news/' || news_id);
  end if;
  perform private.audit(me.id, 'post_news', news_id::text, jsonb_build_object('kind', p_kind));
  return jsonb_build_object('ok', true, 'id', news_id);
end;
$$;

create function public.delete_news(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  n public.news;
begin
  select * into n from news where id = p_id;
  if n.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not (me.role = 'superadmin' or n.author_id = me.id) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  delete from news where id = p_id;
  perform private.audit(me.id, 'delete_news', p_id::text, '{}');
  return jsonb_build_object('ok', true);
end;
$$;

-- Выборы ----------------------------------------------------------------
create function public.create_election(p_title text, p_description text, p_country text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  country text;
  el_id bigint;
begin
  country := case when me.role = 'superadmin' then p_country else me.gov_country_code end;
  if country is null or not public.is_president_of(country) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'E_REQUIRED'; end if;
  if private.guard(me.id, array[p_title, p_description]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  insert into elections (country_code, title, description, created_by)
  values (country, btrim(p_title), coalesce(btrim(p_description), ''), me.id)
  returning id into el_id;
  perform private.audit(me.id, 'create_election', el_id::text, '{}');
  return jsonb_build_object('ok', true, 'id', el_id);
end;
$$;

create function public.add_candidate(p_election bigint, p_user uuid, p_name text, p_program text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  e public.elections;
  cand_name text := p_name;
  cand_id bigint;
begin
  select * into e from elections where id = p_election;
  if e.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not public.is_president_of(e.country_code) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if e.status <> 'draft' then raise exception 'E_BAD_STATUS'; end if;
  if p_user is not null and coalesce(btrim(cand_name), '') = '' then
    select display_name into cand_name from profiles where id = p_user;
  end if;
  if coalesce(btrim(cand_name), '') = '' then raise exception 'E_REQUIRED'; end if;
  if private.guard(me.id, array[cand_name, p_program]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  insert into candidates (election_id, user_id, name, program)
  values (e.id, p_user, btrim(cand_name), coalesce(btrim(p_program), ''))
  returning id into cand_id;
  return jsonb_build_object('ok', true, 'id', cand_id);
end;
$$;

create function public.remove_candidate(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  e public.elections;
begin
  select el.* into e from elections el join candidates c on c.election_id = el.id where c.id = p_id;
  if e.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not public.is_president_of(e.country_code) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if e.status <> 'draft' then raise exception 'E_BAD_STATUS'; end if;
  delete from candidates where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.set_election_status(p_id bigint, p_status public.election_status)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  e public.elections;
begin
  select * into e from elections where id = p_id for update;
  if e.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not public.is_president_of(e.country_code) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if e.status = 'draft' and p_status = 'open' then
    if (select count(*) from candidates where election_id = e.id) < 2 then raise exception 'E_FEW_CANDIDATES'; end if;
    update elections set status = 'open', opened_at = now() where id = e.id;
    perform private.notify_citizens(e.country_code, 'election_open', jsonb_build_object('id', e.id, 'title', e.title), '/elections/' || e.id);
  elsif e.status = 'open' and p_status = 'closed' then
    update elections set status = 'closed', closed_at = now() where id = e.id;
    perform private.notify_citizens(e.country_code, 'election_closed', jsonb_build_object('id', e.id, 'title', e.title), '/elections/' || e.id);
  else
    raise exception 'E_BAD_STATUS';
  end if;
  perform private.audit(me.id, 'election_status', e.id::text, jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.vote(p_election bigint, p_candidate bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  e public.elections;
begin
  select * into e from elections where id = p_election;
  if e.id is null then raise exception 'E_NOT_FOUND'; end if;
  if e.status <> 'open' then raise exception 'E_BAD_STATUS'; end if;
  if me.country_code is distinct from e.country_code then raise exception 'E_NOT_CITIZEN'; end if;
  if not exists (select 1 from candidates where id = p_candidate and election_id = e.id) then raise exception 'E_NOT_FOUND'; end if;
  begin
    insert into votes (election_id, user_id, candidate_id) values (e.id, me.id, p_candidate);
  exception when unique_violation then
    raise exception 'E_ALREADY_VOTED';
  end;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.election_results(p_id bigint)
returns table (candidate_id bigint, votes bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  e public.elections;
begin
  select * into e from elections where id = p_id;
  if e.id is null then raise exception 'E_NOT_FOUND'; end if;
  if e.status <> 'closed' and not public.is_staff_of(e.country_code) then
    raise exception 'E_RESULTS_HIDDEN';
  end if;
  return query
    select c.id, count(v.user_id)
    from candidates c left join votes v on v.candidate_id = c.id
    where c.election_id = e.id
    group by c.id
    order by count(v.user_id) desc, c.id;
end;
$$;

create function public.election_turnout(p_id bigint) returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from votes where election_id = p_id;
$$;

-- Розыск ----------------------------------------------------------------
create function public.wanted_create(p_name text, p_description text, p_reward int default 0,
                                     p_country text default null, p_linked_user uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  country text;
  w_id bigint;
begin
  if me.role = 'citizen' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'E_REQUIRED'; end if;
  if coalesce(p_reward, 0) < 0 then raise exception 'E_BAD_AMOUNT'; end if;
  country := case when me.role = 'superadmin' then p_country else me.gov_country_code end;
  if private.guard(me.id, array[p_name, p_description]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  insert into wanted (country_code, name, description, reward, linked_user_id, created_by)
  values (country, btrim(p_name), coalesce(btrim(p_description), ''), coalesce(p_reward, 0), p_linked_user, me.id)
  returning id into w_id;
  perform private.audit(me.id, 'wanted_create', w_id::text, '{}');
  return jsonb_build_object('ok', true, 'id', w_id);
end;
$$;

create function public.wanted_set_active(p_id bigint, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  w public.wanted;
begin
  select * into w from wanted where id = p_id;
  if w.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not (me.role = 'superadmin' or (w.country_code is not null and public.is_staff_of(w.country_code))) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  update wanted set active = p_active where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Должники: у кого есть неоплаченные штрафы.
create function public.debtors()
returns table (user_id uuid, login text, display_name text, country_code text, total bigint, fines_count bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.login, p.display_name, p.country_code, sum(f.amount), count(*)
  from fines f join profiles p on p.id = f.user_id
  where f.status = 'unpaid' and auth.uid() is not null
  group by p.id
  order by sum(f.amount) desc;
$$;

-- Уведомления -----------------------------------------------------------
create function public.mark_notifications_read(p_ids bigint[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  update notifications set read_at = now()
  where user_id = me.id and read_at is null and (p_ids is null or id = any (p_ids));
  return jsonb_build_object('ok', true);
end;
$$;

-- Управление людьми -----------------------------------------------------
create function public.admin_set_role(p_user uuid, p_role public.user_role, p_gov_country text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if me.role <> 'superadmin' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if p_user = me.id and p_role <> 'superadmin' then raise exception 'E_SELF'; end if;
  if p_role in ('official', 'president') and p_gov_country is null then raise exception 'E_BAD_COUNTRY'; end if;
  update profiles
  set role = p_role,
      gov_country_code = case when p_role in ('official', 'president') then p_gov_country else null end
  where id = p_user;
  if not found then raise exception 'E_NOT_FOUND'; end if;
  perform private.notify(p_user, 'role_changed', jsonb_build_object('role', p_role, 'country', p_gov_country), '/cabinet');
  perform private.audit(me.id, 'set_role', p_user::text, jsonb_build_object('role', p_role, 'country', p_gov_country));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.president_set_official(p_user uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  target public.profiles;
begin
  if me.role <> 'president' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  select * into target from profiles where id = p_user;
  if target.id is null then raise exception 'E_NOT_FOUND'; end if;
  if target.country_code is distinct from me.gov_country_code then raise exception 'E_NOT_CITIZEN'; end if;
  if p_on and target.role = 'citizen' then
    update profiles set role = 'official', gov_country_code = me.gov_country_code where id = p_user;
  elsif not p_on and target.role = 'official' and target.gov_country_code = me.gov_country_code then
    update profiles set role = 'citizen', gov_country_code = null where id = p_user;
  else
    raise exception 'E_BAD_STATUS';
  end if;
  perform private.notify(p_user, 'role_changed',
    jsonb_build_object('role', case when p_on then 'official' else 'citizen' end, 'country', me.gov_country_code), '/cabinet');
  perform private.audit(me.id, 'set_official', p_user::text, jsonb_build_object('on', p_on));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.admin_set_banned(p_user uuid, p_banned boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if me.role <> 'superadmin' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if p_user = me.id then raise exception 'E_SELF'; end if;
  update profiles set banned = p_banned where id = p_user;
  if not found then raise exception 'E_NOT_FOUND'; end if;
  perform private.audit(me.id, 'set_banned', p_user::text, jsonb_build_object('banned', p_banned));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.admin_set_country(p_user uuid, p_country text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  target public.profiles;
begin
  if me.role <> 'superadmin' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  select * into target from profiles where id = p_user for update;
  if target.id is null then raise exception 'E_NOT_FOUND'; end if;
  if target.country_code is not null and target.country_code is distinct from p_country then
    perform private.revoke_docs(p_user, array['passport', 'intl_passport', 'psyals', 'driver_license']::public.doc_type[],
                                target.country_code, 'Решение администрации');
  end if;
  update profiles set country_code = p_country where id = p_user;
  if p_country is not null and not private.has_doc(p_user, 'passport', p_country) then
    perform private.issue_document(p_user, 'passport', p_country, null);
  end if;
  perform private.notify(p_user, 'country_changed', jsonb_build_object('country', p_country), '/cabinet');
  perform private.audit(me.id, 'set_country', p_user::text, jsonb_build_object('country', p_country));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.admin_set_setting(p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if me.role <> 'superadmin' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if p_key not in ('invite_code', 'forbidden_fine') then raise exception 'E_BAD_DATA'; end if;
  if p_key = 'forbidden_fine' and (p_value !~ '^[0-9]+$' or p_value::int <= 0) then raise exception 'E_BAD_AMOUNT'; end if;
  update app_settings set value = coalesce(p_value, '') where key = p_key;
  perform private.audit(me.id, 'set_setting', p_key, '{}');
  return jsonb_build_object('ok', true);
end;
$$;

create function public.admin_update_service(p_code text, p_fee int, p_active boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if me.role <> 'superadmin' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if p_fee is null or p_fee < 0 then raise exception 'E_BAD_AMOUNT'; end if;
  update services set fee = p_fee, active = coalesce(p_active, true) where code = p_code;
  if not found then raise exception 'E_NOT_FOUND'; end if;
  perform private.audit(me.id, 'update_service', p_code, jsonb_build_object('fee', p_fee, 'active', p_active));
  return jsonb_build_object('ok', true);
end;
$$;

-- =====================================================================
-- Права доступа и RLS
-- =====================================================================
alter table public.countries enable row level security;
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.services enable row level security;
alter table public.applications enable row level security;
alter table public.documents enable row level security;
alter table public.fines enable row level security;
alter table public.transactions enable row level security;
alter table public.news enable row level security;
alter table public.elections enable row level security;
alter table public.candidates enable row level security;
alter table public.votes enable row level security;
alter table public.wanted enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- Открыто всем, включая гостей
create policy countries_read on public.countries for select using (true);
create policy services_read on public.services for select using (true);
create policy news_read on public.news for select using (true);
create policy elections_read on public.elections for select using (true);
create policy candidates_read on public.candidates for select using (true);
create policy wanted_read on public.wanted for select using (true);

-- Только для вошедших
create policy profiles_read on public.profiles for select to authenticated using (true);

create policy applications_read on public.applications for select to authenticated using (
  user_id = (select auth.uid())
  or public.is_superadmin()
  or (public.is_staff_of(target_country)
      and (service_code <> 'letter_president' or public.is_president_of(target_country)))
);

create policy documents_read on public.documents for select to authenticated using (
  user_id = (select auth.uid()) or public.is_any_staff()
);

create policy fines_read on public.fines for select to authenticated using (
  user_id = (select auth.uid()) or public.is_superadmin()
  or (country_code is not null and public.is_staff_of(country_code))
);

create policy transactions_read on public.transactions for select to authenticated using (
  user_id = (select auth.uid()) or public.is_superadmin()
);

create policy votes_read on public.votes for select to authenticated using (user_id = (select auth.uid()));

create policy notifications_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));

create policy audit_read on public.audit_log for select to authenticated using (public.is_superadmin());

create policy settings_read on public.app_settings for select to authenticated using (public.is_superadmin());

-- Никаких прямых записей: только чтение, изменения — через функции.
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;

-- Внутренняя схема закрыта полностью.
revoke all on schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- Гостям доступны только функции регистрации.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.check_signup(text, text, text) to anon;
grant execute on function public.invite_required() to anon;
