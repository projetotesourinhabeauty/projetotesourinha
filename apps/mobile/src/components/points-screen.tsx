import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, RefreshControl, Share, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen, ScreenHeader, Sheet } from '@/components/screen';
import { Badge, Button, Card, EmptyState, ListGroup, ListRow, PressableScale, SectionHeader, Text } from '@/components/ui';
import { LEVELS, LEVEL_COLORS, POINTS_PER_REAL, REDEEM_OPTIONS, loadPoints, money, redeem, type PointsData } from '@/data/points';
import { SITE_URL } from '@/lib/account';
import { confirm, notify } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import type { AppKind } from '@/lib/notifications';
import { colors, radius, spacing } from '@/theme';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');

/** Tela "Tesourinhas": nível, saldo, resgate de cupons, indicação e extrato. */
export function PointsScreen({ app }: { app: AppKind }) {
  const [data, setData] = useState<PointsData | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(0);

  const load = useCallback(async () => {
    try {
      setError('');
      setData(await loadPoints());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const doRedeem = (pts: number) =>
    confirm(`Trocar ${pts} pontos?`, `Você recebe um cupom de ${money(pts / POINTS_PER_REAL)} para usar na Loja Tesourinha, válido por 90 dias.`, 'Trocar', async () => {
      setBusy(pts);
      try {
        const c = await redeem(pts);
        haptic.success();
        notify('Cupom gerado!', `Código ${c.code} · ${money(c.value)}. Ele fica guardado em "Meus cupons".`);
        await load();
      } catch (e) {
        haptic.warning();
        notify('Não foi possível trocar', e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(0);
      }
    }, false);

  const shareCode = (code: string) => {
    const link = `${SITE_URL}/app/auth?ref=${code}`;
    const message = `Use meu código ${code} ao criar sua conta na Tesourinha Beauty: ${link}`;
    if (Platform.OS === 'web') {
      const nav = (globalThis as any).navigator;
      if (nav?.share) void nav.share({ text: message }).catch(() => {});
      else if (nav?.clipboard) void nav.clipboard.writeText(message).then(() => notify('Copiado!', 'Cole a mensagem para quem você quer convidar.'));
      return;
    }
    void Share.share({ message });
  };

  const s = data?.summary;
  const levelIdx = s ? LEVELS.findIndex((l) => l.name === s.level) : 0;
  const from = LEVELS[levelIdx]?.from ?? 0;
  const progress = s?.nextLevelAt ? Math.min(1, (s.yearPoints - from) / (s.nextLevelAt - from)) : 1;
  const rules = (data?.rules ?? []).filter((r) => (app === 'pro' ? r.key !== 'atendimento_cliente' : r.key !== 'atendimento_pro'));
  const activeCoupons = (data?.coupons ?? []).filter((c) => !c.usedAt && new Date(c.expiresAt).getTime() > Date.now());

  return (
    <Screen>
      <ScreenHeader title="Tesourinhas" subtitle="Seus pontos viram desconto" />
      <Sheet
        contentStyle={{ gap: spacing.xxl, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {!data && !error ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />
        ) : error || !s ? (
          <EmptyState icon="cloud-offline-outline" title="Não foi possível carregar" text={error} action="Tentar de novo" onAction={() => void load()} />
        ) : (
          <>
            {/* Nível e saldo */}
            <View style={{ backgroundColor: colors.black, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: LEVEL_COLORS[s.level], alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="ribbon" size={20} color={colors.white} />
                  </View>
                  <View>
                    <Text variant="caption" color="rgba(255,255,255,0.6)">NÍVEL</Text>
                    <Text variant="headline" color={colors.white}>{s.level}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="caption" color="rgba(255,255,255,0.6)">SALDO</Text>
                  <Text variant="title1" color={colors.white}>{s.balance.toLocaleString('pt-BR')}</Text>
                </View>
              </View>
              <View style={{ gap: 6 }}>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
                  <View style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 4, backgroundColor: colors.brand }} />
                </View>
                <Text variant="footnote" color="rgba(255,255,255,0.7)">
                  {s.nextLevelAt
                    ? `Faltam ${(s.nextLevelAt - s.yearPoints).toLocaleString('pt-BR')} pontos para ${LEVELS[levelIdx + 1]?.name} (conta o que você ganhou nos últimos 12 meses).`
                    : 'Você está no nível máximo. Continue usando para se manter no Ouro.'}
                </Text>
              </View>
              <Text variant="footnote" color="rgba(255,255,255,0.7)">
                Vale {money(s.balance / POINTS_PER_REAL)} em cupons{s.expiring30d > 0 ? ` · ${s.expiring30d} pontos vencem em 30 dias` : ''}
              </Text>
            </View>

            {/* Resgate */}
            <View>
              <SectionHeader title="Trocar por cupom" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                {REDEEM_OPTIONS.map((pts) => {
                  const ok = s.balance >= pts;
                  return (
                    <PressableScale
                      key={pts}
                      disabled={!ok || !!busy}
                      onPress={() => doRedeem(pts)}
                      accessibilityLabel={`Trocar ${pts} pontos por ${money(pts / POINTS_PER_REAL)}`}
                      style={{ flexBasis: '47%', flexGrow: 1, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: ok ? colors.surface : colors.surfaceMuted, borderWidth: 1, borderColor: ok ? colors.brandSoftBorder : colors.border, gap: 4, opacity: ok ? 1 : 0.6 }}>
                      {busy === pts ? <ActivityIndicator color={colors.brand} /> : <Text variant="title2" color={ok ? colors.brand : colors.textTertiary}>{money(pts / POINTS_PER_REAL)}</Text>}
                      <Text variant="footnote" color={colors.textSecondary}>{pts} pontos</Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>

            {/* Cupons */}
            {activeCoupons.length > 0 && (
              <ListGroup title="Meus cupons" footer="Use o código na Loja Tesourinha antes de vencer.">
                {activeCoupons.map((c) => (
                  <ListRow key={c.id} icon="pricetag" title={`${money(c.value)} · ${c.code}`} subtitle={`Vale até ${fmtDate(c.expiresAt)}`} />
                ))}
              </ListGroup>
            )}

            {/* Indicação */}
            {data!.referralCode && (
              <Card style={{ gap: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <Icon name="gift" size={26} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text variant="headline">Convide e ganhe</Text>
                    <Text variant="footnote" color={colors.textSecondary}>
                      {`Quando quem você convidou fizer o 1º atendimento, você ganha ${data!.rules.find((r) => r.key === 'indicacao')?.points ?? 100} pontos.`}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandSoft }}>
                  <Text variant="caption" color={colors.textSecondary}>SEU CÓDIGO</Text>
                  <Text variant="title3" weight="700" color={colors.brandDark} style={{ letterSpacing: 2 }}>{data!.referralCode}</Text>
                </View>
                <Button title="Compartilhar convite" icon="paper-plane" variant="dark" onPress={() => shareCode(data!.referralCode!)} />
              </Card>
            )}

            {/* Como ganhar */}
            <ListGroup title="Como ganhar" footer="Os pontos valem por 12 meses. A troca usa primeiro os mais antigos.">
              {rules.map((r) => (
                <ListRow key={r.key} icon="sparkles" title={r.label} right={<Badge label={`+${r.points}`} />} />
              ))}
            </ListGroup>

            {/* Níveis */}
            <ListGroup title="Níveis">
              {LEVELS.map((l) => (
                <ListRow
                  key={l.name}
                  left={<View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: LEVEL_COLORS[l.name], alignItems: 'center', justifyContent: 'center' }}><Icon name="ribbon" size={16} color={colors.white} /></View>}
                  title={l.name}
                  subtitle={`${l.from ? `A partir de ${l.from} pontos no ano · ` : ''}${l.perks}`}
                  right={l.name === s.level ? <Badge label="VOCÊ" tone="dark" /> : undefined}
                />
              ))}
            </ListGroup>

            {/* Extrato */}
            <View>
              <SectionHeader title="Extrato" />
              {data!.ledger.length === 0 ? (
                <Card>
                  <Text variant="subhead" color={colors.textSecondary}>Seus pontos aparecem aqui assim que você concluir um atendimento, avaliar ou se formar em um curso.</Text>
                </Card>
              ) : (
                <ListGroup>
                  {data!.ledger.map((l) => (
                    <ListRow
                      key={l.id}
                      icon={l.delta > 0 ? 'add' : 'pricetag'}
                      title={l.description}
                      subtitle={fmtDate(l.createdAt)}
                      right={<Text variant="headline" color={l.delta > 0 ? colors.success : colors.textSecondary}>{l.delta > 0 ? `+${l.delta}` : l.delta}</Text>}
                    />
                  ))}
                </ListGroup>
              )}
            </View>
          </>
        )}
      </Sheet>
    </Screen>
  );
}
