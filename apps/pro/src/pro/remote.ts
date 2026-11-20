import { findService } from '@/data/catalog';
import { fromStartsAt, toReview, toStartsAt } from '@/data/mappers';
import { supabase } from '@/lib/supabase';

import { DEFAULT_WEEK } from './demo';
import type { Appointment, AppointmentStatus, OfferedService, ProProfile, ProState, TimeOff, WorkDay } from './types';

/**
 * Leitura e gravação do app do profissional no Supabase.
 * As regras de acesso (RLS) garantem que cada profissional só vê e altera os próprios dados.
 */

type Row = Record<string, any>;
const sb = () => supabase!;

const hhmm = (t: string) => t.slice(0, 5);

function weekFromHours(rows: Row[]): WorkDay[] {
  return DEFAULT_WEEK.map((d) => {
    const day = rows.filter((r) => r.weekday === d.weekday);
    if (!day.length) return { ...d, enabled: false };
    const start = day.map((r) => hhmm(r.start_time)).sort()[0]!;
    const end = day.map((r) => hhmm(r.end_time)).sort().at(-1)!;
    return { weekday: d.weekday, enabled: true, start, end };
  });
}

export interface RemoteLoad {
  professionalId: string | null;
  state: Partial<ProState>;
}

/** Carrega tudo do profissional logado. professionalId = null quando a conta ainda não tem cadastro profissional. */
export async function loadPro(uid: string, email: string): Promise<RemoteLoad> {
  const { data: pro, error } = await sb().from('professionals').select('*').eq('profile_id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  if (!pro) return { professionalId: null, state: {} };

  const [ps, wh, off, bk, rv] = await Promise.all([
    sb().from('professional_services').select('*').eq('professional_id', pro.id),
    sb().from('working_hours').select('*').eq('professional_id', pro.id),
    sb().from('time_off').select('*').eq('professional_id', pro.id).order('day'),
    sb().from('bookings').select('*').eq('professional_id', pro.id).order('starts_at'),
    sb().from('reviews').select('*').eq('professional_id', pro.id).order('created_at', { ascending: false }),
  ]);
  const bookings = (bk.data ?? []) as Row[];

  // Nomes dos clientes que agendaram pelo app (a política "clientes do profissional" libera esta leitura).
  const userIds = [...new Set(bookings.map((b) => b.user_id).filter(Boolean))];
  const people = userIds.length ? ((await sb().from('profiles').select('id, full_name, phone').in('id', userIds)).data ?? []) : [];
  const person = new Map(people.map((p: Row) => [p.id, p]));

  const seen = new Set<string>();
  const appointments: Appointment[] = bookings.map((b) => {
    const { date, time } = fromStartsAt(b.starts_at);
    const svc = findService(b.service_id);
    const who = b.user_id ? person.get(b.user_id) : null;
    const clientKey = b.user_id ?? `${b.client_name}|${b.client_phone}`;
    const firstVisit = !seen.has(clientKey);
    seen.add(clientKey);
    return {
      id: b.id,
      clientName: who?.full_name ?? b.client_name ?? 'Cliente',
      clientPhone: who?.phone ?? b.client_phone ?? '',
      serviceId: b.service_id,
      date,
      time,
      durationMin: b.duration_min ?? svc?.durationMin ?? 60,
      price: Number(b.price ?? svc?.priceFrom ?? 0),
      status: b.status as AppointmentStatus,
      source: b.source === 'encaixe' ? 'encaixe' : 'app',
      notes: b.notes ?? undefined,
      firstVisit,
      createdAt: b.created_at,
    };
  });

  const services: OfferedService[] = (ps.data ?? []).map((o: Row) => {
    const svc = findService(o.service_id);
    return { serviceId: o.service_id, price: Number(o.price ?? svc?.priceFrom ?? 0), durationMin: o.duration_min ?? svc?.durationMin ?? 60 };
  });

  const profile: ProProfile = {
    name: pro.name,
    email,
    phone: pro.phone ?? '',
    role: pro.role,
    bio: pro.bio ?? '',
    neighborhood: pro.neighborhood ?? '',
    yearsExperience: pro.years_experience ?? 0,
    tesourinhaAlumni: !!pro.tesourinha_alumni,
    categoryIds: pro.category_ids ?? [],
    avatarColor: '#FF8A3D',
  };

  return {
    professionalId: pro.id,
    state: {
      profile,
      approval: pro.status === 'aprovado' ? 'aprovado' : 'em_analise',
      rating: Number(pro.rating),
      reviews: (rv.data ?? []).map(toReview),
      services,
      week: weekFromHours(wh.data ?? []),
      slotMinutes: pro.slot_minutes ?? 30,
      timeOff: (off.data ?? []).map((t: Row): TimeOff => ({ id: t.id, date: t.day, reason: t.reason ?? '' })),
      appointments,
    },
  };
}

/** Cria o cadastro profissional (entra "em análise" até a Associação aprovar no painel). */
export async function createProfessional(uid: string, p: ProProfile, slotMinutes: number): Promise<string> {
  const { data, error } = await sb()
    .from('professionals')
    .insert({
      profile_id: uid,
      status: 'em_analise',
      name: p.name,
      role: p.role,
      bio: p.bio,
      neighborhood: p.neighborhood,
      years_experience: p.yearsExperience,
      tesourinha_alumni: p.tesourinhaAlumni,
      category_ids: p.categoryIds,
      phone: p.phone,
      slot_minutes: slotMinutes,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  // Expediente padrão, que o profissional ajusta depois em "Horários".
  await saveWeek(data.id, DEFAULT_WEEK, slotMinutes);
  return data.id;
}

export async function updateProfile(id: string, p: Partial<ProProfile>) {
  const row: Row = {};
  if (p.name !== undefined) row.name = p.name;
  if (p.phone !== undefined) row.phone = p.phone;
  if (p.role !== undefined) row.role = p.role;
  if (p.bio !== undefined) row.bio = p.bio;
  if (p.neighborhood !== undefined) row.neighborhood = p.neighborhood;
  if (p.yearsExperience !== undefined) row.years_experience = p.yearsExperience;
  if (p.categoryIds !== undefined) row.category_ids = p.categoryIds;
  // "Formado pela Tesourinha" só o admin altera (selo verificado).
  if (!Object.keys(row).length) return;
  const { error } = await sb().from('professionals').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setBookingStatus(id: string, status: AppointmentStatus) {
  const { error } = await sb().from('bookings').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function insertEncaixe(professionalId: string, a: Omit<Appointment, 'id' | 'status' | 'createdAt' | 'source'>): Promise<{ id: string; createdAt: string }> {
  const { data, error } = await sb()
    .from('bookings')
    .insert({
      professional_id: professionalId,
      service_id: a.serviceId,
      starts_at: toStartsAt(a.date, a.time),
      source: 'encaixe',
      client_name: a.clientName,
      client_phone: a.clientPhone || null,
      duration_min: a.durationMin,
      price: a.price,
      notes: a.notes ?? null,
    })
    .select('id, created_at')
    .single();
  if (error) throw new Error(error.code === '23505' ? 'Esse horário acabou de ser ocupado. Escolha outro.' : error.message);
  return { id: data.id, createdAt: data.created_at };
}

export async function addService(professionalId: string, o: OfferedService) {
  const { error } = await sb().from('professional_services').insert({ professional_id: professionalId, service_id: o.serviceId, price: o.price, duration_min: o.durationMin });
  if (error) throw new Error(error.message);
}

export async function removeService(professionalId: string, serviceId: string) {
  const { error } = await sb().from('professional_services').delete().eq('professional_id', professionalId).eq('service_id', serviceId);
  if (error) throw new Error(error.message);
}

export async function patchService(professionalId: string, serviceId: string, p: Partial<OfferedService>) {
  const row: Row = {};
  if (p.price !== undefined) row.price = p.price;
  if (p.durationMin !== undefined) row.duration_min = p.durationMin;
  const { error } = await sb().from('professional_services').update(row).eq('professional_id', professionalId).eq('service_id', serviceId);
  if (error) throw new Error(error.message);
}

/** Regrava o expediente da semana (uma faixa por dia ativo). */
export async function saveWeek(professionalId: string, week: WorkDay[], slotMinutes: number) {
  const del = await sb().from('working_hours').delete().eq('professional_id', professionalId);
  if (del.error) throw new Error(del.error.message);
  const rows = week
    .filter((d) => d.enabled)
    .map((d) => ({ professional_id: professionalId, weekday: d.weekday, start_time: d.start, end_time: d.end, slot_minutes: slotMinutes }));
  if (rows.length) {
    const ins = await sb().from('working_hours').insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }
}

export async function setSlotMinutes(professionalId: string, slotMinutes: number, week: WorkDay[]) {
  const { error } = await sb().from('professionals').update({ slot_minutes: slotMinutes }).eq('id', professionalId);
  if (error) throw new Error(error.message);
  await saveWeek(professionalId, week, slotMinutes);
}

export async function insertTimeOff(professionalId: string, date: string, reason: string): Promise<string> {
  const { data, error } = await sb().from('time_off').insert({ professional_id: professionalId, day: date, reason }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function deleteTimeOff(id: string) {
  const { error } = await sb().from('time_off').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
