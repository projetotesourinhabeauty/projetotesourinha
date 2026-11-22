// Edge Function "mp-webhook": recebe os avisos do Mercado Pago e confirma o pagamento do pedido.
// Não confia no conteúdo do aviso: consulta o pagamento direto na API do Mercado Pago (com o
// MP_ACCESS_TOKEN) e só então atualiza o pedido pela função mp_payment_update (migração 0016).
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  const token = Deno.env.get('MP_ACCESS_TOKEN');
  if (!token) return new Response('not configured', { status: 503 });

  const url = new URL(req.url);
  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    /* aviso só com parâmetros na URL */
  }
  const topic = body.type ?? body.topic ?? url.searchParams.get('type') ?? url.searchParams.get('topic');
  const id = String(body.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '');
  if (topic !== 'payment' || !/^\d+$/.test(id)) return new Response('ignored', { status: 200 });

  const res = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return new Response('payment lookup failed', { status: 502 }); // o Mercado Pago tenta de novo
  const p = await res.json();
  const order = String(p.external_reference ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(order)) return new Response('no order', { status: 200 });

  const { error } = await sb.rpc('mp_payment_update', { p_order: order, p_status: p.status, p_payment_id: String(p.id) });
  if (error) {
    console.error('mp_payment_update', error.message);
    return new Response('error', { status: 500 });
  }
  return new Response('ok', { status: 200 });
});
