-- Tesourinha Beauty · dados que o painel administrativo precisa

-- E-mail no perfil (o painel lista usuários; auth.users não é acessível pela API).
alter table public.profiles add column if not exists email text;

update public.profiles p set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'phone',
    new.email
  );
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Valor do agendamento: quando o app não envia, usa o preço do serviço
-- (o preço do profissional, se houver, tem prioridade).
create or replace function public.fill_booking_price()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.price is null then
    select coalesce(ps.price, s.price_from) into new.price
    from public.services s
    left join public.professional_services ps
      on ps.service_id = s.id and ps.professional_id = new.professional_id
    where s.id = new.service_id;
  end if;
  return new;
end $$;
revoke execute on function public.fill_booking_price() from public, anon, authenticated;

drop trigger if exists bookings_fill_price on public.bookings;
create trigger bookings_fill_price
  before insert on public.bookings
  for each row execute function public.fill_booking_price();
