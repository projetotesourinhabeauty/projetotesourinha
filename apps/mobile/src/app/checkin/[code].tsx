import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { CheckInResultView } from '@/components/checkin-result';
import { Screen, ScreenHeader, Sheet } from '@/components/screen';
import { checkIn, parseCheckInCode, type CheckInResult } from '@/data/student';
import { useApp } from '@/store/app-store';
import { colors, spacing } from '@/theme';

/** Aberto pelo QR Code da aula (câmera do celular → link .../app/checkin/<código>). */
export default function CheckInLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user } = useApp();
  const [result, setResult] = useState<CheckInResult | null>(null);

  useEffect(() => {
    if (!user) return;
    const c = parseCheckInCode(code ?? '');
    if (!c) setResult({ ok: false, error: 'QR Code inválido.' });
    else void checkIn(c).then(setResult);
  }, [code, user]);

  if (!user) return <Redirect href={{ pathname: '/auth', params: { mode: 'login' } }} />;
  return (
    <Screen>
      <ScreenHeader title="Presença na aula" />
      <Sheet contentStyle={{ paddingBottom: spacing.huge }}>
        {result ? <CheckInResultView result={result} /> : <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />}
      </Sheet>
    </Screen>
  );
}
