import { Icon } from '@/components/icon';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, View } from 'react-native';

import { Screen, ScreenHeader, Sheet } from '@/components/screen';
import { EmptyState, PressableScale, Text } from '@/components/ui';
import { fetchNotices, markAllRead, noticeIcon, unreadCount, type AppKind, type Notice } from '@/lib/notifications';
import { isRemote } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme';

/** Sino do cabeçalho, com bolinha quando há avisos não lidos. */
export function NoticeBell({ app }: { app: AppKind }) {
  const [count, setCount] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (isRemote) void unreadCount(app).then((n) => alive && setCount(n)).catch(() => {});
      return () => {
        alive = false;
      };
    }, [app]),
  );
  return (
    <PressableScale
      onPress={() => router.push('/notifications')}
      accessibilityLabel={count ? `Avisos, ${count} não lidos` : 'Avisos'}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="notifications-outline" size={22} color={colors.white} />
      {count > 0 && (
        <View style={{ position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.black, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.brand }}>
          <Text variant="caption" weight="700" color={colors.white} style={{ fontSize: 10, lineHeight: 12 }}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  if (mins < 24 * 60) return `há ${Math.floor(mins / 60)} h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

/** Tela "Avisos": lista os avisos do usuário e marca todos como lidos ao abrir. */
export function NoticesScreen({ app }: { app: AppKind }) {
  const [items, setItems] = useState<Notice[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setItems(await fetchNotices(app));
      await markAllRead(app);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems((s) => s ?? []);
    }
  }, [app]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen>
      <ScreenHeader title="Avisos" subtitle="Agendamentos, lembretes e novidades" />
      <Sheet
        contentStyle={{ gap: spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {!isRemote ? (
          <EmptyState icon="notifications-outline" title="Avisos no app" text="Na versão conectada ao servidor, seus avisos de agendamento e lembretes aparecem aqui." />
        ) : items === null ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />
        ) : error ? (
          <EmptyState icon="cloud-offline-outline" title="Não foi possível carregar" text={error} action="Tentar de novo" onAction={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState icon="notifications-outline" title="Nenhum aviso por enquanto" text="Quando houver novidades sobre seus agendamentos, elas aparecem aqui." />
        ) : (
          items.map((n) => (
            <PressableScale
              key={n.id}
              disabled={!n.link}
              onPress={() => n.link && router.push(n.link as never)}
              style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: n.read ? colors.surface : colors.brandSoft }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: n.kind === 'cancelado' ? colors.dangerSoft : colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={noticeIcon(n.kind) as never} size={20} color={n.kind === 'cancelado' ? colors.danger : colors.brand} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }}>
                  <Text variant="headline" style={{ flex: 1 }} numberOfLines={1}>{n.title}</Text>
                  <Text variant="caption" color={colors.textTertiary}>{when(n.createdAt)}</Text>
                </View>
                <Text variant="subhead" color={colors.textSecondary}>{n.body}</Text>
              </View>
            </PressableScale>
          ))
        )}
      </Sheet>
    </Screen>
  );
}
