-- Loja Tesourinha: produtos com preço Pro (profissional aprovado paga menos),
-- carrinho, pedidos, cupons de pontos e acompanhamento pelo painel.
-- Pagamento: começa "na retirada"; o Mercado Pago entra depois (colunas já previstas).

-- ---------------------------------------------------------------
-- Configuração (uma linha só)
-- ---------------------------------------------------------------
create table public.store_settings (
  id int primary key default 1 check (id = 1),
  open boolean not null default true,
  pro_discount_pct int not null default 15 check (pro_discount_pct between 0 and 90), -- desconto Pro padrão
  pickup_address text not null default 'Retirada na Associação Tesourinha',
  delivery_enabled boolean not null default false,
  delivery_fee numeric(10, 2) not null default 0 check (delivery_fee >= 0),
  online_payment boolean not null default false  -- liga quando o Mercado Pago estiver configurado
);
insert into public.store_settings (id) values (1) on conflict do nothing;
alter table public.store_settings enable row level security;
create policy "config visível" on public.store_settings for select using (true);
create policy "admin config" on public.store_settings for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- Produtos
-- ---------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null default 'Cabelo',
  price numeric(10, 2) not null check (price > 0),
  pro_price numeric(10, 2) check (pro_price > 0),   -- vazio = usa o desconto Pro padrão
  stock int not null default 0 check (stock >= 0),
  image_url text,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index products_active_idx on public.products (active, category, sort_order);
alter table public.products enable row level security;
create policy "produtos ativos" on public.products for select using (active or public.is_admin());
create policy "admin produtos" on public.products for all using (public.is_admin()) with check (public.is_admin());

-- Profissional aprovado e ativo compra com preço Pro.
create or replace function public.is_pro_buyer(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.professionals where profile_id = p_user and status = 'aprovado' and active)
$$;
grant execute on function public.is_pro_buyer(uuid) to authenticated;

-- Preço Pro efetivo de um produto.
create or replace function public.pro_price_of(p public.products)
returns numeric language sql stable set search_path = public as $$
  select coalesce(p.pro_price, round(p.price * (100 - (select pro_discount_pct from public.store_settings where id = 1)) / 100.0, 2))
$$;

-- ---------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number int generated always as identity,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'novo'
    check (status in ('novo', 'pago', 'separando', 'pronto', 'enviado', 'entregue', 'cancelado')),
  pro_price boolean not null default false,
  subtotal numeric(10, 2) not null,
  discount numeric(10, 2) not null default 0,
  delivery_fee numeric(10, 2) not null default 0,
  total numeric(10, 2) not null,
  coupon_id uuid references public.coupons (id) on delete set null,
  delivery text not null default 'retirada' check (delivery in ('retirada', 'entrega')),
  address text,
  payment_method text not null default 'retirada' check (payment_method in ('retirada', 'pix', 'cartao')),
  payment_status text not null default 'pendente' check (payment_status in ('pendente', 'aprovado', 'recusado', 'estornado')),
  payment_ref text,                    -- id do pagamento no Mercado Pago
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
alter table public.orders enable row level security;
create policy "meus pedidos" on public.orders for select using (user_id = auth.uid() or public.is_admin());
create policy "admin pedidos" on public.orders for all using (public.is_admin()) with check (public.is_admin());

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,
  unit_price numeric(10, 2) not null,
  qty int not null check (qty > 0)
);
create index order_items_order_idx on public.order_items (order_id);
alter table public.order_items enable row level security;
create policy "itens dos meus pedidos" on public.order_items for select using (
  public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
);
create policy "admin itens" on public.order_items for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------
-- Fechar pedido: preços, estoque e cupom são conferidos no banco.
-- p_items: [{"product_id": "...", "qty": 2}, ...]
-- ---------------------------------------------------------------
create or replace function public.place_order(p_items jsonb, p_coupon text default null, p_delivery text default 'retirada',
  p_address text default null, p_payment text default 'retirada', p_notes text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_cfg public.store_settings;
  v_pro boolean;
  v_item jsonb;
  v_prod public.products;
  v_qty int;
  v_unit numeric;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_fee numeric := 0;
  v_coupon public.coupons;
  v_order public.orders;
begin
  if v_uid is null then raise exception 'Entre na sua conta para comprar'; end if;
  select * into v_cfg from public.store_settings where id = 1;
  if not v_cfg.open then raise exception 'A loja está fechada no momento'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Seu carrinho está vazio'; end if;
  if p_delivery not in ('retirada', 'entrega') then raise exception 'Forma de entrega inválida'; end if;
  if p_delivery = 'entrega' then
    if not v_cfg.delivery_enabled then raise exception 'Entrega indisponível; escolha retirada'; end if;
    if coalesce(length(trim(p_address)), 0) < 8 then raise exception 'Informe o endereço de entrega'; end if;
    v_fee := v_cfg.delivery_fee;
  end if;
  if p_payment <> 'retirada' and not v_cfg.online_payment then raise exception 'Pagamento online ainda não disponível'; end if;
  v_pro := public.is_pro_buyer(v_uid);

  insert into public.orders (user_id, pro_price, subtotal, total, delivery, address, payment_method, notes)
  values (v_uid, v_pro, 0, 0, p_delivery, nullif(trim(p_address), ''), p_payment, nullif(trim(p_notes), ''))
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then raise exception 'Quantidade inválida'; end if;
    select * into v_prod from public.products where id = (v_item->>'product_id')::uuid and active for update;
    if not found then raise exception 'Um produto do carrinho não está mais disponível'; end if;
    if v_prod.stock < v_qty then raise exception 'Só temos % unidade(s) de %', v_prod.stock, v_prod.name; end if;
    v_unit := case when v_pro then public.pro_price_of(v_prod) else v_prod.price end;
    update public.products set stock = stock - v_qty where id = v_prod.id;
    insert into public.order_items (order_id, product_id, name, unit_price, qty) values (v_order.id, v_prod.id, v_prod.name, v_unit, v_qty);
    v_subtotal := v_subtotal + v_unit * v_qty;
  end loop;

  if coalesce(trim(p_coupon), '') <> '' then
    select * into v_coupon from public.coupons
     where code = upper(trim(p_coupon)) and user_id = v_uid and used_at is null and expires_at > now()
     for update;
    if not found then raise exception 'Cupom inválido, vencido ou já usado'; end if;
    v_discount := least(v_coupon.value, v_subtotal);
    update public.coupons set used_at = now() where id = v_coupon.id;
  end if;

  update public.orders
     set subtotal = v_subtotal, discount = v_discount, delivery_fee = v_fee,
         total = v_subtotal - v_discount + v_fee, coupon_id = v_coupon.id
   where id = v_order.id
  returning * into v_order;

  perform public.notify_user(v_uid, case when v_pro then 'pro' else 'cliente' end, 'pedido',
    format('Pedido #%s recebido', v_order.number),
    case when p_delivery = 'retirada' then format('Avisaremos quando estiver pronto para retirar. Total %s.', to_char(v_order.total, 'FML999G990D00'))
         else format('Avisaremos quando sair para entrega. Total %s.', to_char(v_order.total, 'FML999G990D00')) end,
    '/orders');
  return json_build_object('id', v_order.id, 'number', v_order.number, 'total', v_order.total);
end $$;
revoke execute on function public.place_order(jsonb, text, text, text, text, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, text, text) to authenticated;

-- Cliente cancela o próprio pedido enquanto ainda não foi separado.
create or replace function public.cancel_my_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'cancelado'
   where id = p_order and user_id = auth.uid() and status = 'novo' and payment_status = 'pendente';
  if not found then raise exception 'Este pedido não pode mais ser cancelado pelo app'; end if;
end $$;
revoke execute on function public.cancel_my_order(uuid) from public, anon;
grant execute on function public.cancel_my_order(uuid) to authenticated;

-- Mudança de status: devolve estoque/cupom ao cancelar e avisa o cliente.
create or replace function public.on_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
  v_body text;
begin
  new.updated_at := now();
  if new.status = old.status then return new; end if;
  if new.status = 'cancelado' then
    update public.products p set stock = p.stock + i.qty
      from public.order_items i where i.order_id = new.id and i.product_id = p.id;
    if new.coupon_id is not null then
      update public.coupons set used_at = null where id = new.coupon_id and expires_at > now();
    end if;
  end if;
  v_title := format('Pedido #%s', new.number);
  v_body := case new.status
    when 'pago' then 'Pagamento confirmado. Já estamos separando.'
    when 'separando' then 'Estamos separando seus produtos.'
    when 'pronto' then 'Seu pedido está pronto para retirada.'
    when 'enviado' then 'Seu pedido saiu para entrega.'
    when 'entregue' then 'Pedido entregue. Obrigado pela compra!'
    when 'cancelado' then 'Pedido cancelado. Se usou cupom, ele voltou para você.'
    else null end;
  if v_body is not null then
    perform public.notify_user(new.user_id, case when new.pro_price then 'pro' else 'cliente' end, 'pedido', v_title, v_body, '/orders');
  end if;
  return new;
end $$;
revoke execute on function public.on_order_status() from public, anon, authenticated;
create trigger orders_status before update on public.orders
  for each row execute function public.on_order_status();

-- Pontos por compra entregue (regra ajustável no painel: pontos por pedido).
insert into public.points_rules (key, label, points) values ('compra_loja', 'Compra na loja entregue', 30)
on conflict (key) do nothing;

create or replace function public.on_order_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'entregue' and old.status is distinct from 'entregue' then
    perform public.award_points(new.user_id, 'compra_loja', new.id, format('Compra #%s na loja', new.number));
  end if;
  return new;
end $$;
revoke execute on function public.on_order_points() from public, anon, authenticated;
create trigger orders_points after update of status on public.orders
  for each row execute function public.on_order_points();

grant select on public.store_settings, public.products to anon, authenticated;
grant select on public.orders, public.order_items to authenticated;
grant insert, update, delete on public.store_settings, public.products, public.orders, public.order_items to authenticated;
