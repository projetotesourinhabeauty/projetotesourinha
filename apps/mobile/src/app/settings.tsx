import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch } from 'react-native';

import { Screen, ScreenHeader, Sheet } from '@/components/screen';
import { ListGroup, ListRow } from '@/components/ui';
import { deleteMyAccount, openPrivacy, openTerms } from '@/lib/account';
import { confirm, notify } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/store/app-store';
import { colors, spacing } from '@/theme';

type Prefs = { notify_reminders: boolean; notify_courses: boolean; notify_jobs: boolean };

export default function Settings() {
  const { user, signOut } = useApp();
  const [prefs, setPrefs] = useState<Prefs>({ notify_reminders: true, notify_courses: true, notify_jobs: false });

  // Com servidor, as preferências ficam salvas no perfil (o lembrete de agendamento respeita a escolha).
  useEffect(() => {
    if (!supabase) return;
    void (async () => {
      const { data: auth } = await supabase!.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase!.from('profiles').select('notify_reminders, notify_courses, notify_jobs').eq('id', auth.user.id).maybeSingle();
      if (data) setPrefs(data as Prefs);
    })();
  }, []);

  const toggle = (key: keyof Prefs) => (v: boolean) => {
    setPrefs((p) => ({ ...p, [key]: v }));
    if (!supabase) return;
    void (async () => {
      const { data: auth } = await supabase!.auth.getUser();
      if (!auth.user) return;
      const { error } = await supabase!.from('profiles').update({ [key]: v }).eq('id', auth.user.id);
      if (error) setPrefs((p) => ({ ...p, [key]: !v }));
    })();
  };

  const removeAccount = () =>
    confirm(
      'Excluir sua conta?',
      'Seus dados, agendamentos, favoritos, inscrições e currículo serão apagados para sempre. Isso não pode ser desfeito.',
      'Excluir conta',
      () => {
        void (async () => {
          const err = await deleteMyAccount();
          if (err) return notify('Não foi possível excluir', err);
          signOut();
          notify('Conta excluída', 'Sua conta e seus dados foram apagados.');
          router.replace('/welcome');
        })();
      },
    );

  const sw = (key: keyof Prefs) => (
    <Switch value={prefs[key]} onValueChange={toggle(key)} trackColor={{ true: colors.brand, false: colors.border }} thumbColor={colors.white} />
  );
  return (
    <Screen>
      <ScreenHeader title="Configurações" />
      <Sheet contentStyle={{ gap: spacing.xxl }}>
        <ListGroup title="Notificações" footer="Você pode alterar isso a qualquer momento.">
          <ListRow icon="alarm-outline" title="Lembretes de agendamento" right={sw('notify_reminders')} />
          <ListRow icon="school-outline" title="Novas turmas de cursos" right={sw('notify_courses')} />
          <ListRow icon="briefcase-outline" title="Vagas compatíveis comigo" right={sw('notify_jobs')} />
        </ListGroup>
        <ListGroup title="Privacidade">
          <ListRow icon="shield-checkmark-outline" title="Política de privacidade" onPress={openPrivacy} />
          <ListRow icon="document-text-outline" title="Termos de uso" onPress={openTerms} />
          {user && <ListRow icon="trash-outline" title="Excluir minha conta" destructive onPress={removeAccount} />}
        </ListGroup>
      </Sheet>
    </Screen>
  );
}
