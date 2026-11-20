// Edge Function "enviar-push": envia um aviso (tabela notifications) como push
// para os celulares do usuário, via Expo Push Service.
// É chamada pelo gatilho notifications_push (migração 0009) com { id }.
// Só envia avisos ainda não enviados (pushed_at nulo), então chamadas repetidas não duplicam.
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  let id: string | undefined;
  try {
    id = (await req.json())?.id;
  } catch {
    /* corpo inválido */
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return new Response('id inválido', { status: 400 });

  // Marca como enviado antes de enviar (evita duplicidade em chamadas concorrentes).
  const { data: n } = await sb
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', id)
    .is('pushed_at', null)
    .select('id, user_id, app, title, body, link')
    .maybeSingle();
  if (!n) return Response.json({ sent: 0 });

  const { data: tokens } = await sb.from('push_tokens').select('token').eq('user_id', n.user_id).eq('app', n.app);
  if (!tokens?.length) return Response.json({ sent: 0 });

  const messages = tokens.map((t) => ({
    to: t.token,
    title: n.title,
    body: n.body,
    sound: 'default',
    data: { link: n.link, id: n.id },
  }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const out = await res.json().catch(() => ({}));

  // Remove tokens de aparelhos que desinstalaram o app.
  const tickets: Array<{ status: string; details?: { error?: string } }> = out?.data ?? [];
  const dead = tickets
    .map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? tokens[i]!.token : null))
    .filter(Boolean) as string[];
  if (dead.length) await sb.from('push_tokens').delete().in('token', dead);

  return Response.json({ sent: messages.length - dead.length });
});
