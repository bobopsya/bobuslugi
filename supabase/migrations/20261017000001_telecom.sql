-- =====================================================================
-- Бобтелеком: «Войти через Бобуслуги» для оператора связи и номер телефона в кабинете.
-- Оператор вызывает svc_* с ключом service_role (только со своего сервера), как банк и GPAY.
-- =====================================================================

alter table public.link_codes drop constraint link_codes_client_check;
alter table public.link_codes add constraint link_codes_client_check check (client in ('bank', 'gpay', 'telecom'));
alter table public.bank_links add column telecom_linked_at timestamptz;

-- Номер оператора Бобтелеком, оформленный на гражданина (+123 XXX XXX-XX-XX). Видит только владелец.
create table public.phone_numbers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  number text not null unique check (number ~ '^123[0-9]{10}$'),
  operator text not null default 'Бобтелеком',
  linked_at timestamptz not null default now()
);
alter table public.phone_numbers enable row level security;
create policy phone_numbers_own on public.phone_numbers for select to authenticated using (user_id = auth.uid());
grant select on public.phone_numbers to authenticated;

create or replace function public.create_link_code(p_client text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  code text;
begin
  if p_client not in ('bank', 'gpay', 'telecom') then raise exception 'E_BAD_DATA'; end if;
  delete from link_codes where user_id = me.id and (expires_at < now() or used_at is not null);
  if (select count(*) from link_codes where user_id = me.id) >= 10 then raise exception 'E_TOO_MANY'; end if;
  code := encode(extensions.gen_random_bytes(24), 'hex');
  insert into link_codes (code_hash, user_id, client, expires_at)
  values (encode(sha256(convert_to(code, 'UTF8')), 'hex'), me.id, p_client, now() + interval '5 minutes');
  return jsonb_build_object('ok', true, 'code', code);
end;
$$;

create or replace function public.svc_redeem_code(p_code text, p_client text)
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
  elsif p_client = 'telecom' then
    update bank_links set telecom_linked_at = coalesce(telecom_linked_at, now()) where user_id = l.user_id;
  else
    update bank_links set gpay_linked_at = coalesce(gpay_linked_at, now()) where user_id = l.user_id;
  end if;
  perform private.audit(l.user_id, 'link_' || p_client, l.user_id::text, '{}');
  return private.person(l.user_id);
end;
$$;

-- Номер подключён, сменился или расторгнут (p_number = null). Номер, ушедший другому, у прежнего владельца снимается.
create function public.svc_set_phone(p_user uuid, p_number text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  old text;
begin
  perform private.require_service();
  if not exists (select 1 from profiles where id = p_user) then raise exception 'E_NOT_FOUND'; end if;
  select number into old from phone_numbers where user_id = p_user;
  if p_number is null then
    delete from phone_numbers where user_id = p_user;
    if old is not null then perform private.audit(p_user, 'phone_unlinked', old, '{}'); end if;
    return jsonb_build_object('ok', true);
  end if;
  if p_number !~ '^123[0-9]{10}$' then raise exception 'E_BAD_DATA'; end if;
  if old is not distinct from p_number then return jsonb_build_object('ok', true); end if;
  delete from phone_numbers where number = p_number and user_id <> p_user;
  insert into phone_numbers (user_id, number) values (p_user, p_number)
  on conflict (user_id) do update set number = excluded.number, linked_at = now();
  perform private.notify(p_user, 'phone_linked', jsonb_build_object('number',
    '+123 ' || substr(p_number, 4, 3) || ' ' || substr(p_number, 7, 3) || '-' || substr(p_number, 10, 2) || '-' || substr(p_number, 12, 2)), '/cabinet');
  perform private.audit(p_user, 'phone_linked', p_number, '{}');
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.svc_set_phone(uuid, text) from public, anon, authenticated;
grant execute on function public.svc_set_phone(uuid, text) to service_role;
