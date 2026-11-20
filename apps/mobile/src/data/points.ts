import { supabase } from '@/lib/supabase';

/**
 * Pontos "Tesourinhas" e níveis (Bronze, Prata, Ouro). Usado nos dois apps.
 * As regras e os créditos ficam no banco (migração 0013): aqui só lemos o extrato,
 * o saldo e resgatamos cupons. Sem servidor, mostra um exemplo de demonstração.
 */
export type Level = 'Bronze' | 'Prata' | 'Ouro';

export interface PointsSummary {
  balance: number;
  yearPoints: number;
  level: Level;
  nextLevelAt: number | null;
  expiring30d: number;
}

export interface LedgerItem {
  id: string;
  delta: number;
  reason: string;
  description: string;
  createdAt: string;
  expiresAt?: string;
}

export interface Coupon {
  id: string;
  code: string;
  value: number;
  expiresAt: string;
  usedAt?: string;
}

export interface PointsRule {
  key: string;
  label: string;
  points: number;
}

export interface PointsData {
  summary: PointsSummary;
  ledger: LedgerItem[];
  coupons: Coupon[];
  rules: PointsRule[];
  referralCode: string | null;
}

/** 100 pontos = R$ 5,00 de cupom. */
export const POINTS_PER_REAL = 20;
export const REDEEM_OPTIONS = [100, 200, 500, 1000];
export const LEVELS: { name: Level; from: number; perks: string }[] = [
  { name: 'Bronze', from: 0, perks: 'Junte pontos e troque por cupons' },
  { name: 'Prata', from: 500, perks: 'Ofertas exclusivas na loja' },
  { name: 'Ouro', from: 1500, perks: 'Prioridade em cursos e ofertas especiais' },
];
export const LEVEL_COLORS: Record<Level, string> = { Bronze: '#B87333', Prata: '#8E8E93', Ouro: '#D4A017' };

export const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

type Row = Record<string, any>;
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

export async function loadPoints(): Promise<PointsData> {
  if (!supabase) return demo();
  const [sum, led, cup, rul, ref] = await Promise.all([
    supabase.rpc('points_summary'),
    supabase.from('points_ledger').select('id, delta, reason, description, created_at, expires_at').order('created_at', { ascending: false }).limit(100),
    supabase.from('coupons').select('id, code, value, expires_at, used_at').order('created_at', { ascending: false }),
    supabase.from('points_rules').select('key, label, points').eq('active', true).order('points', { ascending: false }),
    supabase.rpc('my_referral_code'),
  ]);
  fail(sum.error);
  fail(led.error);
  const s = (sum.data ?? {}) as Row;
  return {
    summary: {
      balance: s.balance ?? 0,
      yearPoints: s.year_points ?? 0,
      level: (s.level ?? 'Bronze') as Level,
      nextLevelAt: s.next_level_at ?? null,
      expiring30d: s.expiring_30d ?? 0,
    },
    ledger: (led.data ?? []).map((r: Row) => ({
      id: r.id,
      delta: r.delta,
      reason: r.reason,
      description: r.description,
      createdAt: r.created_at,
      expiresAt: r.expires_at ?? undefined,
    })),
    coupons: (cup.data ?? []).map((c: Row) => ({ id: c.id, code: c.code, value: Number(c.value), expiresAt: c.expires_at, usedAt: c.used_at ?? undefined })),
    rules: (rul.data ?? []) as PointsRule[],
    referralCode: (ref.data as string | null) ?? null,
  };
}

/** Troca pontos por um cupom. Devolve o cupom criado. */
export async function redeem(points: number): Promise<Coupon> {
  if (!supabase) {
    const c = { id: String(Date.now()), code: Math.random().toString(16).slice(2, 10).toUpperCase(), value: points / POINTS_PER_REAL, expiresAt: new Date(Date.now() + 90 * 864e5).toISOString() };
    demoState.coupons.unshift(c);
    demoState.spent += points;
    return c;
  }
  const { data, error } = await supabase.rpc('redeem_points', { p_points: points });
  fail(error);
  const d = data as Row;
  return { id: d.code, code: d.code, value: Number(d.value), expiresAt: d.expires_at };
}

/* ---------------------------- demonstração ---------------------------- */
const demoState = { coupons: [] as Coupon[], spent: 0 };
function demo(): PointsData {
  const day = 864e5;
  const ledger: LedgerItem[] = [
    { id: '1', delta: 50, reason: 'atendimento_cliente', description: 'Corte feminino com Ana Souza', createdAt: new Date(Date.now() - 2 * day).toISOString() },
    { id: '2', delta: 20, reason: 'avaliacao', description: 'Obrigado pela avaliação!', createdAt: new Date(Date.now() - 2 * day).toISOString() },
    { id: '3', delta: 200, reason: 'curso_concluido', description: 'Formatura: Visagismo', createdAt: new Date(Date.now() - 20 * day).toISOString() },
  ];
  const earned = ledger.reduce((a, l) => a + l.delta, 0);
  if (demoState.spent) ledger.unshift({ id: 'r', delta: -demoState.spent, reason: 'resgate', description: 'Cupons resgatados', createdAt: new Date().toISOString() });
  return {
    summary: { balance: earned - demoState.spent, yearPoints: earned, level: 'Bronze', nextLevelAt: 500, expiring30d: 0 },
    ledger,
    coupons: demoState.coupons,
    rules: [
      { key: 'curso_concluido', label: 'Curso concluído', points: 200 },
      { key: 'indicacao', label: 'Amigo indicado fez o 1º atendimento', points: 100 },
      { key: 'atendimento_cliente', label: 'Atendimento concluído', points: 50 },
      { key: 'avaliacao', label: 'Avaliação publicada', points: 20 },
    ],
    referralCode: 'DEMO42',
  };
}
