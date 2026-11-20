import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { CheckInResultView } from '@/components/checkin-result';
import { Icon } from '@/components/icon';
import { BackButton, Screen, ScreenHeader, Sheet } from '@/components/screen';
import { Button, Field, Text } from '@/components/ui';
import { checkIn, parseCheckInCode, type CheckInResult } from '@/data/student';
import { haptic } from '@/lib/haptics';
import { colors, radius, spacing } from '@/theme';

/** Leitor do QR Code da chamada. Na web, dá para digitar o código mostrado abaixo do QR. */
export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const handled = useRef(false);

  const submit = async (raw: string) => {
    if (handled.current) return;
    const code = parseCheckInCode(raw);
    if (!code) return;
    handled.current = true;
    setBusy(true);
    const r = await checkIn(code);
    setBusy(false);
    if (r.ok) haptic.success();
    else haptic.warning();
    setResult(r);
  };

  const retry = () => {
    handled.current = false;
    setResult(null);
  };

  if (result) {
    return (
      <Screen>
        <ScreenHeader title="Presença na aula" />
        <Sheet>
          <CheckInResultView result={result} onRetry={retry} />
        </Sheet>
      </Screen>
    );
  }

  const canUseCamera = Platform.OS !== 'web' && permission?.granted;

  if (!canUseCamera) {
    return (
      <Screen>
        <ScreenHeader title="Registrar presença" subtitle="QR Code da aula" />
        <Sheet contentStyle={{ gap: spacing.lg }}>
          {Platform.OS !== 'web' ? (
            <>
              <Text variant="callout" color={colors.textSecondary}>Para ler o QR Code da chamada, o app precisa usar a câmera.</Text>
              <Button title="Permitir câmera" icon="camera" onPress={() => void requestPermission()} />
            </>
          ) : (
            <Text variant="callout" color={colors.textSecondary}>
              Aponte a câmera do celular para o QR Code da aula: o link abre o app e registra sua presença. Ou digite o código que aparece abaixo do QR.
            </Text>
          )}
          <Field label="Código da aula" icon="keypad-outline" value={manual} onChangeText={setManual} autoCapitalize="none" autoCorrect={false} placeholder="Ex.: 3fa9c2d1e8b7a6f5c4" />
          <Button title="Registrar presença" icon="checkmark" loading={busy} disabled={!parseCheckInCode(manual)} onPress={() => void submit(manual)} />
        </Sheet>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.black }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : ({ data }) => void submit(data)}
      />
      <View style={{ position: 'absolute', top: 56, left: spacing.xl }}>
        <BackButton tone="glass" />
      </View>
      <View style={styles.center} pointerEvents="none">
        <View style={styles.frame} />
        <View style={styles.hint}>
          {busy ? <ActivityIndicator color={colors.white} /> : <Icon name="qr-code" size={18} color={colors.white} />}
          <Text variant="subhead" color={colors.white} weight="600">{busy ? 'Registrando…' : 'Aponte para o QR Code da aula'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.xxl },
  frame: { width: 240, height: 240, borderRadius: radius.xxl, borderWidth: 3, borderColor: colors.brand },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)' },
});
