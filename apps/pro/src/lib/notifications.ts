import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Avisos do app (tabela notifications) e push no celular (Expo Push).
 * Usado pelos dois apps: `app` é 'cliente' ou 'pro'.
 * Os avisos são criados pelo banco (gatilhos de agendamento, lembretes, aprovação).
 */
export type AppKind = 'cliente' | 'pro';

export interface Notice {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

type Row = Record<string, any>;
const toNotice = (r: Row): Notice => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  link: r.link ?? null,
  read: !!r.read_at,
  createdAt: r.created_at,
});

export async function fetchNotices(app: AppKind): Promise<Notice[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, title, body, link, read_at, created_at')
    .eq('app', app)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toNotice);
}

export async function unreadCount(app: AppKind): Promise<number> {
  if (!supabase) return 0;
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('app', app)
    .is('read_at', null);
  return count ?? 0;
}

export async function markAllRead(app: AppKind): Promise<void> {
  if (!supabase) return;
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('app', app).is('read_at', null);
}

/** Ícone por tipo de aviso. */
export const noticeIcon = (kind: string) =>
  (({
    novo_agendamento: 'calendar',
    confirmado: 'checkmark-circle',
    cancelado: 'close-circle',
    concluido: 'star',
    lembrete: 'alarm',
    aprovado: 'ribbon',
    pontos: 'sparkles',
    pedido: 'bag-handle',
  }) as Record<string, string>)[kind] ?? 'notifications';

/* ------------------------------------------------------------------ */
/* Push no celular                                                     */
/* ------------------------------------------------------------------ */

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Pede permissão e registra o token de push do aparelho para o usuário logado.
 * Silencioso quando não dá (web, simulador, sem permissão ou app sem projeto EAS).
 */
export async function registerForPush(app: AppKind, userId: string): Promise<void> {
  try {
    if (!supabase || Platform.OS === 'web' || !Device.isDevice) return;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Avisos',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#FF6A13',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase
      .from('push_tokens')
      .upsert({ token, user_id: userId, app, platform: Platform.OS, updated_at: new Date().toISOString() });
  } catch {
    // Push é um extra: nunca deve travar o app.
  }
}

/** Ao tocar num push, abre a tela do aviso. Devolve a função para desligar o listener. */
export function listenPushTaps(): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    const link = res.notification.request.content.data?.link;
    if (typeof link === 'string' && link.startsWith('/')) router.push(link as never);
  });
  return () => sub.remove();
}
