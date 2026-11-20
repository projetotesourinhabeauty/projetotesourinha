import { Linking } from 'react-native';

import { friendlyError, supabase } from '@/lib/supabase';

/**
 * Exclui a conta do usuário logado (função delete_my_account no banco, migração 0010).
 * Devolve a mensagem de erro, ou null quando deu certo. No modo demonstração não há o que apagar no servidor.
 */
export async function deleteMyAccount(): Promise<string | null> {
  if (!supabase) return null;
  const { error } = await supabase.rpc('delete_my_account');
  if (error) return friendlyError(error);
  await supabase.auth.signOut().catch(() => {});
  return null;
}

/** Site público (Política de Privacidade e Termos de Uso). */
export const SITE_URL = 'https://tesourinhabeauty1.vercel.app';
export const openPrivacy = () => Linking.openURL(`${SITE_URL}/privacidade/`).catch(() => {});
export const openTerms = () => Linking.openURL(`${SITE_URL}/termos/`).catch(() => {});
