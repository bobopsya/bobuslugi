-- =====================================================================
-- Бобуслуги ↔ Bobobank ↔ GPAY
-- Банк и GPAY вызывают функции svc_* с ключом service_role (только с сервера).
-- Бобуслуги сами никуда не ходят: поручения банку (арест, снятие ареста, взыскание, зарплаты)
-- лежат в очереди bank_orders, банк забирает их сам.
-- =====================================================================

alter type public.tx_type add value if not exists 'exchange_out';
alter type public.tx_type add value if not exists 'exchange_in';

-- ---------------------------------------------------------------------
-- Настройки и колонки
-- ---------------------------------------------------------------------
-- Курс: сколько копеек Bobobank стоит 1 псякоин.
insert into public.app_settings (key, value) values ('psy_rub_rate', '10000') on conflict (key) do nothing;

alter table public.countries add column turnover_tax numeric(5, 2) not null default 1 check (turnover_tax >= 0 and turnover_tax <= 50);

alter table public.fines
  add column paid_via text check (paid_via in ('coins', 'bank')),
  add column bank_op text,
  add column bank_rub bigint;

-- ---------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------
-- Одноразовые коды «Войти через Бобуслуги» (хранится только sha256 кода).
create table public.link_codes (
  code_hash text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  client text not null check (client in ('bank', 'gpay')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index on public.link_codes (user_id);

-- Кто подключил банк и GPAY.
create table public.bank_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  bank_linked_at timestamptz,
  gpay_linked_at timestamptz
);

-- Поручения банку. Банк забирает их через svc_pull_orders и отчитывается через svc_order_done.
create table public.bank_orders (
  id bigint generated always as identity primary key,
  type text not null check (type in ('arrest', 'lift', 'collect', 'salary')),
  user_id uuid not null references public.profiles (id) on delete cascade,
  country_code text references public.countries (code),
  fine_id bigint references public.fines (id) on delete set null,
  amount_coins int not null default 0,
  amount_rub bigint not null default 0,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'sent', 'done', 'failed')),
  result jsonb,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  done_at timestamptz
);
create index on public.bank_orders (status, id);
create index on public.bank_orders (fine_id);

-- Магазины GPAY, привязанные к бизнесу из реестра.
create table public.gpay_shops (
  shop_id bigint primary key,
  document_id bigint not null references public.documents (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  site text,
  turnover_30d bigint not null default 0,
  taxed_until date,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.gpay_shops (document_id);

-- Оборот магазинов по дням (копейки), из него считается налог с оборота.
create table public.business_turnover (
  shop_id bigint not null references public.gpay_shops (shop_id) on delete cascade,
  day date not null,
  amount_rub bigint not null check (amount_rub >= 0),
  primary key (shop_id, day)
);

-- Обмен псякоинов в банке.
create table public.coin_exchanges (
  op_id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  coins int not null,
  rub bigint not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Помощники
-- ---------------------------------------------------------------------
create function private.require_service() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'E_FORBIDDEN_ACTION'; end if;
end;
$$;

create function private.psy_rate() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(private.setting('psy_rub_rate'), '')::bigint, 10000);
$$;

-- ИНН из лорных цифр 1–4 с правильными контрольными цифрами: 10 знаков у компании, 12 у ИП.
create function private.gen_inn(p_len int) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  w10 int[] := array[2, 4, 10, 3, 5, 9, 4, 6, 8];
  w11 int[] := array[7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
  w12 int[] := array[3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
  d int[];
  s int;
  i int;
  result text;
begin
  loop
    d := '{}';
    for i in 1..(p_len - case when p_len = 10 then 1 else 2 end) loop
      d := d || (1 + floor(random() * 4)::int);
    end loop;
    if p_len = 10 then
      s := 0; for i in 1..9 loop s := s + d[i] * w10[i]; end loop;
      d := d || ((s % 11) % 10);
    else
      s := 0; for i in 1..10 loop s := s + d[i] * w11[i]; end loop;
      d := d || ((s % 11) % 10);
      s := 0; for i in 1..11 loop s := s + d[i] * w12[i]; end loop;
      d := d || ((s % 11) % 10);
    end if;
    result := array_to_string(d, '');
    exit when not private.is_forbidden(result)
      and not exists (select 1 from documents where type::text = 'business_reg' and data ->> 'inn' = result);
  end loop;
  return result;
end;
$$;

create function private.business_inn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.type::text = 'business_reg' and coalesce(new.data ->> 'inn', '') = '' then
    new.data := new.data || jsonb_build_object('inn', private.gen_inn(case when new.data ->> 'org_type' = 'ИП' then 12 else 10 end));
  end if;
  return new;
end;
$$;

create trigger documents_business_inn
  before insert on public.documents
  for each row execute function private.business_inn();

update public.documents
set data = data || jsonb_build_object('inn', private.gen_inn(case when data ->> 'org_type' = 'ИП' then 12 else 10 end))
where type::text = 'business_reg' and coalesce(data ->> 'inn', '') = '';

-- Человек глазами банка: паспорт, роль, бизнесы.
create function private.person(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'login', p.login, 'display_name', p.display_name, 'role', p.role,
    'country_code', p.country_code, 'gov_country_code', p.gov_country_code, 'banned', p.banned, 'balance', p.balance,
    'passport', (
      select jsonb_build_object(
        'number', d.number, 'country_code', d.country_code, 'issued_at', d.issued_at, 'issuer', d.issuer,
        'last_name', d.data ->> 'last_name', 'first_name', d.data ->> 'first_name', 'patronymic', d.data ->> 'patronymic',
        'birth_date', d.data ->> 'birth_date', 'sex', d.data ->> 'sex')
      from documents d
      where d.user_id = p.id and d.type = 'passport' and d.revoked_at is null and (d.valid_until is null or d.valid_until > now())
      order by d.issued_at desc limit 1),
    'businesses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'number', d.number, 'country_code', d.country_code, 'name', d.data ->> 'name',
        'org_type', d.data ->> 'org_type', 'inn', d.data ->> 'inn', 'activity', d.data ->> 'activity') order by d.issued_at)
      from documents d
      where d.user_id = p.id and d.type::text = 'business_reg' and d.revoked_at is null), '[]'::jsonb))
  from profiles p where p.id = p_user;
$$;

-- ---------------------------------------------------------------------
-- Для пользователей
-- ---------------------------------------------------------------------
-- Код для входа в банк или GPAY: показывается один раз, живёт 5 минут.
create function public.create_link_code(p_client text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  code text;
begin
  if p_client not in ('bank', 'gpay') then raise exception 'E_BAD_DATA'; end if;
  delete from link_codes where user_id = me.id and (expires_at < now() or used_at is not null);
  if (select count(*) from link_codes where user_id = me.id) >= 10 then raise exception 'E_TOO_MANY'; end if;
  code := encode(extensions.gen_random_bytes(24), 'hex');
  insert into link_codes (code_hash, user_id, client, expires_at)
  values (encode(sha256(convert_to(code, 'UTF8')), 'hex'), me.id, p_client, now() + interval '5 minutes');
  return jsonb_build_object('ok', true, 'code', code);
end;
$$;

-- Арест счёта в банке (и по желанию — принудительное списание) по неоплаченному штрафу.
create function public.request_arrest(p_fine bigint, p_collect boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  f public.fines;
  s public.lawsuits;
  order_id bigint;
begin
  select * into f from fines where id = p_fine for update;
  if f.id is null then raise exception 'E_NOT_FOUND'; end if;
  select * into s from lawsuits where fine_id = f.id;
  if not (public.is_staff_of(f.country_code) or (s.id is not null and private.can_judge(me, s))) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  if f.status <> 'unpaid' then raise exception 'E_BAD_STATUS'; end if;
  if not exists (select 1 from bank_links where user_id = f.user_id and bank_linked_at is not null) then
    raise exception 'E_NO_BANK';
  end if;
  if exists (select 1 from bank_orders where fine_id = f.id and type = case when p_collect then 'collect' else 'arrest' end
             and status in ('pending', 'sent', 'done')) then
    raise exception 'E_ALREADY';
  end if;
  insert into bank_orders (type, user_id, country_code, fine_id, amount_coins, amount_rub, actor_id, payload)
  values (case when p_collect then 'collect' else 'arrest' end, f.user_id, f.country_code, f.id, f.amount, f.amount::bigint * private.psy_rate(), me.id,
          jsonb_build_object('reason', f.reason, 'beneficiary', f.beneficiary_id))
  returning id into order_id;
  perform private.audit(me.id, case when p_collect then 'bank_collect' else 'bank_arrest' end, f.id::text, jsonb_build_object('order', order_id));
  return jsonb_build_object('ok', true, 'order_id', order_id);
end;
$$;

-- Зарплаты: из казны псякоинами (как раньше) или из казны страны в Bobobank рублями.
drop function public.pay_salaries(text);
create function public.pay_salaries(p_country text, p_source text default 'coins')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  total bigint;
  bal bigint;
  cnt int := 0;
  skipped int := 0;
  s record;
begin
  if not (me.role = 'superadmin' or (me.role = 'president' and me.gov_country_code = p_country)) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  if p_source not in ('coins', 'bank') then raise exception 'E_BAD_DATA'; end if;
  select coalesce(sum(salary), 0) into total from profiles
  where gov_country_code = p_country and role in ('official', 'president') and salary > 0 and not banned;
  if total = 0 then raise exception 'E_NO_SALARIES'; end if;
  if p_source = 'coins' then
    select treasury into bal from countries where code = p_country for update;
    if bal < total then raise exception 'E_TREASURY'; end if;
  end if;
  for s in select p.id, p.salary, exists (select 1 from bank_links b where b.user_id = p.id and b.bank_linked_at is not null) as has_bank
           from profiles p
           where p.gov_country_code = p_country and p.role in ('official', 'president') and p.salary > 0 and not p.banned loop
    if p_source = 'coins' then
      perform private.move_treasury(p_country, -s.salary, 'salary', 'user', null, me.id, s.id::text);
      perform private.move_coins(s.id, s.salary, 'salary', null, null, me.id, 'Зарплата');
      perform private.notify(s.id, 'salary', jsonb_build_object('amount', s.salary), '/cabinet/wallet');
      cnt := cnt + 1;
    elsif s.has_bank then
      insert into bank_orders (type, user_id, country_code, amount_coins, amount_rub, actor_id)
      values ('salary', s.id, p_country, s.salary, s.salary::bigint * private.psy_rate(), me.id);
      cnt := cnt + 1;
    else
      skipped := skipped + 1;
    end if;
  end loop;
  perform private.audit(me.id, 'pay_salaries', p_country, jsonb_build_object('count', cnt, 'total', total, 'source', p_source));
  return jsonb_build_object('ok', true, 'count', cnt, 'total', total, 'skipped', skipped, 'source', p_source);
end;
$$;

-- Налоги: добавлена ставка налога с оборота магазинов GPAY.
drop function public.set_country_taxes(text, int, int);
create function public.set_country_taxes(p_country text, p_business_tax int, p_property_tax int, p_turnover_tax numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if not (me.role = 'superadmin' or (me.role = 'president' and me.gov_country_code = p_country)) then
    raise exception 'E_FORBIDDEN_ACTION';
  end if;
  if p_business_tax is null or p_business_tax < 0 or p_property_tax is null or p_property_tax < 0
     or (p_turnover_tax is not null and (p_turnover_tax < 0 or p_turnover_tax > 50)) then
    raise exception 'E_BAD_AMOUNT';
  end if;
  update countries set business_tax = p_business_tax, property_tax = p_property_tax,
    turnover_tax = coalesce(p_turnover_tax, turnover_tax)
  where code = p_country;
  perform private.audit(me.id, 'set_taxes', p_country,
    jsonb_build_object('business', p_business_tax, 'property', p_property_tax, 'turnover', p_turnover_tax));
  return jsonb_build_object('ok', true);
end;
$$;

-- Сбор налогов: как раньше плюс налог с оборота магазинов GPAY (с прошлого сбора по вчера).
create or replace function public.collect_taxes(p_country text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  c public.countries;
  d record;
  sh record;
  amount int;
  fine_id bigint;
  cnt int := 0;
  rate bigint := private.psy_rate();
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

  if c.turnover_tax > 0 then
    for sh in select g.shop_id, g.name, g.user_id, bd.number, g.taxed_until,
                     coalesce((select sum(t.amount_rub) from business_turnover t
                               where t.shop_id = g.shop_id and t.day < current_date
                                 and (g.taxed_until is null or t.day > g.taxed_until)), 0) as turnover
              from gpay_shops g join documents bd on bd.id = g.document_id
              where bd.country_code = p_country and bd.revoked_at is null loop
      update gpay_shops set taxed_until = current_date - 1 where shop_id = sh.shop_id;
      amount := ceil(sh.turnover * c.turnover_tax / 100 / rate)::int;
      continue when amount <= 0;
      insert into fines (user_id, country_code, amount, reason, kind, issued_by)
      values (sh.user_id, p_country, amount, 'Налог с оборота магазина «' || sh.name || '» (' || sh.number || ')', 'tax', me.id)
      returning id into fine_id;
      perform private.notify(sh.user_id, 'fine_new', jsonb_build_object('fine_id', fine_id, 'amount', amount, 'kind', 'tax'), '/cabinet/fines');
      cnt := cnt + 1;
    end loop;
  end if;
  perform private.audit(me.id, 'collect_taxes', p_country, jsonb_build_object('count', cnt));
  return jsonb_build_object('ok', true, 'count', cnt);
end;
$$;

-- Оплата псякоинами помечает способ.
create or replace function public.pay_fine(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  f public.fines;
begin
  select * into f from fines where id = p_id and user_id = me.id for update;
  if f.id is null then raise exception 'E_NOT_FOUND'; end if;
  if f.status <> 'unpaid' then raise exception 'E_BAD_STATUS'; end if;
  perform private.move_coins(me.id, -f.amount, 'fine_payment', 'fine', f.id, me.id, f.reason);
  update fines set status = 'paid', paid_at = now(), paid_via = 'coins' where id = f.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Штраф закрыт любым способом (оплата, помилование, амнистия) — арест в банке снимается.
create function private.fine_closed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'unpaid' and new.status <> 'unpaid'
     and exists (select 1 from bank_orders where fine_id = new.id and type = 'arrest' and status in ('pending', 'sent', 'done'))
     and not exists (select 1 from bank_orders where fine_id = new.id and type = 'lift') then
    insert into bank_orders (type, user_id, country_code, fine_id, amount_coins, amount_rub)
    values ('lift', new.user_id, new.country_code, new.id, new.amount, 0);
  end if;
  return null;
end;
$$;

create trigger fines_closed
  after update of status on public.fines
  for each row execute function private.fine_closed();

-- Курс псякоина задаёт суперадмин.
create or replace function public.admin_set_setting(p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if me.role <> 'superadmin' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if p_key not in ('invite_code', 'forbidden_fine', 'passport_production_minutes', 'court_fee', 'psy_rub_rate') then raise exception 'E_BAD_DATA'; end if;
  if p_key in ('forbidden_fine') and (p_value !~ '^[0-9]+$' or p_value::int <= 0) then raise exception 'E_BAD_AMOUNT'; end if;
  if p_key in ('passport_production_minutes', 'court_fee') and (p_value !~ '^[0-9]+$' or p_value::int > 100000) then
    raise exception 'E_BAD_AMOUNT';
  end if;
  if p_key = 'psy_rub_rate' and (p_value !~ '^[0-9]{1,10}$' or p_value::bigint <= 0) then raise exception 'E_BAD_AMOUNT'; end if;
  update app_settings set value = coalesce(p_value, '') where key = p_key;
  insert into app_settings (key, value) select p_key, coalesce(p_value, '') where not exists (select 1 from app_settings where key = p_key);
  perform private.audit(me.id, 'set_setting', p_key, '{}');
  return jsonb_build_object('ok', true);
end;
$$;

-- Курс для всех (показывается на сайте).
create function public.psy_rate() returns bigint
language sql stable security definer set search_path = public as $$
  select private.psy_rate();
$$;

-- ---------------------------------------------------------------------
-- Для банка и GPAY (только service_role)
-- ---------------------------------------------------------------------
create function public.svc_redeem_code(p_code text, p_client text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.link_codes;
begin
  perform private.require_service();
  update link_codes set used_at = now()
  where code_hash = encode(sha256(convert_to(coalesce(p_code, ''), 'UTF8')), 'hex')
    and client = p_client and used_at is null and expires_at > now()
  returning * into l;
  if l.code_hash is null then raise exception 'E_BAD_CODE'; end if;
  insert into bank_links (user_id) values (l.user_id) on conflict (user_id) do nothing;
  if p_client = 'bank' then
    update bank_links set bank_linked_at = coalesce(bank_linked_at, now()) where user_id = l.user_id;
  else
    update bank_links set gpay_linked_at = coalesce(gpay_linked_at, now()) where user_id = l.user_id;
  end if;
  perform private.audit(l.user_id, 'link_' || p_client, l.user_id::text, '{}');
  return private.person(l.user_id);
end;
$$;

create function public.svc_person(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
begin
  perform private.require_service();
  r := private.person(p_user);
  if r is null then raise exception 'E_NOT_FOUND'; end if;
  return r;
end;
$$;

create function public.svc_settings()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  return jsonb_build_object(
    'psy_rub_rate', private.psy_rate(),
    'countries', (select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'psy_name', psy_name, 'turnover_tax', turnover_tax) order by sort) from countries));
end;
$$;

create function public.svc_fine(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f public.fines;
begin
  perform private.require_service();
  select * into f from fines where id = p_id;
  if f.id is null then raise exception 'E_NOT_FOUND'; end if;
  return jsonb_build_object(
    'id', f.id, 'user_id', f.user_id, 'login', (select login from profiles where id = f.user_id),
    'display_name', (select display_name from profiles where id = f.user_id),
    'country_code', f.country_code, 'country_name', (select name from countries where code = f.country_code),
    'amount', f.amount, 'amount_rub', f.amount::bigint * private.psy_rate(), 'reason', f.reason, 'kind', f.kind,
    'status', f.status, 'beneficiary_id', f.beneficiary_id, 'paid_via', f.paid_via, 'bank_op', f.bank_op, 'created_at', f.created_at);
end;
$$;

-- Штраф оплачен рублями в банке. Повтор с тем же p_op — не ошибка.
create function public.svc_fine_paid(p_id bigint, p_op text, p_rub bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f public.fines;
begin
  perform private.require_service();
  select * into f from fines where id = p_id for update;
  if f.id is null then raise exception 'E_NOT_FOUND'; end if;
  if f.status = 'paid' and f.bank_op = p_op then return jsonb_build_object('ok', true, 'repeat', true); end if;
  if f.status <> 'unpaid' then raise exception 'E_BAD_STATUS'; end if;
  update fines set status = 'paid', paid_at = now(), paid_via = 'bank', bank_op = p_op, bank_rub = p_rub where id = f.id;
  perform private.notify(f.user_id, 'fine_paid_bank', jsonb_build_object('fine_id', f.id, 'amount', f.amount), '/cabinet/fines');
  if f.beneficiary_id is not null then
    perform private.notify(f.beneficiary_id, 'court_paid', jsonb_build_object('amount', f.amount, 'bank', true), '/cabinet/bank');
  end if;
  perform private.audit(f.user_id, 'fine_paid_bank', f.id::text, jsonb_build_object('op', p_op, 'rub', p_rub));
  return jsonb_build_object('ok', true);
end;
$$;

-- Обмен: списать (p_coins < 0) или зачислить (p_coins > 0) псякоины. Повтор с тем же p_op возвращает прежний результат.
create function public.svc_exchange(p_user uuid, p_coins int, p_op text, p_rub bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.coin_exchanges;
  bal int;
begin
  perform private.require_service();
  if p_coins is null or p_coins = 0 or coalesce(p_op, '') = '' then raise exception 'E_BAD_AMOUNT'; end if;
  select * into e from coin_exchanges where op_id = p_op;
  if e.op_id is not null then
    if e.user_id <> p_user or e.coins <> p_coins then raise exception 'E_BAD_DATA'; end if;
    return jsonb_build_object('ok', true, 'repeat', true, 'balance', (select balance from profiles where id = p_user));
  end if;
  if not exists (select 1 from profiles where id = p_user and not banned) then raise exception 'E_NOT_FOUND'; end if;
  bal := private.move_coins(p_user, p_coins, (case when p_coins < 0 then 'exchange_out' else 'exchange_in' end)::public.tx_type,
                            'exchange', null, null, case when p_coins < 0 then 'Обмен на рубли в Bobobank' else 'Обмен рублей Bobobank' end);
  insert into coin_exchanges (op_id, user_id, coins, rub) values (p_op, p_user, p_coins, p_rub);
  return jsonb_build_object('ok', true, 'balance', bal);
end;
$$;

-- Отменить обмен, если банк не смог провести свою часть.
create function public.svc_exchange_revert(p_op text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.coin_exchanges;
begin
  perform private.require_service();
  select * into e from coin_exchanges where op_id = p_op for update;
  if e.op_id is null then return jsonb_build_object('ok', true, 'missing', true); end if;
  perform private.move_coins(e.user_id, -e.coins, (case when e.coins < 0 then 'exchange_in' else 'exchange_out' end)::public.tx_type,
                             'exchange', null, null, 'Отмена обмена');
  delete from coin_exchanges where op_id = p_op;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.svc_pull_orders(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
begin
  perform private.require_service();
  with picked as (
    select id from bank_orders
    where status = 'pending' or (status = 'sent' and sent_at < now() - interval '2 minutes')
    order by id limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked
  ), upd as (
    update bank_orders o set status = 'sent', sent_at = now() from picked where o.id = picked.id returning o.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'type', u.type, 'user_id', u.user_id, 'country_code', u.country_code, 'fine_id', u.fine_id,
    'amount_coins', u.amount_coins, 'amount_rub', u.amount_rub, 'payload', u.payload,
    'reason', (select reason from fines where id = u.fine_id),
    'beneficiary_id', (select beneficiary_id from fines where id = u.fine_id)) order by u.id), '[]'::jsonb)
  into r from upd u;
  return r;
end;
$$;

create function public.svc_order_done(p_id bigint, p_ok boolean, p_result jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.bank_orders;
begin
  perform private.require_service();
  select * into o from bank_orders where id = p_id for update;
  if o.id is null then raise exception 'E_NOT_FOUND'; end if;
  if o.status in ('done', 'failed') then return jsonb_build_object('ok', true, 'repeat', true); end if;
  update bank_orders set status = case when p_ok then 'done' else 'failed' end, result = coalesce(p_result, '{}'), done_at = now() where id = o.id;
  if p_ok then
    if o.type = 'arrest' then
      perform private.notify(o.user_id, 'bank_arrest', jsonb_build_object('amount', o.amount_coins, 'fine_id', o.fine_id), '/cabinet/fines');
    elsif o.type = 'lift' then
      perform private.notify(o.user_id, 'bank_lift', jsonb_build_object('fine_id', o.fine_id), '/cabinet/bank');
    elsif o.type = 'salary' then
      perform private.notify(o.user_id, 'salary_bank', jsonb_build_object('amount', o.amount_coins, 'rub', o.amount_rub), '/cabinet/bank');
    end if;
  elsif o.actor_id is not null then
    perform private.notify(o.actor_id, 'bank_order_failed', jsonb_build_object('type', o.type, 'error', coalesce(p_result ->> 'error', '')), '/gov');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Магазин GPAY привязан к бизнесу (p_doc) или отвязан (p_doc = null).
create function public.svc_gpay_shop(p_shop bigint, p_user uuid, p_doc bigint, p_name text, p_site text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.documents;
begin
  perform private.require_service();
  if p_doc is null then
    delete from gpay_shops where shop_id = p_shop;
    return jsonb_build_object('ok', true, 'unlinked', true);
  end if;
  select * into d from documents where id = p_doc;
  if d.id is null or d.type::text <> 'business_reg' or d.user_id <> p_user then raise exception 'E_NOT_FOUND'; end if;
  if d.revoked_at is not null then raise exception 'E_REVOKED'; end if;
  insert into gpay_shops (shop_id, document_id, user_id, name, site)
  values (p_shop, d.id, p_user, left(coalesce(p_name, ''), 120), nullif(left(coalesce(p_site, ''), 200), ''))
  on conflict (shop_id) do update set document_id = excluded.document_id, user_id = excluded.user_id,
    name = excluded.name, site = excluded.site, updated_at = now();
  return jsonb_build_object('ok', true, 'document', jsonb_build_object('id', d.id, 'number', d.number, 'name', d.data ->> 'name', 'inn', d.data ->> 'inn'));
end;
$$;

-- Оборот магазина: за день (для налога) и за 30 дней (для витрины).
create function public.svc_gpay_turnover(p_shop bigint, p_day date, p_day_rub bigint, p_month_rub bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform private.require_service();
  if not exists (select 1 from gpay_shops where shop_id = p_shop) then return jsonb_build_object('ok', false, 'error', 'E_NOT_LINKED'); end if;
  update gpay_shops set turnover_30d = greatest(coalesce(p_month_rub, 0), 0), updated_at = now() where shop_id = p_shop;
  if p_day is not null then
    insert into business_turnover (shop_id, day, amount_rub) values (p_shop, p_day, greatest(coalesce(p_day_rub, 0), 0))
    on conflict (shop_id, day) do update set amount_rub = excluded.amount_rub;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Доступ
-- ---------------------------------------------------------------------
alter table public.link_codes enable row level security;
alter table public.bank_links enable row level security;
alter table public.bank_orders enable row level security;
alter table public.gpay_shops enable row level security;
alter table public.business_turnover enable row level security;
alter table public.coin_exchanges enable row level security;

create policy bank_links_read on public.bank_links for select to authenticated using (user_id = (select auth.uid()) or public.is_superadmin());
create policy bank_orders_read on public.bank_orders for select to authenticated using (
  user_id = (select auth.uid()) or public.is_staff_of(country_code)
);
create policy gpay_shops_read on public.gpay_shops for select to authenticated using (
  user_id = (select auth.uid())
  or public.is_staff_of((select country_code from public.documents where id = document_id))
);
create policy coin_exchanges_read on public.coin_exchanges for select to authenticated using (user_id = (select auth.uid()));

revoke insert, update, delete, truncate on public.link_codes, public.bank_links, public.bank_orders, public.gpay_shops,
  public.business_turnover, public.coin_exchanges from anon, authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.check_signup(text, text, text) to anon;
grant execute on function public.invite_required() to anon;
grant execute on function public.verify_document(text) to anon;
grant execute on function public.country_stats() to anon;
grant execute on function public.psy_rate() to anon;

-- svc_* — только сервер банка и GPAY.
revoke execute on function public.svc_redeem_code(text, text), public.svc_person(uuid), public.svc_settings(),
  public.svc_fine(bigint), public.svc_fine_paid(bigint, text, bigint), public.svc_exchange(uuid, int, text, bigint),
  public.svc_exchange_revert(text), public.svc_pull_orders(int), public.svc_order_done(bigint, boolean, jsonb),
  public.svc_gpay_shop(bigint, uuid, bigint, text, text), public.svc_gpay_turnover(bigint, date, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.svc_redeem_code(text, text), public.svc_person(uuid), public.svc_settings(),
  public.svc_fine(bigint), public.svc_fine_paid(bigint, text, bigint), public.svc_exchange(uuid, int, text, bigint),
  public.svc_exchange_revert(text), public.svc_pull_orders(int), public.svc_order_done(bigint, boolean, jsonb),
  public.svc_gpay_shop(bigint, uuid, bigint, text, text), public.svc_gpay_turnover(bigint, date, bigint, bigint)
  to service_role;
