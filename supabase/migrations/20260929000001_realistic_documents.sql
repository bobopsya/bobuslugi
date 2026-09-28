-- =====================================================================
-- Бобуслуги: реалистичное оформление документов
-- Анкета, фото, экзамен, присяга, запись на приём, изготовление и выдача.
-- Все типы указаны со схемой: SQL Editor в Supabase проверяет функции без public в search_path.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Новые статусы заявлений
-- ---------------------------------------------------------------------
alter type public.app_status add value if not exists 'appointment';
alter type public.app_status add value if not exists 'producing';
alter type public.app_status add value if not exists 'issued';

-- ---------------------------------------------------------------------
-- Услуги: какие этапы нужны
-- ---------------------------------------------------------------------
alter table public.services
  add column needs_photo boolean not null default false,
  add column needs_exam boolean not null default false,
  add column doc_type public.doc_type;

update public.services set needs_photo = true, needs_exam = true, doc_type = 'passport'
  where code in ('citizenship', 'change_citizenship');
update public.services set needs_photo = true, doc_type = 'passport' where code = 'passport_reissue';
update public.services set needs_photo = true, doc_type = 'residence_permit' where code = 'residence_permit';
update public.services set needs_photo = true, doc_type = 'intl_passport' where code = 'intl_passport';
update public.services set needs_photo = true, doc_type = 'driver_license' where code = 'driver_license';
update public.services set needs_photo = true, doc_type = 'visa' where code = 'visa';
update public.services set doc_type = 'psyals' where code = 'psyals';

-- ---------------------------------------------------------------------
-- Профиль: личная подпись
-- ---------------------------------------------------------------------
alter table public.profiles add column signature_path text;

insert into public.app_settings (key, value) values ('passport_production_minutes', '30')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Запись на приём
-- ---------------------------------------------------------------------
create table public.appointment_slots (
  id bigint generated always as identity primary key,
  country_code text not null references public.countries (code),
  starts_at timestamptz not null,
  place text not null,
  official_id uuid references public.profiles (id) on delete set null,
  application_id bigint unique,
  created_at timestamptz not null default now()
);
create index on public.appointment_slots (country_code, starts_at);

-- ---------------------------------------------------------------------
-- Экзамен
-- ---------------------------------------------------------------------
create table public.exam_questions (
  id int primary key,
  question text not null,
  options text[] not null,
  correct int not null,
  active boolean not null default true,
  check (correct between 1 and array_length(options, 1))
);

create table public.exam_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_ids int[] not null,
  answers int[],
  score int,
  passed boolean,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index on public.exam_attempts (user_id);

insert into public.exam_questions (id, question, options, correct) values
  (1,  'Как по-псянски «привет»?', array['Кси', 'Паса', 'Сапс', 'Пеж'], 1),
  (2,  'Что значит «сапс»?', array['Пока', 'Спасибо', 'Пожалуйста', 'Круто'], 2),
  (3,  'Что значит «сиф»?', array['Сумка', 'Или', 'Круто, отлично', 'Как дела'], 3),
  (4,  'Как по-псянски «пожалуйста»?', array['Пеж', 'Га', 'Ос', 'Чи'], 1),
  (5,  'Что значит «га»?', array['Нет', 'Давай, пошли', 'Спасибо', 'Привет'], 2),
  (6,  'Как по-псянски «или»?', array['Сас', 'Чи', 'Ус', 'Паса'], 2),
  (7,  'Какая сегодня дата на Асее?', array['01.01.2000', '12.34.1234', '31.12.1234', 'Каждый день разная'], 2),
  (8,  'Какие числа существуют на Асее?', array['Все натуральные', 'Только 0 и 1', '123, 321, 1234, 4321', 'Только чётные'], 3),
  (9,  'Сколько будет 1234 + 123 по псярефметике?', array['1357', '4321', '1111', '12341'], 2),
  (10, 'Столица Бобокаунтри?', array['Псю-йорк', 'Псябург', 'Псяленд', 'Пупасибирск'], 3),
  (11, 'Кто президент Бобокаунтри?', array['Псянский', 'Пупянский', 'Сися', 'Мщрщз'], 1),
  (12, 'Кто президент СШП?', array['Псянский', 'Пупянский', 'Сися', 'Анатолий'], 2),
  (13, 'Столица СШП?', array['Псяленд', 'Псю-йорк', 'Реутов', 'Бобостан'], 2),
  (14, 'Как называются жители Бобокаунтри?', array['Бобовцы', 'Сляйнеры', 'Пупяне', 'Псяки'], 2),
  (15, 'Какая река соединяет Бобокаунтри, Бобостан и СШП?', array['Саменка', 'Псянка', 'Бобоволга', 'Жуконка'], 1),
  (16, 'Самый популярный мессенджер на Асее?', array['Жуконет', 'Бобограм', 'Бобонет', 'BING'], 2),
  (17, 'Крупнейшая хакерская группировка Асея?', array['Балсас', 'Писяганг', 'Жуконет', 'Сасфн'], 3),
  (18, 'Кто открыл Мигрантское окно?', array['Хакеры Жуконета', 'Учёные Бобостана', 'Анатолий', 'Президент СШП'], 2),
  (19, 'Какие банды орудуют в Псярфино?', array['Балсас и Писяганг', 'Жуконет и BING', 'Сасфн и Бобограм', 'Пупа и Жука'], 1),
  (20, 'Кто правит Поноссо?', array['Сися', 'Мщрщз', 'СВ', 'Пупянский'], 2),
  (21, 'Какой климат в Поноссо?', array['Вечное лето', 'Вечный лёд и темнота', 'Тропики', 'Как в Псяленде'], 2),
  (22, 'Кто первым признал Северную Индусию?', array['Бобокаунтри', 'СШП', 'Поноссо', 'Бобостан'], 3),
  (23, 'Какие приставки добавляют в псянские названия?', array['Пся, Бобо, Жуко, Пупа', 'Мега, Супер', 'Нео, Пост', 'Анти, Контр'], 1),
  (24, 'Что такое Гармод?', array['Город в СШП', 'Игра, где происходят события Асея', 'Хакерская программа', 'Река'], 2),
  (25, 'Что такое BING?', array['Мессенджер', 'Способ поиска засекреченной информации', 'Банда', 'Валюта'], 2),
  (26, 'Что такое Сасфн?', array['Тайное собрание самых важных людей Асея', 'Мессенджер', 'Столица Поноссо', 'Праздник'], 1),
  (27, 'Сколько будет 123 + 123 по псярефметике?', array['246', '321', '111', 'Ноль'], 2),
  (28, 'Как по-псянски «пока»?', array['Кси', 'Паса', 'Досвидоним', 'Асей'], 2);

-- ---------------------------------------------------------------------
-- Заявления и документы: новые поля
-- ---------------------------------------------------------------------
alter table public.applications
  add column photo_path text,
  add column signature_path text,
  add column slot_id bigint references public.appointment_slots (id) on delete set null,
  add column exam_attempt_id bigint references public.exam_attempts (id) on delete set null,
  add column attended_at timestamptz,
  add column ready_at timestamptz,
  add column received_at timestamptz,
  add column receipt_signature_path text,
  add column decision_signature_path text;

alter table public.appointment_slots
  add constraint appointment_slots_application_fk foreign key (application_id) references public.applications (id) on delete set null;

alter table public.documents
  add column photo_path text,
  add column holder_signature_path text,
  add column issuer text,
  add column division_code text,
  add column issued_by uuid references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------------
-- Хранилище фото и подписей
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('photos', 'photos', false, 2097152, array['image/jpeg', 'image/png']),
  ('signatures', 'signatures', false, 524288, array['image/png'])
on conflict (id) do nothing;

-- Кто видит фото: владелец, суперадмин и госслужащие страны заявления или документа с этим фото.
create function public.can_view_photo(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.applications a where a.photo_path = p_name and public.is_staff_of(a.target_country))
      or exists (select 1 from public.documents d where d.photo_path = p_name and public.is_staff_of(d.country_code));
$$;

create policy photos_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.can_view_photo(name)));

create policy signatures_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy signatures_update_own on storage.objects for update to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy signatures_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy signatures_read on storage.objects for select to authenticated
  using (bucket_id = 'signatures');

-- ---------------------------------------------------------------------
-- Внутренние функции
-- ---------------------------------------------------------------------

-- Файл загружен владельцем в нужный бакет.
create function private.own_file(p_user uuid, p_bucket text, p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_path is not null
     and split_part(p_path, '/', 1) = p_user::text
     and exists (select 1 from storage.objects o where o.bucket_id = p_bucket and o.name = p_path);
$$;

-- Тексты анкеты для проверки на запрещённые слова (дата рождения из календаря не проверяется).
create function private.form_texts(p jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(value), '{}') from jsonb_each_text(coalesce(p, '{}')) where key <> 'birth_date';
$$;

create function private.random_division_code() returns text
language sql volatile as $$
  select (array['123', '321'])[1 + floor(random() * 2)::int] || '-' || (array['123', '321'])[1 + floor(random() * 2)::int];
$$;

-- Выдача документа по заявлению со снимком анкеты, фото и подписи.
create function private.issue_from_application(
  p_app public.applications, p_type public.doc_type, p_valid interval, p_extra jsonb, p_holder_signature text
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  new_id bigint;
  country public.countries;
  city text;
  anketa jsonb;
begin
  select * into country from countries where code = p_app.target_country;
  city := coalesce(nullif(p_app.data ->> 'city', ''), country.capital, country.name);
  anketa := jsonb_strip_nulls(jsonb_build_object(
    'last_name', p_app.data ->> 'last_name',
    'first_name', p_app.data ->> 'first_name',
    'patronymic', p_app.data ->> 'patronymic',
    'sex', p_app.data ->> 'sex',
    'birth_date', p_app.data ->> 'birth_date',
    'birth_place', p_app.data ->> 'birth_place'
  ));
  insert into documents (user_id, type, country_code, number, data, valid_until, application_id,
                         photo_path, holder_signature_path, issuer, division_code, issued_by)
  values (p_app.user_id, p_type, p_app.target_country, private.gen_doc_number(),
          anketa || coalesce(p_extra, '{}'),
          case when p_valid is null then null else now() + p_valid end, p_app.id,
          p_app.photo_path, p_holder_signature,
          'ПсяМВД ' || country.name || ' по г. ' || city,
          private.random_division_code(), p_app.reviewer_id)
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Подпись
-- ---------------------------------------------------------------------
create function public.set_signature(p_path text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if not private.own_file(me.id, 'signatures', p_path) then raise exception 'E_NEED_SIGNATURE'; end if;
  update profiles set signature_path = p_path where id = me.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Экзамен
-- ---------------------------------------------------------------------
create function public.start_exam()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  last_fail timestamptz;
  ids int[];
  attempt_id bigint;
begin
  select max(finished_at) into last_fail from exam_attempts where user_id = me.id and passed = false;
  if last_fail is not null and last_fail > now() - interval '1 hour' then
    raise exception 'E_EXAM_COOLDOWN';
  end if;
  select array_agg(id) into ids from (select id from exam_questions where active order by random() limit 10) q;
  insert into exam_attempts (user_id, question_ids) values (me.id, ids) returning id into attempt_id;
  return jsonb_build_object(
    'attempt_id', attempt_id,
    'questions', (
      select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'options', q.options) order by t.ord)
      from unnest(ids) with ordinality as t(qid, ord) join exam_questions q on q.id = t.qid
    )
  );
end;
$$;

create function public.submit_exam(p_attempt bigint, p_answers int[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  att public.exam_attempts;
  result_score int;
  correct_flags boolean[];
begin
  select * into att from exam_attempts where id = p_attempt and user_id = me.id for update;
  if att.id is null then raise exception 'E_NOT_FOUND'; end if;
  if att.finished_at is not null then raise exception 'E_BAD_STATUS'; end if;
  if att.started_at < now() - interval '1 hour' then raise exception 'E_EXAM_EXPIRED'; end if;
  if p_answers is null or coalesce(array_length(p_answers, 1), 0) <> array_length(att.question_ids, 1) then
    raise exception 'E_BAD_DATA';
  end if;
  select array_agg(q.correct = p_answers[t.ord] order by t.ord) into correct_flags
  from unnest(att.question_ids) with ordinality as t(qid, ord) join exam_questions q on q.id = t.qid;
  select count(*) into result_score from unnest(correct_flags) f where f;
  update exam_attempts
  set answers = p_answers, score = result_score, passed = result_score >= 7, finished_at = now()
  where id = att.id;
  return jsonb_build_object('ok', true, 'score', result_score, 'total', array_length(att.question_ids, 1),
                            'passed', result_score >= 7, 'correct', to_jsonb(correct_flags));
end;
$$;

-- ---------------------------------------------------------------------
-- Запись на приём
-- ---------------------------------------------------------------------
create function public.create_slots(p_starts_at timestamptz, p_count int, p_interval_minutes int, p_place text,
                                    p_country text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  country text;
  i int;
begin
  if me.role = 'citizen' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  country := case when me.role = 'superadmin' then p_country else me.gov_country_code end;
  if country is null then raise exception 'E_BAD_COUNTRY'; end if;
  if p_count is null or p_count not between 1 and 50 then raise exception 'E_BAD_AMOUNT'; end if;
  if p_interval_minutes is null or p_interval_minutes not between 1 and 1440 then raise exception 'E_BAD_AMOUNT'; end if;
  if p_starts_at is null or p_starts_at < now() - interval '5 minutes' then raise exception 'E_BAD_DATE'; end if;
  if coalesce(btrim(p_place), '') = '' then raise exception 'E_REQUIRED'; end if;
  if private.guard(me.id, array[p_place]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;
  for i in 0..p_count - 1 loop
    insert into appointment_slots (country_code, starts_at, place, official_id)
    values (country, p_starts_at + make_interval(mins => i * p_interval_minutes), btrim(p_place), me.id);
  end loop;
  perform private.audit(me.id, 'create_slots', country, jsonb_build_object('count', p_count));
  return jsonb_build_object('ok', true, 'count', p_count);
end;
$$;

create function public.delete_slot(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  s public.appointment_slots;
begin
  select * into s from appointment_slots where id = p_id for update;
  if s.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not public.is_staff_of(s.country_code) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if s.application_id is not null then raise exception 'E_SLOT_BOOKED'; end if;
  delete from appointment_slots where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Бронирует свободный будущий слот страны за заявлением.
create function private.book_slot(p_slot bigint, p_country text, p_app bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.appointment_slots;
begin
  select * into s from appointment_slots where id = p_slot for update;
  if s.id is null or s.country_code <> p_country or s.starts_at <= now() or s.application_id is not null then
    raise exception 'E_SLOT_UNAVAILABLE';
  end if;
  update appointment_slots set application_id = p_app where id = p_slot;
  update applications set slot_id = p_slot where id = p_app;
end;
$$;

create function public.rebook_appointment(p_app bigint, p_slot bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  a public.applications;
begin
  select * into a from applications where id = p_app and user_id = me.id for update;
  if a.id is null then raise exception 'E_NOT_FOUND'; end if;
  if a.status::text <> 'appointment' then raise exception 'E_BAD_STATUS'; end if;
  update appointment_slots set application_id = null where application_id = a.id;
  perform private.book_slot(p_slot, a.target_country, a.id);
  update applications set updated_at = now() where id = a.id;
  return jsonb_build_object('ok', true);
end;
$$;

create function public.mark_attendance(p_app bigint, p_attended boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  a public.applications;
begin
  select * into a from applications where id = p_app for update;
  if a.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not private.can_review(me, a) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if a.status::text <> 'appointment' or a.slot_id is null then raise exception 'E_BAD_STATUS'; end if;
  if p_attended then
    update applications set status = 'submitted', attended_at = now(), updated_at = now() where id = a.id;
    perform private.notify(a.user_id, 'appointment_attended', jsonb_build_object('id', a.id, 'service', a.service_code),
                           '/cabinet/applications/' || a.id);
  else
    update appointment_slots set application_id = null where application_id = a.id;
    update applications set slot_id = null, updated_at = now() where id = a.id;
    perform private.notify(a.user_id, 'appointment_missed', jsonb_build_object('id', a.id, 'service', a.service_code),
                           '/cabinet/applications/' || a.id);
  end if;
  perform private.audit(me.id, 'mark_attendance', a.id::text, jsonb_build_object('attended', p_attended));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Подача заявления (новая версия с фото, экзаменом и записью)
-- ---------------------------------------------------------------------
drop function public.submit_application(text, text, jsonb);

create function public.submit_application(
  p_service text, p_target text default null, p_data jsonb default '{}',
  p_photo_path text default null, p_signature_path text default null,
  p_slot_id bigint default null, p_exam_attempt bigint default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  svc public.services;
  target text;
  app_id bigint;
  exam_ok boolean;
begin
  select * into svc from services where code = p_service and active;
  if svc.code is null then
    raise exception 'E_SERVICE_UNAVAILABLE';
  end if;
  p_data := coalesce(p_data, '{}');
  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'E_BAD_DATA';
  end if;

  if private.guard(me.id, private.form_texts(p_data)) then
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
             and status::text in ('submitted', 'needs_info', 'appointment', 'producing')) then
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

  -- Анкета, фото и подпись для документов с фото
  if svc.needs_photo then
    if coalesce(btrim(p_data ->> 'last_name'), '') = '' or coalesce(btrim(p_data ->> 'first_name'), '') = ''
       or coalesce(p_data ->> 'sex', '') not in ('М', 'Ж')
       or coalesce(p_data ->> 'birth_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or coalesce(btrim(p_data ->> 'birth_place'), '') = '' then
      raise exception 'E_ANKETA';
    end if;
    if not private.own_file(me.id, 'photos', p_photo_path) then raise exception 'E_NEED_PHOTO'; end if;
    if not private.own_file(me.id, 'signatures', p_signature_path) then raise exception 'E_NEED_SIGNATURE'; end if;
  end if;

  -- Экзамен и присяга
  if svc.needs_exam then
    select exists (
      select 1 from exam_attempts
      where id = p_exam_attempt and user_id = me.id and passed and finished_at > now() - interval '30 days'
    ) into exam_ok;
    if not exam_ok then raise exception 'E_NEED_EXAM'; end if;
    if coalesce(p_data ->> 'oath', '') <> 'true' then raise exception 'E_NEED_OATH'; end if;
    if p_slot_id is null then raise exception 'E_SLOT_UNAVAILABLE'; end if;
  end if;

  insert into applications (user_id, service_code, target_country, data, fee, photo_path, signature_path, exam_attempt_id, status)
  values (me.id, p_service, target, p_data, svc.fee,
          case when svc.needs_photo then p_photo_path end,
          case when svc.needs_photo then p_signature_path end,
          case when svc.needs_exam then p_exam_attempt end,
          case when svc.needs_exam then 'appointment'::public.app_status else 'submitted'::public.app_status end)
  returning id into app_id;

  if svc.needs_exam then
    perform private.book_slot(p_slot_id, target, app_id);
  end if;

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

grant execute on function public.submit_application(text, text, jsonb, text, text, bigint, bigint) to authenticated;
revoke execute on function public.submit_application(text, text, jsonb, text, text, bigint, bigint) from anon, public;

-- Отзыв заявления: освобождает слот и возвращает пошлину.
create or replace function public.cancel_application(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  a public.applications;
begin
  select * into a from applications where id = p_id and user_id = me.id for update;
  if a.id is null then raise exception 'E_NOT_FOUND'; end if;
  if a.status::text not in ('submitted', 'needs_info', 'appointment') then raise exception 'E_BAD_STATUS'; end if;
  update appointment_slots set application_id = null where application_id = a.id;
  update applications set status = 'cancelled', slot_id = null, updated_at = now() where id = p_id;
  if a.fee > 0 then
    perform private.move_coins(me.id, a.fee, 'refund', 'application', a.id, me.id, a.service_code);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Рассмотрение: одобренный документ уходит в изготовление
-- ---------------------------------------------------------------------
create or replace function public.review_application(p_id bigint, p_decision text, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  a public.applications;
  svc public.services;
  new_status public.app_status;
  minutes int := coalesce(nullif(private.setting('passport_production_minutes'), '')::int, 30);
begin
  select * into a from applications where id = p_id for update;
  if a.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not private.can_review(me, a) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if p_decision not in ('approve', 'reject', 'needs_info') then raise exception 'E_BAD_DATA'; end if;
  if not (a.status::text = 'submitted'
          or (p_decision = 'reject' and a.status::text in ('needs_info', 'appointment'))) then
    raise exception 'E_BAD_STATUS';
  end if;
  if p_decision in ('needs_info', 'reject') and coalesce(btrim(p_comment), '') = '' then
    raise exception 'E_COMMENT_REQUIRED';
  end if;
  if p_decision in ('approve', 'reject') and me.signature_path is null then
    raise exception 'E_NEED_SIGNATURE';
  end if;

  if private.guard(me.id, array[p_comment]) then
    return jsonb_build_object('ok', false, 'error', 'E_FORBIDDEN');
  end if;

  select * into svc from services where code = a.service_code;

  if p_decision = 'approve' then
    if svc.doc_type is not null then
      new_status := 'producing';
    else
      new_status := 'approved';
    end if;
  elsif p_decision = 'reject' then
    new_status := 'rejected';
    update appointment_slots set application_id = null
      where application_id = a.id and starts_at > now();
    if a.fee > 0 then
      perform private.move_coins(a.user_id, a.fee, 'refund', 'application', a.id, me.id, a.service_code);
    end if;
  else
    new_status := 'needs_info';
  end if;

  update applications
  set status = new_status, reviewer_id = me.id, reviewer_comment = nullif(btrim(coalesce(p_comment, '')), ''),
      reviewed_at = now(), updated_at = now(),
      decision_signature_path = case when p_decision in ('approve', 'reject') then me.signature_path else decision_signature_path end,
      ready_at = case when new_status::text = 'producing' then now() + make_interval(mins => minutes) else ready_at end
  where id = a.id;

  perform private.notify(a.user_id, 'app_status',
    jsonb_build_object('id', a.id, 'service', a.service_code, 'status', new_status),
    '/cabinet/applications/' || a.id);
  perform private.audit(me.id, 'review_application', a.id::text,
    jsonb_build_object('decision', p_decision, 'service', a.service_code));
  return jsonb_build_object('ok', true);
end;
$$;

-- Чиновник отмечает, что документ изготовлен досрочно.
create function public.speed_up_production(p_app bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  a public.applications;
begin
  select * into a from applications where id = p_app for update;
  if a.id is null then raise exception 'E_NOT_FOUND'; end if;
  if not private.can_review(me, a) then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if a.status::text <> 'producing' then raise exception 'E_BAD_STATUS'; end if;
  update applications set ready_at = now(), updated_at = now() where id = a.id;
  perform private.notify(a.user_id, 'doc_ready', jsonb_build_object('id', a.id, 'service', a.service_code),
                         '/cabinet/applications/' || a.id);
  return jsonb_build_object('ok', true);
end;
$$;

-- Гражданин расписывается в получении, и документ начинает действовать.
create function public.receive_document(p_app bigint, p_signature_path text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
  a public.applications;
  svc public.services;
  applicant public.profiles;
  old_country text;
  doc_id bigint;
begin
  select * into a from applications where id = p_app and user_id = me.id for update;
  if a.id is null then raise exception 'E_NOT_FOUND'; end if;
  if a.status::text <> 'producing' then raise exception 'E_BAD_STATUS'; end if;
  if a.ready_at is null or a.ready_at > now() then raise exception 'E_NOT_READY'; end if;
  if not private.own_file(me.id, 'signatures', p_signature_path) then raise exception 'E_NEED_SIGNATURE'; end if;

  select * into svc from services where code = a.service_code;
  select * into applicant from profiles where id = a.user_id for update;

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
      doc_id := private.issue_from_application(a, 'psyals', null, '{}', p_signature_path);
    when 'visa' then
      doc_id := private.issue_from_application(a, 'visa', interval '30 days',
                                               jsonb_build_object('purpose', a.data ->> 'purpose'), p_signature_path);
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

-- Публичная проверка подлинности документа по номеру (без персональных данных).
create function public.verify_document(p_number text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
       'found', true, 'type', d.type, 'country_code', d.country_code, 'issued_at', d.issued_at,
       'valid_until', d.valid_until, 'revoked', d.revoked_at is not null,
       'valid', d.revoked_at is null and (d.valid_until is null or d.valid_until > now()))
     from public.documents d where d.number = btrim(p_number)),
    jsonb_build_object('found', false));
$$;

-- Настройки: время изготовления документов.
create or replace function public.admin_set_setting(p_key text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me public.profiles := private.require_profile();
begin
  if me.role <> 'superadmin' then raise exception 'E_FORBIDDEN_ACTION'; end if;
  if p_key not in ('invite_code', 'forbidden_fine', 'passport_production_minutes') then raise exception 'E_BAD_DATA'; end if;
  if p_key = 'forbidden_fine' and (p_value !~ '^[0-9]+$' or p_value::int <= 0) then raise exception 'E_BAD_AMOUNT'; end if;
  if p_key = 'passport_production_minutes' and (p_value !~ '^[0-9]+$' or p_value::int > 100000) then
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
alter table public.appointment_slots enable row level security;
alter table public.exam_questions enable row level security;
alter table public.exam_attempts enable row level security;

create policy slots_read on public.appointment_slots for select to authenticated using (true);
create policy exam_attempts_read on public.exam_attempts for select to authenticated using (
  user_id = (select auth.uid()) or public.is_any_staff()
);
-- exam_questions без политик чтения: правильные ответы не видны.

revoke insert, update, delete, truncate on public.appointment_slots, public.exam_questions, public.exam_attempts
  from anon, authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.check_signup(text, text, text) to anon;
grant execute on function public.invite_required() to anon;
grant execute on function public.verify_document(text) to anon;
