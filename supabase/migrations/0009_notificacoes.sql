-- Notificações: central de avisos no app (cliente e profissional), lembrete de agendamento
-- e push no celular (Expo Push, enviado pela Edge Function "enviar-push").

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------
-- Avisos
-- ---------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,          -- novo_agendamento | confirmado | cancelado | concluido | lembrete | aprovado | aviso
  title text not null,
  body text not null,
  link text,                   -- rota no app, ex.: /bookings ou /appointment/<id>
  app text not null default 'cliente' check (app in ('cliente', 'pro')),
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;

create policy "ver meus avisos" on public.notifications for select using (user_id = auth.uid());
create policy "marcar meus avisos" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "apagar meus avisos" on public.notifications for delete using (user_id = auth.uid());
create policy "admin gerencia avisos" on public.notifications for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- Tokens de push dos aparelhos
-- ---------------------------------------------------------------
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  app text not null check (app in ('cliente', 'pro')),
  platform text,
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
create policy "meus aparelhos" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Preferências (tela Configurações do app do cliente)
alter table public.profiles
  add column notify_reminders boolean not null default true,
  add column notify_courses boolean not null default true,
  add column notify_jobs boolean not null default false;

alter table public.bookings add column reminder_sent_at timestamptz;

-- ---------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------
create or replace function public.notify_user(p_user uuid, p_app text, p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, app, kind, title, body, link)
  values (p_user, p_app, p_kind, p_title, p_body, p_link);
end $$;
revoke execute on function public.notify_user(uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.fmt_br(ts timestamptz)
returns text language sql immutable set search_path = public as $$
  select to_char(ts at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
$$;

-- ---------------------------------------------------------------
-- Gatilhos de agendamento
-- ---------------------------------------------------------------
create or replace function public.on_booking_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pro record;
  v_service text;
  v_client text;
  v_when text := public.fmt_br(new.starts_at);
begin
  select p.id, p.name, p.profile_id into v_pro from public.professionals p where p.id = new.professional_id;
  select s.name into v_service from public.services s where s.id = new.service_id;
  select coalesce(pr.full_name, new.client_name, 'Cliente') into v_client
    from (select 1) x left join public.profiles pr on pr.id = new.user_id;

  if tg_op = 'INSERT' then
    -- Encaixe é lançado pelo próprio profissional: não precisa avisar ninguém.
    if new.source = 'app' then
      perform public.notify_user(v_pro.profile_id, 'pro', 'novo_agendamento', 'Novo agendamento',
        format('%s marcou %s para %s.', v_client, v_service, v_when), '/appointment/' || new.id);
      perform public.notify_user(new.user_id, 'cliente', 'confirmado', 'Agendamento confirmado',
        format('%s com %s, %s.', v_service, v_pro.name, v_when), '/bookings');
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'cancelado' then
      if auth.uid() is not null and auth.uid() = new.user_id then
        perform public.notify_user(v_pro.profile_id, 'pro', 'cancelado', 'Agendamento cancelado',
          format('%s cancelou %s de %s.', v_client, v_service, v_when), '/appointment/' || new.id);
      else
        perform public.notify_user(new.user_id, 'cliente', 'cancelado', 'Agendamento cancelado',
          format('%s com %s, %s, foi cancelado. Que tal escolher outro horário?', v_service, v_pro.name, v_when), '/bookings');
      end if;
    elsif new.status = 'concluido' then
      perform public.notify_user(new.user_id, 'cliente', 'concluido', 'Como foi seu atendimento?',
        format('Conte como foi %s com %s. Sua avaliação ajuda outros clientes.', v_service, v_pro.name), '/bookings');
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.on_booking_notify() from public, anon, authenticated;

create trigger bookings_notify
  after insert or update of status on public.bookings
  for each row execute function public.on_booking_notify();

-- Cadastro profissional aprovado pela Associação
create or replace function public.on_professional_status_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'aprovado' and old.status is distinct from 'aprovado' then
    perform public.notify_user(new.profile_id, 'pro', 'aprovado', 'Cadastro aprovado!',
      'Seu perfil já aparece para os clientes no app Tesourinha Beauty. Boas vendas!', '/');
  end if;
  return new;
end $$;
revoke execute on function public.on_professional_status_notify() from public, anon, authenticated;

create trigger professionals_status_notify
  after update of status on public.professionals
  for each row execute function public.on_professional_status_notify();

-- ---------------------------------------------------------------
-- Lembrete: ~24h antes (ou 2h antes, para quem marcou em cima da hora)
-- ---------------------------------------------------------------
create or replace function public.send_booking_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select b.id, b.user_id, b.starts_at, s.name as service, p.name as pro
    from public.bookings b
    join public.services s on s.id = b.service_id
    join public.professionals p on p.id = b.professional_id
    join public.profiles pr on pr.id = b.user_id
    where b.status = 'confirmado'
      and b.reminder_sent_at is null
      and b.starts_at > now()
      and (
        (b.starts_at <= now() + interval '24 hours' and b.created_at <= b.starts_at - interval '26 hours')
        or b.starts_at <= now() + interval '2 hours'
      )
      and pr.notify_reminders
    for update of b skip locked
  loop
    perform public.notify_user(r.user_id, 'cliente', 'lembrete', 'Lembrete do seu horário',
      format('%s com %s, %s. Até lá!', r.service, r.pro, public.fmt_br(r.starts_at)), '/bookings');
    update public.bookings set reminder_sent_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.send_booking_reminders() from public, anon, authenticated;

select cron.schedule('lembretes-agendamento', '*/10 * * * *', $$select public.send_booking_reminders()$$);

-- ---------------------------------------------------------------
-- Push: cada aviso novo chama a Edge Function "enviar-push" (que só envia
-- avisos ainda não enviados, então chamá-la de novo não duplica nada).
-- ---------------------------------------------------------------
create or replace function public.on_notification_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.push_tokens t where t.user_id = new.user_id and t.app = new.app) then
    perform net.http_post(
      url := 'https://nwykuwvtmvwlycizojom.supabase.co/functions/v1/enviar-push',
      body := jsonb_build_object('id', new.id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end $$;
revoke execute on function public.on_notification_push() from public, anon, authenticated;

create trigger notifications_push
  after insert on public.notifications
  for each row execute function public.on_notification_push();

grant select, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
