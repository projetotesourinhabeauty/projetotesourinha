import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente do Supabase do painel. Usa as mesmas variáveis do app (EXPO_PUBLIC_*), liberadas no vite.config.ts.
 * Sem elas o painel roda em modo demonstração, com dados de exemplo no navegador.
 */
const url = (import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.EXPO_PUBLIC_SUPABASE_URL) as string | undefined
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) as string | undefined

export const supabase: SupabaseClient | null = url && key ? createClient(url.trim(), key.trim()) : null
export const isRemote = supabase !== null
