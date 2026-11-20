import { supabase } from './supabase'

/** Pontos "Tesourinhas" no painel: regras, extrato geral e ajustes manuais. */
export interface Rule {
  key: string
  label: string
  points: number
  active: boolean
}

export interface Entry {
  id: string
  userId: string
  userName: string
  delta: number
  reason: string
  description: string
  createdAt: string
}

type Row = Record<string, any>
const sb = () => supabase!
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message)
}

const memory = {
  rules: [
    { key: 'atendimento_cliente', label: 'Atendimento concluído (cliente)', points: 50, active: true },
    { key: 'avaliacao', label: 'Avaliação publicada', points: 20, active: true },
    { key: 'curso_concluido', label: 'Curso concluído', points: 200, active: true },
    { key: 'indicacao', label: 'Amigo indicado fez o 1º atendimento', points: 100, active: true },
    { key: 'atendimento_pro', label: 'Atendimento concluído (profissional)', points: 20, active: true },
    { key: 'compra_loja', label: 'Compra na loja entregue', points: 30, active: true },
  ] as Rule[],
  entries: [] as Entry[],
}

export async function listRules(): Promise<Rule[]> {
  if (!supabase) return memory.rules.map((r) => ({ ...r }))
  const { data, error } = await sb().from('points_rules').select('*').order('points', { ascending: false })
  fail(error)
  return (data ?? []) as Rule[]
}

export async function saveRule(r: Rule): Promise<void> {
  if (!supabase) {
    memory.rules = memory.rules.map((x) => (x.key === r.key ? { ...r } : x))
    return
  }
  fail((await sb().from('points_rules').update({ points: r.points, active: r.active }).eq('key', r.key)).error)
}

export async function listEntries(): Promise<Entry[]> {
  if (!supabase) return memory.entries
  const { data, error } = await sb()
    .from('points_ledger')
    .select('id, user_id, delta, reason, description, created_at, profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(200)
  fail(error)
  return (data ?? []).map((e: Row) => ({
    id: e.id,
    userId: e.user_id,
    userName: e.profiles?.full_name ?? 'Usuário',
    delta: e.delta,
    reason: e.reason,
    description: e.description,
    createdAt: e.created_at,
  }))
}

/** Crédito (positivo) ou débito (negativo) feito pela coordenação. */
export async function adjust(userId: string, userName: string, delta: number, description: string): Promise<void> {
  if (!delta) throw new Error('Informe a quantidade de pontos.')
  if (!description.trim()) throw new Error('Informe o motivo.')
  if (!supabase) {
    memory.entries.unshift({ id: String(Date.now()), userId, userName, delta, reason: 'ajuste', description, createdAt: new Date().toISOString() })
    return
  }
  fail(
    (
      await sb().from('points_ledger').insert({
        user_id: userId,
        delta,
        reason: 'ajuste',
        description: description.trim(),
        ref_id: crypto.randomUUID(),
        expires_at: delta > 0 ? new Date(Date.now() + 365 * 864e5).toISOString() : null,
      })
    ).error,
  )
}

export async function balanceOf(userId: string): Promise<{ balance: number; level: string } | null> {
  if (!supabase) {
    const b = memory.entries.filter((e) => e.userId === userId).reduce((a, e) => a + e.delta, 0)
    return { balance: b, level: 'Bronze' }
  }
  const { data, error } = await sb().rpc('points_summary', { p_user: userId })
  fail(error)
  return data ? { balance: (data as Row).balance, level: (data as Row).level } : null
}
