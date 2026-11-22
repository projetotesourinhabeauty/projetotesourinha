-- Pagamento online pelo Mercado Pago (Checkout Pro: Pix, cartão e boleto na mesma tela).
-- O pedido é criado como antes (place_order) com p_payment = 'mercadopago'; a Edge Function
-- "mp-pagar" cria o link de pagamento e a "mp-webhook" confirma quando o Mercado Pago aprova.
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('retirada', 'pix', 'cartao', 'mercadopago'));

alter table public.orders
  add column if not exists payment_url text,          -- link do checkout (reaproveitado no botão "Pagar")
  add column if not exists paid_at timestamptz;

-- Chamada só pela Edge Function mp-webhook (service role), depois de consultar o pagamento
-- direto na API do Mercado Pago. Aprovado: marca pago e avisa; recusado/estornado: só registra.
create or replace function public.mp_payment_update(p_order uuid, p_status text, p_payment_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v public.orders;
begin
  select * into v from public.orders where id = p_order for update;
  if not found then return; end if;
  if p_status = 'approved' then
    update public.orders
       set payment_status = 'aprovado', payment_ref = p_payment_id, paid_at = coalesce(paid_at, now()),
           status = case when status = 'novo' then 'pago' else status end
     where id = p_order;
  elsif p_status in ('rejected', 'cancelled') and v.payment_status = 'pendente' then
    update public.orders set payment_status = 'recusado', payment_ref = p_payment_id where id = p_order;
  elsif p_status in ('refunded', 'charged_back') then
    update public.orders set payment_status = 'estornado', payment_ref = p_payment_id where id = p_order;
  end if;
end $$;
revoke execute on function public.mp_payment_update(uuid, text, text) from public, anon, authenticated;

-- Quem teve o cartão recusado pode tentar de novo: o pedido volta a "pendente".
create or replace function public.retry_my_payment(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set payment_status = 'pendente'
   where id = p_order and user_id = auth.uid() and payment_status = 'recusado' and status = 'novo';
end $$;
revoke execute on function public.retry_my_payment(uuid) from public, anon;
grant execute on function public.retry_my_payment(uuid) to authenticated;
