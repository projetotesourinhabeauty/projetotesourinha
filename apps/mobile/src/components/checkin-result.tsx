import { router } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { Button, Text } from '@/components/ui';
import type { CheckInResult } from '@/data/student';
import { colors, spacing } from '@/theme';

/** Resultado da presença (sucesso ou motivo da falha), usado pelo leitor e pelo link do QR. */
export function CheckInResultView({ result, onRetry }: { result: CheckInResult; onRetry?: () => void }) {
  return (
    <View style={{ alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xxl, paddingTop: spacing.huge }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: result.ok ? colors.successSoft : colors.dangerSoft }}>
        <Icon name={result.ok ? 'checkmark-circle' : 'alert-circle'} size={56} color={result.ok ? colors.success : colors.danger} />
      </View>
      <Text variant="title2" align="center">{result.ok ? 'Presença registrada!' : 'Não deu certo'}</Text>
      <Text variant="callout" color={colors.textSecondary} align="center">
        {result.ok ? `${result.className}\n${result.course}` : result.error}
      </Text>
      <View style={{ alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg }}>
        {result.ok ? (
          <Button title="Ver minha turma" onPress={() => router.replace({ pathname: '/student/[id]', params: { id: result.courseId } })} />
        ) : (
          onRetry && <Button title="Tentar de novo" icon="qr-code" onPress={onRetry} />
        )}
        <Button title="Voltar ao início" variant="ghost" onPress={() => router.replace('/(tabs)')} />
      </View>
    </View>
  );
}
