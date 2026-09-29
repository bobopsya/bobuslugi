-- =====================================================================
-- Бобуслуги: население, казна и зарплаты, бизнес и имущество, суд
-- Все типы указаны со схемой: SQL Editor в Supabase проверяет функции без public в search_path.
-- Новые значения перечислений используются только внутри тел функций (так можно в одной транзакции).
-- =====================================================================

alter type public.doc_type add value if not exists 'business_reg';
alter type public.doc_type add value if not exists 'license';
alter type public.doc_type add value if not exists 'property';
alter type public.doc_type add value if not exists 'vehicle';
alter type public.fine_kind add value if not exists 'court';
alter type public.tx_type add value if not exists 'salary';
alter type public.tx_type add value if not exists 'court';
alter type public.tx_type add value if not exists 'sale';

-- ---------------------------------------------------------------------
-- Колонки
-- ---------------------------------------------------------------------
alter table public.countries
  add column population_bonus bigint not null default 0,
  add column treasury bigint not null default 0,
  add column business_tax int not null default 123 check (business_tax >= 0),
  add column property_tax int not null default 123 check (property_tax >= 0);

alter table public.profiles
  add column salary int not null default 0 check (salary >= 0),
  add column registered_address text;

alter table public.fines add column beneficiary_id uuid references public.profiles (id) on delete set null;

-- Тип документа услуги храним текстом: новые значения перечисления нельзя вставлять в той же транзакции.
alter table public.services alter column doc_type type text using doc_type::text;

insert into public.app_settings (key, value) values ('court_fee', '123') on conflict (key) do nothing;

insert into public.services (code, category, target_mode, fixed_target, fee, sort, needs_photo, needs_exam, doc_type) values
  ('business_registration', 'business', 'own', null, 321, 40, false, false, 'business_reg'),
  ('license',               'business', 'own', null, 123, 41, false, false, 'license'),
  ('property_registration', 'business', 'own', null, 123, 42, false, false, 'property'),
  ('vehicle_registration',  'business', 'own', null, 123, 43, false, false, 'vehicle')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------
create table public.treasury_tx (
  id bigint generated always as identity primary key,
  country_code text not null references public.countries (code),
  delta bigint not null,
  balance_after bigint not null,
  type text not null,
  ref_type text,
  ref_id bigint,
  actor_id uuid references public.profiles (id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);
create index on public.treasury_tx (country_code, id);

create table public.property_offers (
  id bigint generated always as identity primary key,
  document_id bigint not null references public.documents (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  price int not null check (price >= 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.lawsuits (
  id bigint generated always as identity primary key,
  plaintiff_id uuid not null references public.profiles (id) on delete cascade,
  defendant_id uuid not null references public.profiles (id) on delete cascade,
  country_code text not null references public.countries (code),
  amount int not null check (amount >= 0),
  claim text not null,
  defense text,
  status text not null default 'filed' check (status in ('filed', 'hearing', 'decided', 'dismissed')),
  hearing_at timestamptz,
  place text,
  judge_id uuid references public.profiles (id) on delete set null,
  judge_signature_path text,
  verdict text,
  awarded int check (awarded >= 0),
  fine_id bigint references public.fines (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

-- ---------------------------------------------------------------------
-- Казна
-- ---------------------------------------------------------------------
create function private.move_treasury(
  p_country text, p_delta bigint, p_type text,
  p_ref_type text default null, p_ref_id bigint default null,
  p_actor uuid default null, p_comment text default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  new_balance bigint;
begin
  if p_country is null or p_delta = 0 then return null; end if;
  update countries set treasury = treasury + p_delta where code = p_country returning treasury into new_balance;
  insert into treasury_tx (country_code, delta, balance_after, type, ref_type, ref_id, actor_id, comment)
  values (p_country, p_delta, new_balance, p_type, p_ref_type, p_ref_id, p_actor, p_comment);
  return new_balance;
end;
$$;

-- Любое движение псякоинов граждан, связанное с государством, отражается в казне.
create function private.tx_to_treasury() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  country text;
  f public.fines;
begin
  if new.type::text in ('fee', 'refund') and new.ref_type = 'application' then
    select target_country into country from applications where id = new.ref_id;
    perform private.move_treasury(country, -new.delta, new.type::text, 'application', new.ref_id, new.actor_id, new.comment);
  elsif new.type::text in ('fee', 'refund') and new.ref_type = 'lawsuit' then
    select country_code into country from lawsuits where id = new.ref_id;
    perform private.move_treasury(country, -new.delta, 'court_fee', 'lawsuit', new.ref_id, new.actor_id, new.comment);
  elsif new.type::text = 'fine_payment' and new.ref_type = 'fine' then
    select * into f from fines where id = new.ref_id;
    if f.beneficiary_id is not null then
      -- Взыскание по суду уходит истцу, а не в казну
      perform private.move_coins(f.beneficiary_id, -new.delta, 'court', 'fine', f.id, new.user_id, f.reason);
      perform private.notify(f.beneficiary_id, 'court_paid', jsonb_build_object('amount', -new.delta), '/cabinet/wallet');
    elsif f.country_code is not null then
      perform private.move_treasury(f.country_code, -new.delta, case when f.kind::text = 'tax' then 'tax' else 'fine' end,
                                    'fine', f.id, new.user_id, f.reason);
    end if;
  end if;
  return null;
end;
$$;

create trigger transactions_to_treasury
  after insert on public.transactions
  for each row execute function private.tx_to_treasury();

-- ---------------------------------------------------------------------
-- Население и статистика
-- ---------------------------------------------------------------------
create function public.country_stats()
returns table (code text, population bigint, players bigint, treasury bigint, businesses bigint)
language sql stable security definer set search_path = public as $$
  select c.code,
         c.population_bonus + (select count(*) from public.profiles p where p.country_code = c.code),
         (select count(*) from public.profiles p where p.country_code = c.code),
         c.treasury,
         (select count(*) from public.documents d where d.country_code = c.code and d.type::text = 'business_reg' and d.revoked_at is null)
  from public.countries c
  order by 2 desc;
$$;

create function public.add_population(p_country text, p_amount bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  players bigint;
  c public.countries;
begin
  if not (me.role = 'superadmin' or (me.role = 'president' and me.gov_country_code = p_country)) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000000 then raise exception 'E_BAD_AMOUNT'; end if;
  select * into c from countries where code = p_country for update;
  if c.code is null then raise exception 'E_BAD_COUNTRY'; end if;
  select count(*) into players from profiles where country_code = p_country;
  if c.population_bonus + p_amount + players < 0 then raise exception 'E_BAD_AMOUNT'; end if;
  update countries set population_bonus = population_bonus + p_amount where code = p_country;
  perform private.audit(me.id, 'add_population', p_country, jsonb_build_object('amount', p_amount));
  return jsonb_build_object('ok', true, 'population', c.population_bonus + p_amount + players);
end;
$$;

-- ---------------------------------------------------------------------
-- Псякоины: из казны или печатным станком
-- ---------------------------------------------------------------------
drop function public.grant_coins(uuid, int, text);

create function public.grant_coins(p_user uuid, p_amount int, p_comment text default null, p_source text default 'mint')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  target public.profiles;
  country text;
  bal bigint;
begin
  select * into target from profiles where id = p_user;
  if target.id is null then raise exception 'E_NOT_FOUND'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'E_BAD_AMOUNT'; end if;
  if p_source not in ('mint', 'treasury') then raise exception 'E_BAD_DATA'; end if;
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
  if p_source = 'treasury' then
    if p_amount < 0 then raise exception 'E_BAD_AMOUNT'; end if;
    country := coalesce(case when me.role = 'president' then me.gov_country_code end, target.country_code);
    select treasury into bal from countries where code = country for update;
    if country is null or bal < p_amount then raise exception 'E_TREASURY'; end if;
    perform private.move_treasury(country, -p_amount, 'grant', 'user', null, me.id, p_comment);
  end if;
  perform private.move_coins(p_user, p_amount, case when p_amount > 0 then 'grant' else 'withdraw' end::public.tx_type,
                             null, null, me.id, nullif(btrim(coalesce(p_comment, '')), ''));
  perform private.notify(p_user, 'coins', jsonb_build_object('amount', p_amount, 'comment', p_comment), '/cabinet/wallet');
  perform private.audit(me.id, 'grant_coins', p_user::text, jsonb_build_object('amount', p_amount, 'source', p_source));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.admin_treasury(p_country text, p_amount bigint, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if me.role <> 'superadmin' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'E_BAD_AMOUNT'; end if;
  if not exists (select 1 from countries where code = p_country) then raise exception 'E_BAD_COUNTRY'; end if;
  perform private.move_treasury(p_country, p_amount, 'mint', null, null, me.id, nullif(btrim(coalesce(p_comment, '')), ''));
  perform private.audit(me.id, 'admin_treasury', p_country, jsonb_build_object('amount', p_amount));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Зарплаты
-- ---------------------------------------------------------------------
create function public.set_salary(p_user uuid, p_amount int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  target public.profiles;
begin
  select * into target from profiles where id = p_user;
  if target.id is null then raise exception 'E_NOT_FOUND'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'E_BAD_AMOUNT'; end if;
  if target.role not in ('official', 'president') then raise exception 'E_NOT_STAFF'; end if;
  if not (me.role = 'superadmin' or (me.role = 'president' and me.gov_country_code = target.gov_country_code)) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  update profiles set salary = p_amount where id = p_user;
  perform private.audit(me.id, 'set_salary', p_user::text, jsonb_build_object('amount', p_amount));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.pay_salaries(p_country text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  total bigint;
  bal bigint;
  cnt int := 0;
  s record;
begin
  if not (me.role = 'superadmin' or (me.role = 'president' and me.gov_country_code = p_country)) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  select coalesce(sum(salary), 0) into total from profiles
  where gov_country_code = p_country and role in ('official', 'president') and salary > 0 and not banned;
  if total = 0 then raise exception 'E_NO_SALARIES'; end if;
  select treasury into bal from countries where code = p_country for update;
  if bal < total then raise exception 'E_TREASURY'; end if;
  for s in select id, salary from profiles
           where gov_country_code = p_country and role in ('official', 'president') and salary > 0 and not banned loop
    perform private.move_treasury(p_country, -s.salary, 'salary', 'user', null, me.id, s.id::text);
    perform private.move_coins(s.id, s.salary, 'salary', null, null, me.id, 'Зарплата');
    perform private.notify(s.id, 'salary', jsonb_build_object('amount', s.salary), '/cabinet/wallet');
    cnt := cnt + 1;
  end loop;
  perform private.audit(me.id, 'pay_salaries', p_country, jsonb_build_object('count', cnt, 'total', total));
  return jsonb_build_object('ok', true, 'count', cnt, 'total', total);
end;
$$;

-- ---------------------------------------------------------------------
-- Налоги на бизнес и имущество
-- ---------------------------------------------------------------------
create function public.set_country_taxes(p_country text, p_business_tax int, p_property_tax int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if not (me.role = 'superadmin' or (me.role = 'president' and me.gov_country_code = p_country)) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  if p_business_tax is null or p_business_tax < 0 or p_property_tax is null or p_property_tax < 0 then
    raise exception 'E_BAD_AMOUNT';
  end if;
  update countries set business_tax = p_business_tax, property_tax = p_property_tax where code = p_country;
  perform private.audit(me.id, 'set_taxes', p_country, jsonb_build_object('business', p_business_tax, 'property', p_property_tax));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.collect_taxes(p_country text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  c public.countries;
  d record;
  amount int;
  fine_id bigint;
  cnt int := 0;
begin
  if not (me.role = 'superadmin' or (me.role = 'president' and me.gov_country_code = p_country)) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  select * into c from countries where code = p_country;
  for d in select id, user_id, type::text as t, number from documents
           where country_code = p_country and revoked_at is null
             and (valid_until is null or valid_until > now())
             and type::text in ('business_reg', 'property', 'vehicle') loop
    amount := case when d.t = 'business_reg' then c.business_tax else c.property_tax end;
    continue when amount <= 0;
    insert into fines (user_id, country_code, amount, reason, kind, issued_by)
    values (d.user_id, p_country, amount,
            case d.t when 'business_reg' then 'Налог на бизнес' when 'property' then 'Налог на имущество' else 'Транспортный налог' end
              || ' (' || d.number || ')',
            'tax', me.id)
    returning id into fine_id;
    perform private.notify(d.user_id, 'fine_new', jsonb_build_object('fine_id', fine_id, 'amount', amount, 'kind', 'tax'), '/cabinet/fines');
    cnt := cnt + 1;
  end loop;
  perform private.audit(me.id, 'collect_taxes', p_country, jsonb_build_object('count', cnt));
  return jsonb_build_object('ok', true, 'count', cnt);
end;
$$;

-- ---------------------------------------------------------------------
-- Новые услуги: нужен действующий паспорт
-- ---------------------------------------------------------------------
create function private.check_business_services() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.service_code in ('business_registration', 'license', 'property_registration', 'vehicle_registration') then
    if not private.has_doc(new.user_id, 'passport', new.target_country) then
      raise exception 'E_NEED_PASSPORT';
    end if;
  end if;
  return new;
end;
$$;

create trigger applications_business_check
  before insert on public.applications
  for each row execute function private.check_business_services();

-- Госномер из лорных чисел, например «Б 1234 ПС 321».
create function private.gen_plate() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  letters text[] := array['А', 'Б', 'В', 'Е', 'К', 'М', 'Н', 'О', 'П', 'Р', 'С', 'Т', 'У', 'Х'];
  nums text[] := array['123', '321', '1234', '4321'];
  result text;
begin
  loop
    result := letters[1 + floor(random() * 14)::int] || ' ' || nums[1 + floor(random() * 4)::int] || ' '
              || letters[1 + floor(random() * 14)::int] || letters[1 + floor(random() * 14)::int] || ' '
              || nums[1 + floor(random() * 2)::int];
    exit when not exists (select 1 from documents where number = result);
  end loop;
  return result;
end;
$$;

-- Анкетные данные владельца из его действующего паспорта.
create function private.holder_data(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
      'last_name', d.data ->> 'last_name', 'first_name', d.data ->> 'first_name', 'patronymic', d.data ->> 'patronymic',
      'sex', d.data ->> 'sex', 'birth_date', d.data ->> 'birth_date', 'birth_place', d.data ->> 'birth_place'))
    from public.documents d
    where d.user_id = p_user and d.type = 'passport' and d.revoked_at is null
    order by d.issued_at desc limit 1), '{}');
$$;

-- Получение документа: добавлены бизнес, лицензии, недвижимость и транспорт.
create or replace function public.receive_document(p_app bigint, p_signature_path text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  a public.applications;
  applicant public.profiles;
  old_country text;
  doc_id bigint;
  holder jsonb;
begin
  select * into a from applications where id = p_app and user_id = me.id for update;
  if a.id is null then raise exception 'E_NOT_FOUND'; end if;
  if a.status::text <> 'producing' then raise exception 'E_BAD_STATUS'; end if;
  if a.ready_at is null or a.ready_at > now() then raise exception 'E_NOT_READY'; end if;
  if not private.own_file(me.id, 'signatures', p_signature_path) then raise exception 'E_NEED_SIGNATURE'; end if;

  select * into applicant from profiles where id = a.user_id for update;
  holder := private.holder_data(applicant.id);

  case a.service_code
    when 'citizenship' then
      if applicant.country_code is not null then raise exception 'E_ALREADY_CITIZEN'; end if;
      update profiles set country_code = a.target_country, city = coalesce(nullif(a.data ->> 'city', ''), city)
      where id = applicant.id;
      doc_id := private.issue_from_application(a, 'passport', null, '{}', p_signature_path);
    when 'change_citizenship' then
      old_country := applicant.country_code;
      if old_country is not null then
        perform private.revoke_docs(applicant.id, array['passport', 'intl_passport', 'psyals', 'driver_license']::public.doc_type[],
                                    old_country, 'Смена гражданства');
      end if;
      update profiles set country_code = a.target_country, city = coalesce(nullif(a.data ->> 'city', ''), city),
        role = case when role in ('official', 'president') and gov_country_code = old_country then 'citizen'::public.user_role else role end,
        gov_country_code = case when role in ('official', 'president') and gov_country_code = old_country then null else gov_country_code end
      where id = applicant.id;
      doc_id := private.issue_from_application(a, 'passport', null, '{}', p_signature_path);
    when 'passport_reissue' then
      if applicant.country_code is distinct from a.target_country then raise exception 'E_NOT_CITIZEN'; end if;
      perform private.revoke_docs(applicant.id, array['passport']::public.doc_type[], a.target_country, 'Замена паспорта');
      doc_id := private.issue_from_application(a, 'passport', null, '{}', p_signature_path);
    when 'residence_permit' then
      doc_id := private.issue_from_application(a, 'residence_permit', interval '1 year',
                                               jsonb_build_object('city', a.data ->> 'city'), p_signature_path);
    when 'intl_passport' then
      doc_id := private.issue_from_application(a, 'intl_passport', interval '5 years', '{}', p_signature_path);
    when 'driver_license' then
      doc_id := private.issue_from_application(a, 'driver_license', interval '10 years',
                                               jsonb_build_object('category', a.data ->> 'category'), p_signature_path);
    when 'psyals' then
      doc_id := private.issue_from_application(a, 'psyals', null, holder, p_signature_path);
    when 'visa' then
      doc_id := private.issue_from_application(a, 'visa', interval '30 days',
                                               jsonb_build_object('purpose', a.data ->> 'purpose'), p_signature_path);
    when 'business_registration' then
      doc_id := private.issue_from_application(a, 'business_reg', null, holder || jsonb_strip_nulls(jsonb_build_object(
        'name', a.data ->> 'name', 'org_type', a.data ->> 'org_type', 'activity', a.data ->> 'activity')), p_signature_path);
    when 'license' then
      doc_id := private.issue_from_application(a, 'license', interval '1 year',
                                               holder || jsonb_build_object('kind', a.data ->> 'kind'), p_signature_path);
    when 'property_registration' then
      doc_id := private.issue_from_application(a, 'property', null, holder || jsonb_strip_nulls(jsonb_build_object(
        'address', a.data ->> 'address', 'prop_type', a.data ->> 'prop_type', 'area', a.data ->> 'area')), p_signature_path);
    when 'vehicle_registration' then
      doc_id := private.issue_from_application(a, 'vehicle', null, holder || jsonb_strip_nulls(jsonb_build_object(
        'brand', a.data ->> 'brand', 'model', a.data ->> 'model', 'color', a.data ->> 'color')), p_signature_path);
      update documents set number = private.gen_plate() where id = doc_id;
    else
      raise exception 'E_BAD_STATUS';
  end case;

  update applications
  set status = 'issued', received_at = now(), receipt_signature_path = p_signature_path, updated_at = now()
  where id = a.id;
  perform private.audit(me.id, 'receive_document', a.id::text, jsonb_build_object('document', doc_id));
  return jsonb_build_object('ok', true, 'document_id', doc_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Прописка и продажа имущества
-- ---------------------------------------------------------------------
create function public.set_registration(p_doc bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  d public.documents;
begin
  if p_doc is null then
    update profiles set registered_address = null where id = me.id;
    return jsonb_build_object('ok', true);
  end if;
  select * into d from documents where id = p_doc and user_id = me.id and type::text = 'property' and revoked_at is null;
  if d.id is null then raise exception 'E_NOT_FOUND'; end if;
  update profiles set registered_address = coalesce(d.data ->> 'address', '—') where id = me.id;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.offer_property(p_doc bigint, p_to uuid, p_price int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  d public.documents;
  offer_id bigint;
begin
  select * into d from documents where id = p_doc and user_id = me.id and type::text in ('property', 'vehicle')
    and revoked_at is null;
  if d.id is null then raise exception 'E_NOT_FOUND'; end if;
  if p_to is null or p_to = me.id or not exists (select 1 from profiles where id = p_to) then raise exception 'E_BAD_DATA'; end if;
  if p_price is null or p_price < 0 then raise exception 'E_BAD_AMOUNT'; end if;
  if exists (select 1 from property_offers where document_id = p_doc and status = 'pending') then raise exception 'E_DUPLICATE'; end if;
  insert into property_offers (document_id, from_user, to_user, price) values (p_doc, me.id, p_to, p_price)
  returning id into offer_id;
  perform private.notify(p_to, 'property_offer', jsonb_build_object('type', d.type, 'amount', p_price), '/cabinet/property');
  return jsonb_build_object('ok', true, 'id', offer_id);
end;
$$;

create function public.respond_offer(p_offer bigint, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  o public.property_offers;
  d public.documents;
  new_number text;
  new_id bigint;
begin
  select * into o from property_offers where id = p_offer for update;
  if o.id is null then raise exception 'E_NOT_FOUND'; end if;
  if o.status <> 'pending' then raise exception 'E_BAD_STATUS'; end if;

  -- Продавец может только отозвать предложение
  if me.id = o.from_user then
    if p_accept then raise exception 'E_FORBIDDEN_ACTION'; end if;
    update property_offers set status = 'cancelled' where id = o.id;
    return jsonb_build_object('ok', true);
  end if;
  if me.id <> o.to_user then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if not p_accept then
    update property_offers set status = 'declined' where id = o.id;
    perform private.notify(o.from_user, 'property_declined', jsonb_build_object('amount', o.price), '/cabinet/property');
    return jsonb_build_object('ok', true);
  end if;

  select * into d from documents where id = o.document_id and user_id = o.from_user and revoked_at is null for update;
  if d.id is null then raise exception 'E_NOT_FOUND'; end if;
  if o.price > 0 then
    perform private.move_coins(me.id, -o.price, 'sale', 'offer', o.id, me.id, 'Покупка');
    perform private.move_coins(o.from_user, o.price, 'sale', 'offer', o.id, me.id, 'Продажа');
  end if;
  update documents set revoked_at = now(), revoke_reason = 'Продажа' where id = d.id;
  if d.type::text = 'property' then
    update profiles set registered_address = null
    where id = o.from_user and registered_address = d.data ->> 'address';
  end if;
  new_number := case when d.type::text = 'vehicle' then private.gen_plate() else private.gen_doc_number() end;
  insert into documents (user_id, type, country_code, number, data, valid_until, issuer, division_code, issued_by)
  values (me.id, d.type, d.country_code, new_number,
          (d.data - 'last_name' - 'first_name' - 'patronymic' - 'sex' - 'birth_date' - 'birth_place') || private.holder_data(me.id),
          d.valid_until, d.issuer, d.division_code, d.issued_by)
  returning id into new_id;
  update property_offers set status = 'accepted' where id = o.id;
  perform private.notify(o.from_user, 'property_sold', jsonb_build_object('amount', o.price), '/cabinet/property');
  perform private.audit(me.id, 'buy_property', d.id::text, jsonb_build_object('price', o.price, 'new_document', new_id));
  return jsonb_build_object('ok', true, 'document_id', new_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Суд
-- ---------------------------------------------------------------------
create function public.file_lawsuit(p_defendant uuid, p_amount int, p_claim text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  defendant public.profiles;
  country text;
  fee int := coalesce(nullif(private.setting('court_fee'), '')::int, 123);
  suit_id bigint;
begin
  select * into defendant from profiles where id = p_defendant;
  if defendant.id is null then raise exception 'E_NOT_FOUND'; end if;
  if defendant.id = me.id then raise exception 'E_SELF'; end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000000 then raise exception 'E_BAD_AMOUNT'; end if;
  if coalesce(btrim(p_claim), '') = '' then raise exception 'E_REQUIRED'; end if;
  if private.guard(me.id, array[p_claim]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  country := coalesce(defendant.country_code, me.country_code, 'BOBO');
  insert into lawsuits (plaintiff_id, defendant_id, country_code, amount, claim)
  values (me.id, defendant.id, country, p_amount, btrim(p_claim))
  returning id into suit_id;
  if fee > 0 then
    perform private.move_coins(me.id, -fee, 'fee', 'lawsuit', suit_id, me.id, 'Судебная пошлина');
  end if;
  perform private.notify(defendant.id, 'lawsuit_new', jsonb_build_object('id', suit_id), '/court/' || suit_id);
  perform private.notify_staff(country, 'lawsuit_staff', jsonb_build_object('id', suit_id), '/court/' || suit_id);
  return jsonb_build_object('ok', true, 'id', suit_id);
end;
$$;

create function public.answer_lawsuit(p_id bigint, p_defense text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  s public.lawsuits;
begin
  select * into s from lawsuits where id = p_id for update;
  if s.id is null then raise exception 'E_NOT_FOUND'; end if;
  if s.defendant_id <> me.id then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if s.status not in ('filed', 'hearing') then raise exception 'E_BAD_STATUS'; end if;
  if coalesce(btrim(p_defense), '') = '' then raise exception 'E_REQUIRED'; end if;
  if private.guard(me.id, array[p_defense]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  update lawsuits set defense = btrim(p_defense) where id = s.id;
  perform private.notify(s.plaintiff_id, 'lawsuit_answer', jsonb_build_object('id', s.id), '/court/' || s.id);
  return jsonb_build_object('ok', true);
end;
$$;

create function private.can_judge(p public.profiles, s public.lawsuits) returns boolean
language sql stable as $$
  select p.role = 'superadmin'
      or (p.role in ('official', 'president') and p.gov_country_code = s.country_code
          and p.id not in (s.plaintiff_id, s.defendant_id));
$$;

create function public.schedule_hearing(p_id bigint, p_at timestamptz, p_place text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  s public.lawsuits;
begin
  select * into s from lawsuits where id = p_id for update;
  if s.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not private.can_judge(me, s) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if s.status not in ('filed', 'hearing') then raise exception 'E_BAD_STATUS'; end if;
  if p_at is null or coalesce(btrim(p_place), '') = '' then raise exception 'E_REQUIRED'; end if;
  if private.guard(me.id, array[p_place]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  update lawsuits set status = 'hearing', hearing_at = p_at, place = btrim(p_place), judge_id = me.id where id = s.id;
  perform private.notify(s.plaintiff_id, 'lawsuit_hearing', jsonb_build_object('id', s.id), '/court/' || s.id);
  perform private.notify(s.defendant_id, 'lawsuit_hearing', jsonb_build_object('id', s.id), '/court/' || s.id);
  return jsonb_build_object('ok', true);
end;
$$;

create function public.decide_lawsuit(p_id bigint, p_awarded int, p_verdict text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  s public.lawsuits;
  v_fine bigint;
begin
  select * into s from lawsuits where id = p_id for update;
  if s.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not private.can_judge(me, s) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if s.status not in ('filed', 'hearing') then raise exception 'E_BAD_STATUS'; end if;
  if me.signature_path is null then raise exception 'E_NEED_SIGNATURE'; end if;
  if p_awarded is null or p_awarded < 0 or p_awarded > s.amount then raise exception 'E_BAD_AMOUNT'; end if;
  if coalesce(btrim(p_verdict), '') = '' then raise exception 'E_REQUIRED'; end if;
  if private.guard(me.id, array[p_verdict]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  if p_awarded > 0 then
    insert into fines (user_id, country_code, amount, reason, kind, issued_by, beneficiary_id)
    values (s.defendant_id, s.country_code, p_awarded, 'Взыскание по решению суда №' || s.id, 'court', me.id, s.plaintiff_id)
    returning id into v_fine;
  end if;
  update lawsuits
  set status = case when p_awarded > 0 then 'decided' else 'dismissed' end,
      verdict = btrim(p_verdict), awarded = p_awarded, judge_id = me.id, judge_signature_path = me.signature_path,
      decided_at = now(), fine_id = v_fine
  where id = s.id;
  perform private.notify(s.plaintiff_id, 'lawsuit_decided', jsonb_build_object('id', s.id, 'amount', p_awarded), '/court/' || s.id);
  perform private.notify(s.defendant_id, 'lawsuit_decided', jsonb_build_object('id', s.id, 'amount', p_awarded), '/court/' || s.id);
  perform private.audit(me.id, 'decide_lawsuit', s.id::text, jsonb_build_object('awarded', p_awarded));
  return jsonb_build_object('ok', true);
end;
$$;

-- Помилование: президент своей страны отменяет штраф или взыскание.
create function public.pardon(p_fine bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  f public.fines;
begin
  select * into f from fines where id = p_fine for update;
  if f.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not (me.role = 'superadmin' or (me.role = 'president' and me.gov_country_code = f.country_code)) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  if f.status <> 'unpaid' then raise exception 'E_BAD_STATUS'; end if;
  update fines set status = 'cancelled' where id = f.id;
  perform private.notify(f.user_id, 'pardon', jsonb_build_object('amount', f.amount), '/cabinet/fines');
  perform private.audit(me.id, 'pardon', f.id::text, '{}');
  return jsonb_build_object('ok', true);
end;
$$;

-- Амнистия: массовая отмена неоплаченных штрафов с автоматическим указом.
create function public.amnesty(p_country text, p_include_court boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  cnt int;
  people int;
  news_id bigint;
begin
  if not (me.role = 'superadmin' or (me.role = 'president' and me.gov_country_code = p_country)) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  with cancelled as (
    update fines set status = 'cancelled'
    where country_code = p_country and status = 'unpaid'
      and (kind::text in ('fine', 'auto_forbidden') or (p_include_court and kind::text = 'court'))
    returning user_id
  ), notified as (
    insert into notifications (user_id, kind, params, link)
    select distinct user_id, 'amnesty', '{}'::jsonb, '/cabinet/fines' from cancelled
    returning user_id
  )
  select (select count(*) from cancelled), (select count(*) from notified) into cnt, people;
  insert into news (country_code, author_id, kind, title, body)
  values (p_country, me.id, 'decree', 'Об амнистии',
          'В честь 12.34.1234 объявляется амнистия. Отменено неоплаченных штрафов: ' || cnt
          || '. Помиловано граждан: ' || people || '. Ведите себя сиф!')
  returning id into news_id;
  perform private.audit(me.id, 'amnesty', p_country, jsonb_build_object('count', cnt));
  return jsonb_build_object('ok', true, 'count', cnt, 'people', people, 'news_id', news_id);
end;
$$;

-- Настройки: судебная пошлина.
create or replace function public.admin_set_setting(p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if me.role <> 'superadmin' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if p_key not in ('invite_code', 'forbidden_fine', 'passport_production_minutes', 'court_fee') then raise exception 'E_BAD_DATA'; end if;
  if p_key in ('forbidden_fine') and (p_value !~ '^[0-9]+$' or p_value::int <= 0) then raise exception 'E_BAD_AMOUNT'; end if;
  if p_key in ('passport_production_minutes', 'court_fee') and (p_value !~ '^[0-9]+$' or p_value::int > 100000) then
    raise exception 'E_BAD_AMOUNT';
  end if;
  update app_settings set value = coalesce(p_value, '') where key = p_key;
  perform private.audit(me.id, 'set_setting', p_key, '{}');
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Доступ
-- ---------------------------------------------------------------------
alter table public.treasury_tx enable row level security;
alter table public.property_offers enable row level security;
alter table public.lawsuits enable row level security;

create policy treasury_read on public.treasury_tx for select to authenticated using (public.is_staff_of(country_code));
create policy offers_read on public.property_offers for select to authenticated using (
  from_user = (select auth.uid()) or to_user = (select auth.uid()) or public.is_superadmin()
);
create policy lawsuits_read on public.lawsuits for select to authenticated using (
  plaintiff_id = (select auth.uid()) or defendant_id = (select auth.uid()) or public.is_staff_of(country_code)
);
-- Истцы видят взыскания в свою пользу
create policy fines_beneficiary_read on public.fines for select to authenticated using (beneficiary_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.treasury_tx, public.property_offers, public.lawsuits from anon, authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.check_signup(text, text, text) to anon;
grant execute on function public.invite_required() to anon;
grant execute on function public.verify_document(text) to anon;
grant execute on function public.country_stats() to anon;
