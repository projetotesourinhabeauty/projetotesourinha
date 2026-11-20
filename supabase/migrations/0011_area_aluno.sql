-- Área do Aluno: aulas das turmas, presença por QR Code, materiais e certificado digital.

-- ---------------------------------------------------------------
-- Aulas (encontros) de cada curso
-- ---------------------------------------------------------------
create table public.course_classes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,                       -- ex.: "Módulo 1 · Visagismo"
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room text,
  teacher text,
  -- Código do QR da chamada (o aluno escaneia na aula). Só o admin enxerga.
  check_in_code text not null unique default encode(extensions.gen_random_bytes(9), 'hex'),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index course_classes_course_idx on public.course_classes (course_id, starts_at);
alter table public.course_classes enable row level security;

-- Aluno vê as aulas pela view my_course_classes (sem o código da chamada).
create policy "admin aulas" on public.course_classes for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- Presença
-- ---------------------------------------------------------------
create table public.attendance (
  class_id uuid not null references public.course_classes (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  method text not null default 'qr' check (method in ('qr', 'manual')),
  checked_at timestamptz not null default now(),
  primary key (class_id, user_id)
);
alter table public.attendance enable row level security;
create policy "minha presença" on public.attendance for select using (user_id = auth.uid() or public.is_admin());
create policy "admin presença" on public.attendance for all using (public.is_admin()) with check (public.is_admin());

-- Aulas que o aluno logado pode ver (sem o código da chamada) e se ele esteve presente.
create view public.my_course_classes with (security_invoker = false) as
  select c.id, c.course_id, c.title, c.starts_at, c.ends_at, c.room, c.teacher,
         exists (select 1 from public.attendance a where a.class_id = c.id and a.user_id = auth.uid()) as present
  from public.course_classes c
  where exists (
    select 1 from public.enrollments e
    where e.course_id = c.course_id and e.user_id = auth.uid() and e.status in ('inscrito', 'concluído')
  );

-- ---------------------------------------------------------------
-- Materiais (apostilas, vídeos, links)
-- ---------------------------------------------------------------
create table public.course_materials (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  url text not null,
  kind text not null default 'link' check (kind in ('pdf', 'video', 'link')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.course_materials enable row level security;
create policy "materiais do meu curso" on public.course_materials for select using (
  public.is_admin() or exists (
    select 1 from public.enrollments e
    where e.course_id = course_materials.course_id and e.user_id = auth.uid() and e.status in ('inscrito', 'concluído')
  )
);
create policy "admin materiais" on public.course_materials for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- Certificado
-- ---------------------------------------------------------------
alter table public.enrollments
  add column completed_at timestamptz,
  add column certificate_code text unique;

-- Presença por QR: o aluno logado envia o código lido na aula.
-- Vale de 30 min antes do início até 30 min depois do fim da aula.
create or replace function public.check_in(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  c record;
begin
  if v_uid is null then raise exception 'Entre na sua conta para registrar a presença'; end if;
  select cc.*, co.title as course_title into c
    from public.course_classes cc join public.courses co on co.id = cc.course_id
   where cc.check_in_code = lower(trim(p_code));
  if not found then raise exception 'QR Code inválido'; end if;
  if now() < c.starts_at - interval '30 minutes' or now() > c.ends_at + interval '30 minutes' then
    raise exception 'A chamada desta aula não está aberta agora';
  end if;
  if not exists (select 1 from public.enrollments e where e.course_id = c.course_id and e.user_id = v_uid and e.status = 'inscrito') then
    raise exception 'Você não está inscrito(a) neste curso';
  end if;
  insert into public.attendance (class_id, user_id, method) values (c.id, v_uid, 'qr')
  on conflict (class_id, user_id) do nothing;
  return json_build_object('course', c.course_title, 'class', c.title, 'course_id', c.course_id);
end $$;
revoke execute on function public.check_in(text) from public, anon;
grant execute on function public.check_in(text) to authenticated;

-- Ao concluir (admin marca "concluído"): gera o código do certificado, avisa o aluno
-- e, se ele já for profissional, aplica o selo "Formado pela Tesourinha".
create or replace function public.on_enrollment_completed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_course text;
begin
  if new.status = 'concluído' and old.status is distinct from 'concluído' then
    new.completed_at := coalesce(new.completed_at, now());
    new.certificate_code := coalesce(new.certificate_code, upper(encode(extensions.gen_random_bytes(5), 'hex')));
    select title into v_course from public.courses where id = new.course_id;
    perform public.notify_user(new.user_id, 'cliente', 'aprovado', 'Parabéns, você se formou!',
      format('Seu certificado do curso %s está pronto no app.', v_course), '/my/courses');
    update public.professionals set tesourinha_alumni = true where profile_id = new.user_id;
  end if;
  return new;
end $$;
revoke execute on function public.on_enrollment_completed() from public, anon, authenticated;

create trigger enrollments_completed
  before update of status on public.enrollments
  for each row execute function public.on_enrollment_completed();

-- Quem se formou e depois vira profissional já entra com o selo.
create or replace function public.on_professional_alumni()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.enrollments e where e.user_id = new.profile_id and e.status = 'concluído') then
    new.tesourinha_alumni := true;
  end if;
  return new;
end $$;
revoke execute on function public.on_professional_alumni() from public, anon, authenticated;

create trigger professionals_alumni
  before insert on public.professionals
  for each row execute function public.on_professional_alumni();

-- Verificação pública do certificado (página /certificado no site).
create or replace function public.verify_certificate(p_code text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'name', p.full_name,
    'course', c.title,
    'hours', c.duration_hours,
    'completed_at', e.completed_at,
    'code', e.certificate_code
  )
  from public.enrollments e
  join public.profiles p on p.id = e.user_id
  join public.courses c on c.id = e.course_id
  where e.certificate_code = upper(trim(p_code)) and e.status = 'concluído'
$$;
grant execute on function public.verify_certificate(text) to anon, authenticated;

grant select on public.my_course_classes to authenticated;
grant select on public.attendance, public.course_materials to authenticated;
grant select, insert, update, delete on public.course_classes, public.attendance, public.course_materials to authenticated;
