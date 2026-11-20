import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Tipografia no padrão Apple:
 * - iPhone: SF Pro (fonte do sistema).
 * - Web: SF Pro em aparelhos Apple; Inter (a mais próxima do SF) nos demais.
 * - Android: Inter.
 * Devolve true quando as fontes estão prontas.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts(
    Platform.OS === 'android'
      ? { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold }
      : {},
  );
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (document.getElementById('font-inter')) return;
    const pre = document.createElement('link');
    pre.rel = 'preconnect';
    pre.href = 'https://fonts.gstatic.com';
    pre.crossOrigin = 'anonymous';
    const link = document.createElement('link');
    link.id = 'font-inter';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&display=swap';
    document.head.append(pre, link);
    // Números alinhados e ligaduras como no SF.
    const style = document.createElement('style');
    style.textContent = 'body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;font-feature-settings:"cv11","ss01";}';
    document.head.append(style);
  }, []);
  return Platform.OS === 'android' ? loaded : true;
}
