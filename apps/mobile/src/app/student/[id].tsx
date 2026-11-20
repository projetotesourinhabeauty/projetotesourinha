import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen, ScreenHeader, Sheet } from '@/components/screen';
import { Badge, Button, Card, EmptyState, ListGroup, ListRow, SectionHeader, Text } from '@/components/ui';
import { findCourse } from '@/data/catalog';
import { MIN_ATTENDANCE, loadStudentCourse, type ClassItem, type StudentCourse } from '@/data/student';
import { SITE_URL } from '@/lib/account';
import { notify } from '@/lib/confirm';
import { colors, radius, spacing } from '@/theme';

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '');
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Área do Aluno: turma, presença, progresso, materiais e certificado de um curso. */
export default function StudentCourseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const course = findCourse(id);
  const [data, setData] = useState<StudentCourse | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setData(await loadStudentCourse(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!course) return null;
  const now = Date.now();
  const classes = data?.classes ?? [];
  const past = classes.filter((c) => new Date(c.endsAt).getTime() < now);
  const attended = classes.filter((c) => c.present).length;
  const pct = classes.length ? attended / classes.length : 0;
  const pastPct = past.length ? past.filter((c) => c.present).length / past.length : 1;
  const next = classes.find((c) => new Date(c.endsAt).getTime() >= now);
  const live = next && new Date(next.startsAt).getTime() - 30 * 60000 <= now;
  const done = data?.status === 'concluído';

  const openCertificate = () => {
    if (!data?.certificateCode) return;
    Linking.openURL(`${SITE_URL}/certificado/?c=${data.certificateCode}`).catch(() => {});
  };

  return (
    <Screen>
      <ScreenHeader title={course.title} subtitle="Minha turma">
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {done ? <Badge label="CONCLUÍDO" tone="success" icon="ribbon" /> : <Badge label="CURSANDO" />}
          <Badge label={`${course.durationHours}H · ${course.modality.toUpperCase()}`} tone="dark" />
        </View>
      </ScreenHeader>
      <Sheet
        contentStyle={{ gap: spacing.xxl, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {!data && !error ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />
        ) : error ? (
          <EmptyState icon="cloud-offline-outline" title="Não foi possível carregar" text={error} action="Tentar de novo" onAction={() => void load()} />
        ) : (
          <>
            {/* Certificado */}
            {done && (
              <Pressable onPress={openCertificate} accessibilityRole="button">
                <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.black }}>
                  <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="trophy" size={24} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="headline" color={colors.white}>Seu certificado está pronto</Text>
                    <Text variant="footnote" color="rgba(255,255,255,0.7)">Código {data?.certificateCode} · toque para ver e baixar</Text>
                  </View>
                  <Icon name="chevron-forward" size={14} weight="semibold" color="rgba(255,255,255,0.6)" />
                </View>
              </Pressable>
            )}

            {/* Progresso */}
            <Card style={{ gap: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <View>
                  <Text variant="footnote" color={colors.textSecondary}>Frequência</Text>
                  <Text variant="title1">{Math.round(pct * 100)}%</Text>
                </View>
                <Text variant="subhead" color={colors.textSecondary}>{attended} de {classes.length} aulas</Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
                <View style={{ width: `${pct * 100}%`, height: '100%', borderRadius: 4, backgroundColor: colors.brand }} />
              </View>
              {!done && (
                <Text variant="footnote" color={pastPct < MIN_ATTENDANCE ? colors.danger : colors.textSecondary}>
                  {pastPct < MIN_ATTENDANCE
                    ? `Atenção: o certificado exige ${Math.round(MIN_ATTENDANCE * 100)}% de presença. Fale com a coordenação se precisar repor aulas.`
                    : `O certificado sai ao final, com pelo menos ${Math.round(MIN_ATTENDANCE * 100)}% de presença.`}
                </Text>
              )}
            </Card>

            {/* Próxima aula + presença */}
            {next && !done && (
              <View>
                <SectionHeader title={live ? 'Aula agora' : 'Próxima aula'} />
                <Card style={{ gap: spacing.lg }}>
                  <ClassLine c={next} highlight />
                  {next.present ? (
                    <Badge label="PRESENÇA REGISTRADA" tone="success" icon="checkmark-circle" />
                  ) : (
                    <Button
                      title={live ? 'Registrar presença' : 'A chamada abre 30 min antes'}
                      icon="qr-code"
                      disabled={!live}
                      onPress={() => router.push('/scan')}
                    />
                  )}
                </Card>
              </View>
            )}

            {/* Cronograma */}
            <View>
              <SectionHeader title="Cronograma" />
              {classes.length === 0 ? (
                <Card>
                  <Text variant="subhead" color={colors.textSecondary}>As datas das aulas serão publicadas pela coordenação em breve.</Text>
                </Card>
              ) : (
                <Card style={{ gap: spacing.lg }}>
                  {classes.map((c) => <ClassLine key={c.id} c={c} />)}
                </Card>
              )}
            </View>

            {/* Materiais */}
            <View>
              <SectionHeader title="Materiais" />
              {data!.materials.length === 0 ? (
                <Card>
                  <Text variant="subhead" color={colors.textSecondary}>Apostilas e vídeos do curso aparecem aqui quando forem liberados.</Text>
                </Card>
              ) : (
                <ListGroup>
                  {data!.materials.map((m) => (
                    <ListRow
                      key={m.id}
                      icon={m.kind === 'pdf' ? 'document-text-outline' : m.kind === 'video' ? 'play-circle' : 'link'}
                      title={m.title}
                      subtitle={m.kind === 'pdf' ? 'Apostila (PDF)' : m.kind === 'video' ? 'Vídeo' : 'Link'}
                      onPress={() => Linking.openURL(m.url).catch(() => notify('Não foi possível abrir', m.url))}
                    />
                  ))}
                </ListGroup>
              )}
            </View>

            {done && (
              <Card style={{ gap: spacing.md }}>
                <Text variant="headline">Agora é hora de atender</Text>
                <Text variant="subhead" color={colors.textSecondary}>
                  Cadastre-se no app Tesourinha Pro: seu perfil já entra com o selo "Formado pela Tesourinha" e aparece para os clientes.
                </Text>
                <Button title="Quero atender pelo app" variant="dark" icon="cut-outline" onPress={() => Linking.openURL(`${SITE_URL}/profissional/`).catch(() => {})} />
              </Card>
            )}
          </>
        )}
      </Sheet>
    </Screen>
  );
}

function ClassLine({ c, highlight }: { c: ClassItem; highlight?: boolean }) {
  const past = new Date(c.endsAt).getTime() < Date.now();
  const state: { icon: 'checkmark-circle' | 'close-circle-outline' | 'time-outline'; color: string } = c.present
    ? { icon: 'checkmark-circle', color: colors.success }
    : past
      ? { icon: 'close-circle-outline', color: colors.textTertiary }
      : { icon: 'time-outline', color: colors.brand };
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <Icon name={state.icon} size={22} color={state.color} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant={highlight ? 'headline' : 'callout'} weight={highlight ? undefined : '600'}>{c.title}</Text>
        <Text variant="footnote" color={colors.textSecondary}>
          {fmtDay(c.startsAt)} · {fmtTime(c.startsAt)}–{fmtTime(c.endsAt)}
          {c.room ? ` · ${c.room}` : ''}
          {c.teacher ? ` · ${c.teacher}` : ''}
        </Text>
      </View>
    </View>
  );
}
