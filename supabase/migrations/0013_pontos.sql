-- Pontos "Tesourinhas" e níveis (Bronze, Prata, Ouro).
-- Ganha-se pontos usando a plataforma; eles valem 12 meses e viram cupons de desconto na loja.

-- ---------------------------------------------------------------
-- Regras (o admin ajusta os valores no painel)
-- ---------------------------------------------------------------
create table public.points_rules (
  key text primary key,
  label text not null,
  points int not null check (points >= 0),
  active boolean not null default true
);
insert into public.points_rules (key, label, points) values
  ('atendimento_cliente', 'Atendimento concluído (cliente)', 50),
  ('avaliacao', 'Avaliação publicada', 20),
  ('curso_concluido', 'Curso concluído', 200),
  ('indicacao', 'Amigo indicado fez o 1º atendimento', 100),
  ('atendimento_pro', 'Atendimento concluído (profissional)', 20)
on conflict (key) do nothing;
alter table public.points_rules enable row level security;
create policy "regras visíveis" on public.points_rules for select using (true);
create policy "admin regras" on public.points_rules for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- Extrato
-- ---------------------------------------------------------------
create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  delta int not null check (delta <> 0),
  reason text not null,                 -- chave da regra, 'resgate' ou 'ajuste'
  description text not null,
  ref_id uuid,                          -- agendamento, avaliação, inscrição, cupom...
  created_at timestamptz not null default now(),
  expires_at timestamptz,               -- só para créditos (12 meses)
  unique (user_id, reason, ref_id)      -- evita crédito em dobro
);
create index points_ledger_user_idx on public.points_ledger (user_id, created_at desc);
alter table public.points_ledger enable row level security;
create policy "meu extrato" on public.points_ledger for select using (user_id = auth.uid() or public.is_admin());
create policy "admin extrato" on public.points_ledger for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- Cupons (resgate de pontos)
-- ---------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique default upper(encode(extensions.gen_random_bytes(4), 'hex')),
  value numeric(10, 2) not null check (value > 0),
  source text not null default 'pontos',
  expires_at timestamptz not null default now() + interval '90 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;
create policy "meus cupons" on public.coupons for select using (user_id = auth.uid() or public.is_admin());
create policy "admin cupons" on public.coupons for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- Indicação
-- ---------------------------------------------------------------
alter table public.profiles
  add column referral_code text unique,
  add column referred_by uuid references public.profiles (id) on delete set null;

-- Código de indicação do usuário logado (gera na primeira vez, para contas antigas).
create or replace function public.my_referral_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if auth.uid() is null then return null; end if;
  select referral_code into v_code from public.profiles where id = auth.uid();
  if v_code is null then
    v_code := upper(encode(extensions.gen_random_bytes(3), 'hex'));
    update public.profiles set referral_code = v_code where id = auth.uid();
  end if;
  return v_code;
end $$;
revoke execute on function public.my_referral_code() from public, anon;
grant execute on function public.my_referral_code() to authenticated;

create or replace function public.set_referral_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.referral_code is null then
    new.referral_code := upper(encode(extensions.gen_random_bytes(3), 'hex'));
  end if;
  return new;
end $$;
create trigger profiles_referral_code before insert on public.profiles
  for each row execute function public.set_referral_code();

-- Quem se cadastra com código de indicação (metadado "ref" do cadastro) fica ligado a quem indicou.
create or replace function public.link_referral()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ref text;
  v_by uuid;
begin
  select raw_user_meta_data->>'ref' into v_ref from auth.users where id = new.id;
  if v_ref is not null and length(trim(v_ref)) > 0 then
    select id into v_by from public.profiles where referral_code = upper(trim(v_ref)) and id <> new.id;
    if v_by is not null then
      update public.profiles set referred_by = v_by where id = new.id;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.link_referral() from public, anon, authenticated;
create trigger profiles_link_referral after insert on public.profiles
  for each row execute function public.link_referral();

-- ---------------------------------------------------------------
-- Saldo (FIFO: o resgate consome primeiro os pontos mais antigos) e nível
-- ---------------------------------------------------------------
create or replace function public.points_summary(p_user uuid default auth.uid())
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_spent int;
  v_balance int := 0;
  v_year int;
  v_expiring int := 0;
  r record;
  v_use int;
  v_left int;
  v_level text;
  v_next int;
begin
  if p_user is null or (p_user <> auth.uid() and not public.is_admin()) then
    raise exception 'Sem acesso';
  end if;
  select coalesce(-sum(delta), 0) into v_spent from public.points_ledger where user_id = p_user and delta < 0;
  for r in select delta, expires_at from public.points_ledger where user_id = p_user and delta > 0 order by created_at loop
    v_use := least(r.delta, v_spent);
    v_spent := v_spent - v_use;
    v_left := r.delta - v_use;
    if r.expires_at is null or r.expires_at > now() then
      v_balance := v_balance + v_left;
      if r.expires_at is not null and r.expires_at <= now() + interval '30 days' then
        v_expiring := v_expiring + v_left;
      end if;
    end if;
  end loop;
  select coalesce(sum(delta), 0) into v_year from public.points_ledger
   where user_id = p_user and delta > 0 and created_at > now() - interval '12 months';
  v_level := case when v_year >= 1500 then 'Ouro' when v_year >= 500 then 'Prata' else 'Bronze' end;
  v_next := case when v_year >= 1500 then null when v_year >= 500 then 1500 else 500 end;
  return json_build_object('balance', v_balance, 'year_points', v_year, 'level', v_level,
    'next_level_at', v_next, 'expiring_30d', v_expiring);
end $$;
grant execute on function public.points_summary(uuid) to authenticated;

-- Crédito de pontos conforme a regra (ignora regra desligada e crédito repetido).
create or replace function public.award_points(p_user uuid, p_rule text, p_ref uuid, p_desc text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_pts int;
begin
  if p_user is null then return; end if;
  select points into v_pts from public.points_rules where key = p_rule and active;
  if v_pts is null or v_pts <= 0 then return; end if;
  insert into public.points_ledger (user_id, delta, reason, description, ref_id, expires_at)
  values (p_user, v_pts, p_rule, p_desc, p_ref, now() + interval '12 months')
  on conflict (user_id, reason, ref_id) do nothing;
  if found then
    perform public.notify_user(p_user, case when p_rule = 'atendimento_pro' then 'pro' else 'cliente' end, 'pontos',
      format('+%s Tesourinhas', v_pts), p_desc, '/points');
  end if;
end $$;
revoke execute on function public.award_points(uuid, text, uuid, text) from public, anon, authenticated;

-- Resgate: 100 pontos = R$ 5,00 de cupom (múltiplos de 100).
create or replace function public.redeem_points(p_points int)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_balance int;
  v_coupon public.coupons;
begin
  if v_uid is null then raise exception 'Entre na sua conta'; end if;
  if p_points is null or p_points < 100 or p_points % 100 <> 0 then
    raise exception 'Resgate em múltiplos de 100 pontos';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_uid::text));
  v_balance := (public.points_summary(v_uid)->>'balance')::int;
  if v_balance < p_points then raise exception 'Saldo insuficiente'; end if;
  insert into public.coupons (user_id, value) values (v_uid, p_points / 100 * 5) returning * into v_coupon;
  insert into public.points_ledger (user_id, delta, reason, description, ref_id)
  values (v_uid, -p_points, 'resgate', format('Cupom %s de R$ %s', v_coupon.code, to_char(v_coupon.value, 'FM999990D00')), v_coupon.id);
  return json_build_object('code', v_coupon.code, 'value', v_coupon.value, 'expires_at', v_coupon.expires_at);
end $$;
revoke execute on function public.redeem_points(int) from public, anon;
grant execute on function public.redeem_points(int) to authenticated;

-- ---------------------------------------------------------------
-- Gatilhos que dão pontos
-- ---------------------------------------------------------------
create or replace function public.on_booking_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pro record;
  v_service text;
  v_ref uuid;
  v_first boolean;
begin
  if new.status = 'concluido' and old.status is distinct from 'concluido' then
    select name, profile_id into v_pro from public.professionals where id = new.professional_id;
    select name into v_service from public.services where id = new.service_id;
    perform public.award_points(new.user_id, 'atendimento_cliente', new.id, format('%s com %s', v_service, v_pro.name));
    perform public.award_points(v_pro.profile_id, 'atendimento_pro', new.id, format('Atendimento de %s', v_service));
    -- Indicação: primeiro atendimento concluído do indicado vale pontos para quem indicou.
    if new.user_id is not null then
      select referred_by into v_ref from public.profiles where id = new.user_id;
      select not exists (select 1 from public.bookings b where b.user_id = new.user_id and b.status = 'concluido' and b.id <> new.id) into v_first;
      if v_ref is not null and v_first then
        perform public.award_points(v_ref, 'indicacao', new.user_id, 'Seu convite virou atendimento');
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.on_booking_points() from public, anon, authenticated;
create trigger bookings_points after update of status on public.bookings
  for each row execute function public.on_booking_points();

create or replace function public.on_review_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.award_points(new.user_id, 'avaliacao', new.id, 'Obrigado pela avaliação!');
  return new;
end $$;
revoke execute on function public.on_review_points() from public, anon, authenticated;
create trigger reviews_points after insert on public.reviews
  for each row execute function public.on_review_points();

create or replace function public.on_course_points()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_course text;
begin
  if new.status = 'concluído' and old.status is distinct from 'concluído' then
    select title into v_course from public.courses where id = new.course_id;
    perform public.award_points(new.user_id, 'curso_concluido', new.id, format('Formatura: %s', v_course));
  end if;
  return new;
end $$;
revoke execute on function public.on_course_points() from public, anon, authenticated;
create trigger enrollments_points after update of status on public.enrollments
  for each row execute function public.on_course_points();

grant select on public.points_rules to anon, authenticated;
grant select on public.points_ledger, public.coupons to authenticated;
grant insert, update, delete on public.points_rules, public.points_ledger, public.coupons to authenticated;
