// Edge Function "mp-pagar": cria o link de pagamento do Mercado Pago (Checkout Pro) para um pedido.
// Chamada pelo app com o login do cliente: { order_id }. Responde { url } para abrir o checkout,
// onde a pessoa escolhe Pix ou cartão. A confirmação chega pela função "mp-webhook".
//
// Segredo necessário (Supabase > Edge Functions > Secrets): MP_ACCESS_TOKEN (Access Token de produção
// do Mercado Pago). Opcional: SITE_URL (padrão https://tesourinhabeauty1.vercel.app).
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SITE = Deno.env.get('SITE_URL') ?? 'https://tesourinhabeauty1.vercel.app';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Método não permitido' }, 405);

  const token = Deno.env.get('MP_ACCESS_TOKEN');
  if (!token) return reply({ error: 'O pagamento online ainda não foi configurado. Escolha pagar na retirada.' }, 503);

  // Cliente com o login de quem chamou: só enxerga os próprios pedidos (RLS).
  const auth = req.headers.get('Authorization') ?? '';
  const user = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { data: me } = await user.auth.getUser();
  if (!me.user) return reply({ error: 'Entre na sua conta' }, 401);

  let orderId = '';
  let base = '/app';
  try {
    const body = await req.json();
    orderId = String(body?.order_id ?? '');
    base = body?.app === 'pro' ? '/profissional' : '/app';
  } catch {
    /* corpo inválido */
  }
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return reply({ error: 'Pedido inválido' }, 400);

  const { data: o } = await user
    .from('orders')
    .select('id, number, total, status, payment_method, payment_status, payment_url, user_id')
    .eq('id', orderId)
    .maybeSingle();
  if (!o || o.user_id !== me.user.id) return reply({ error: 'Pedido não encontrado' }, 404);
  if (o.payment_method !== 'mercadopago') return reply({ error: 'Este pedido é pago na retirada' }, 400);
  if (o.payment_status === 'aprovado') return reply({ error: 'Este pedido já está pago' }, 400);
  if (o.status !== 'novo' || o.payment_status !== 'pendente') return reply({ error: 'Este pedido não pode mais ser pago pelo app' }, 400);
  if (o.payment_url) return reply({ url: o.payment_url });

  const total = Number(o.total);
  if (!(total > 0)) return reply({ error: 'Pedido sem valor a pagar' }, 400);

  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': o.id },
    body: JSON.stringify({
      items: [{ id: o.id, title: `Pedido #${o.number} · Loja Tesourinha`, quantity: 1, unit_price: total, currency_id: 'BRL' }],
      payer: { email: me.user.email },
      external_reference: o.id,
      notification_url: `${URL_}/functions/v1/mp-webhook`,
      back_urls: { success: `${SITE}${base}/orders`, pending: `${SITE}${base}/orders`, failure: `${SITE}${base}/orders` },
      auto_return: 'approved',
      statement_descriptor: 'TESOURINHA',
      payment_methods: { installments: 6 },
    }),
  });
  const pref = await res.json().catch(() => null);
  if (!res.ok || !pref?.init_point) {
    console.error('mercado pago', res.status, JSON.stringify(pref));
    return reply({ error: 'Não foi possível abrir o pagamento agora. Tente de novo em instantes.' }, 502);
  }
  await admin.from('orders').update({ payment_url: pref.init_point }).eq('id', o.id);
  return reply({ url: pref.init_point });
});
