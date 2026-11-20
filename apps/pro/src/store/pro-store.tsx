import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import type { Session } from '@supabase/supabase-js';

import { loadRemoteCatalog } from '@/data/remote-catalog';
import { friendlyError, isRemote, supabase } from '@/lib/supabase';
import { DEFAULT_WEEK, demoState } from '@/pro/demo';
import * as remote from '@/pro/remote';
import { fromMin, nowMin, todayKey, toMin, weekdayOf } from '@/pro/time';
import type { Appointment, AppointmentStatus, OfferedService, ProProfile, ProState, WorkDay } from '@/pro/types';

/**
 * Estado global do Tesourinha Pro (MVP), salvo no aparelho com AsyncStorage.
 * A interface foi pensada para ser trocada por chamadas ao Supabase sem mudar as telas
 * (ver supabase/migrations/0002_profissional.sql).
 */

const STORAGE_KEY = 'tesourinha-pro:v1';

const empty: ProState = {
  profile: null,
  approval: 'em_analise',
  rating: 0,
  reviews: [],
  services: [],
  week: DEFAULT_WEEK,
  slotMinutes: 30,
  timeOff: [],
  appointments: [],
};

export type NewAppointment = Omit<Appointment, 'id' | 'status' | 'createdAt' | 'source'>;

export type Result = { ok: true } | { ok: false; error: string };

interface ProStore extends ProState {
  ready: boolean;
  /** true quando ligado ao Supabase; false no modo demonstração. */
  remote: boolean;
  /** Última falha ao salvar no servidor (some na próxima gravação bem-sucedida). */
  syncError: string | null;
  signInDemo: (email: string) => void;
  signUp: (profile: ProProfile) => void;
  /** Login real (Supabase). */
  signInWithEmail: (email: string, password: string) => Promise<Result>;
  /** Cadastro real (Supabase): cria a conta e o cadastro profissional "em análise". */
  signUpWithEmail: (profile: ProProfile, password: string) => Promise<Result>;
  /** Demo: aprova na hora. Remoto: consulta de novo se a Associação já aprovou. */
  approve: () => void;
  refresh: () => Promise<void>;
  signOut: () => void;
  updateProfile: (patch: Partial<ProProfile>) => void;
  /** Troca a foto de perfil (URI local escolhida no seletor de imagens). */
  setPhoto: (uri: string, mimeType?: string) => Promise<Result>;
  setStatus: (id: string, status: AppointmentStatus) => void;
  addAppointment: (a: NewAppointment) => Promise<Result>;
  offers: (serviceId: string) => OfferedService | undefined;
  toggleService: (serviceId: string, defaults: OfferedService) => void;
  updateService: (serviceId: string, patch: Partial<OfferedService>) => void;
  setWorkDay: (weekday: number, patch: Partial<WorkDay>) => void;
  setSlotMinutes: (min: number) => void;
  addTimeOff: (date: string, reason: string) => void;
  removeTimeOff: (id: string) => void;
  /** Horários livres para um serviço de `durationMin` minutos na data. */
  freeSlots: (date: string, durationMin: number) => string[];
  isDayOff: (date: string) => boolean;
}

const Ctx = createContext<ProStore | null>(null);

export function ProProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ProState>(empty);
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const proId = useRef<string | null>(null);
  const uidRef = useRef<{ uid: string; email: string } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const load = useCallback(async (uid: string, email: string) => {
    uidRef.current = { uid, email };
    const { professionalId, state: loaded } = await remote.loadPro(uid, email);
    proId.current = professionalId;
    setState(professionalId ? { ...empty, ...loaded } : empty);
  }, []);

  const refresh = useCallback(async () => {
    if (uidRef.current) await load(uidRef.current.uid, uidRef.current.email).catch((e) => setSyncError(String(e?.message ?? e)));
  }, [load]);

  /** Grava no servidor em segundo plano; se falhar, mostra o erro e recarrega o estado verdadeiro. */
  const sync = useCallback(
    (run: () => Promise<unknown>) => {
      if (!isRemote || !proId.current) return;
      run()
        .then(() => setSyncError(null))
        .catch((e) => {
          setSyncError(e instanceof Error ? e.message : String(e));
          void refresh();
        });
    },
    [refresh],
  );

  useEffect(() => {
    let cancelled = false;
    if (!supabase) {
      AsyncStorage.getItem(STORAGE_KEY)
        .then((raw) => {
          if (raw && !cancelled) setState({ ...empty, ...JSON.parse(raw) });
        })
        .catch(() => {})
        .finally(() => !cancelled && setReady(true));
      return () => { cancelled = true; };
    }
    const apply = async (session: Session | null) => {
      if (session) await load(session.user.id, session.user.email ?? '').catch((e) => setSyncError(String(e?.message ?? e)));
      else {
        proId.current = null;
        uidRef.current = null;
        setState(empty);
      }
    };
    (async () => {
      const [, { data }] = await Promise.all([loadRemoteCatalog(), supabase.auth.getSession()]);
      if (cancelled) return;
      await apply(data.session);
      if (!cancelled) setReady(true);
    })().catch(() => !cancelled && setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setTimeout(() => void apply(null), 0);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [load]);

  useEffect(() => {
    if (!ready || isRemote) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const signInDemo = useCallback((email: string) => setState(demoState(email)), []);
  const signUp = useCallback((profile: ProProfile) => setState({ ...empty, profile, approval: 'em_analise' }), []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<Result> => {
    if (!supabase) return { ok: false, error: 'Servidor não configurado.' };
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.session) return { ok: false, error: friendlyError(error) };
    try {
      await load(data.session.user.id, data.session.user.email ?? email);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    if (!proId.current) {
      await supabase.auth.signOut();
      return { ok: false, error: 'Esta conta ainda não tem cadastro profissional. Use "Criar conta".' };
    }
    return { ok: true };
  }, [load]);

  const signUpWithEmail = useCallback(async (profile: ProProfile, password: string): Promise<Result> => {
    if (!supabase) return { ok: false, error: 'Servidor não configurado.' };
    const email = profile.email.trim().toLowerCase();
    let { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: profile.name, phone: profile.phone } } });
    // Quem já tem conta de cliente no app pode virar profissional com o mesmo login.
    if (error && /already/i.test(error.message)) {
      const r = await supabase.auth.signInWithPassword({ email, password });
      data = r.data as typeof data;
      error = r.error;
    }
    if (error) return { ok: false, error: friendlyError(error) };
    if (!data.session) return { ok: false, error: 'Confirme seu e-mail (veja sua caixa de entrada) e depois entre.' };
    try {
      const uid = data.session.user.id;
      const { data: existing } = await supabase.from('professionals').select('id').eq('profile_id', uid).maybeSingle();
      if (!existing) await remote.createProfessional(uid, { ...profile, email }, empty.slotMinutes);
      await load(uid, email);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [load]);

  const approve = useCallback(() => {
    if (isRemote) void refresh();
    else setState((s) => ({ ...s, approval: 'aprovado' }));
  }, [refresh]);

  const signOut = useCallback(() => {
    if (supabase) void supabase.auth.signOut();
    proId.current = null;
    uidRef.current = null;
    setState(empty);
  }, []);

  const updateProfile = useCallback((patch: Partial<ProProfile>) => {
    setState((s) => (s.profile ? { ...s, profile: { ...s.profile, ...patch } } : s));
    sync(() => remote.updateProfile(proId.current!, patch));
  }, [sync]);

  const setPhoto = useCallback(async (uri: string, mimeType?: string): Promise<Result> => {
    // Demonstração: a foto fica só neste aparelho.
    if (!isRemote || !proId.current || !uidRef.current) {
      setState((s) => (s.profile ? { ...s, profile: { ...s.profile, avatarUrl: uri } } : s));
      return { ok: true };
    }
    try {
      const url = await remote.uploadPhoto(uidRef.current.uid, uri, mimeType);
      await remote.updateProfile(proId.current, { avatarUrl: url });
      setState((s) => (s.profile ? { ...s, profile: { ...s.profile, avatarUrl: url } } : s));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, []);

  const setStatus = useCallback((id: string, status: AppointmentStatus) => {
    setState((s) => ({ ...s, appointments: s.appointments.map((a) => (a.id === id ? { ...a, status } : a)) }));
    sync(() => remote.setBookingStatus(id, status));
  }, [sync]);

  const addAppointment = useCallback(async (a: NewAppointment): Promise<Result> => {
    if (isRemote && proId.current) {
      try {
        const { id, createdAt } = await remote.insertEncaixe(proId.current, a);
        setState((s) => ({ ...s, appointments: [...s.appointments, { ...a, id, createdAt, status: 'confirmado', source: 'encaixe' }] }));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    const appt: Appointment = { ...a, id: `a-${Date.now()}`, status: 'confirmado', source: 'encaixe', createdAt: new Date().toISOString() };
    setState((s) => ({ ...s, appointments: [...s.appointments, appt] }));
    return { ok: true };
  }, []);

  const offers = useCallback((serviceId: string) => state.services.find((o) => o.serviceId === serviceId), [state.services]);

  const toggleService = useCallback((serviceId: string, defaults: OfferedService) => {
    const has = stateRef.current.services.some((o) => o.serviceId === serviceId);
    setState((s) => ({
      ...s,
      services: has ? s.services.filter((o) => o.serviceId !== serviceId) : [...s.services.filter((o) => o.serviceId !== serviceId), defaults],
    }));
    sync(() => (has ? remote.removeService(proId.current!, serviceId) : remote.addService(proId.current!, defaults)));
  }, [sync]);

  const updateService = useCallback((serviceId: string, patch: Partial<OfferedService>) => {
    setState((s) => ({ ...s, services: s.services.map((o) => (o.serviceId === serviceId ? { ...o, ...patch } : o)) }));
    sync(() => remote.patchService(proId.current!, serviceId, patch));
  }, [sync]);

  const setWorkDay = useCallback((weekday: number, patch: Partial<WorkDay>) => {
    const week = stateRef.current.week.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d));
    setState((s) => ({ ...s, week }));
    sync(() => remote.saveWeek(proId.current!, week, stateRef.current.slotMinutes));
  }, [sync]);

  const setSlotMinutes = useCallback((slotMinutes: number) => {
    setState((s) => ({ ...s, slotMinutes }));
    sync(() => remote.setSlotMinutes(proId.current!, slotMinutes, stateRef.current.week));
  }, [sync]);

  const addTimeOff = useCallback((date: string, reason: string) => {
    if (stateRef.current.timeOff.some((t) => t.date === date)) return;
    const tempId = `t-${Date.now()}`;
    setState((s) => ({ ...s, timeOff: [...s.timeOff, { id: tempId, date, reason }].sort((a, b) => a.date.localeCompare(b.date)) }));
    sync(async () => {
      const id = await remote.insertTimeOff(proId.current!, date, reason);
      setState((s) => ({ ...s, timeOff: s.timeOff.map((t) => (t.id === tempId ? { ...t, id } : t)) }));
    });
  }, [sync]);

  const removeTimeOff = useCallback((id: string) => {
    setState((s) => ({ ...s, timeOff: s.timeOff.filter((t) => t.id !== id) }));
    if (!id.startsWith('t-')) sync(() => remote.deleteTimeOff(id));
  }, [sync]);

  const isDayOff = useCallback(
    (date: string) => !state.week[weekdayOf(date)]?.enabled || state.timeOff.some((t) => t.date === date),
    [state.week, state.timeOff],
  );

  const freeSlots = useCallback(
    (date: string, durationMin: number) => {
      if (isDayOff(date)) return [];
      const day = state.week[weekdayOf(date)]!;
      const busy = state.appointments
        .filter((a) => a.date === date && (a.status === 'confirmado' || a.status === 'concluido'))
        .map((a) => [toMin(a.time), toMin(a.time) + a.durationMin] as const);
      const isToday = date === todayKey();
      const out: string[] = [];
      for (let t = toMin(day.start); t + durationMin <= toMin(day.end); t += state.slotMinutes) {
        if (isToday && t <= nowMin()) continue;
        if (busy.some(([s, e]) => t < e && t + durationMin > s)) continue;
        out.push(fromMin(t));
      }
      return out;
    },
    [isDayOff, state.week, state.appointments, state.slotMinutes],
  );

  const value = useMemo<ProStore>(
    () => ({
      ...state,
      ready,
      remote: isRemote,
      syncError,
      signInDemo,
      signUp,
      signInWithEmail,
      signUpWithEmail,
      approve,
      refresh,
      signOut,
      updateProfile,
      setPhoto,
      setStatus,
      addAppointment,
      offers,
      toggleService,
      updateService,
      setWorkDay,
      setSlotMinutes,
      addTimeOff,
      removeTimeOff,
      freeSlots,
      isDayOff,
    }),
    [state, ready, syncError, signInDemo, signUp, signInWithEmail, signUpWithEmail, approve, refresh, signOut, updateProfile, setPhoto, setStatus, addAppointment, offers, toggleService, updateService, setWorkDay, setSlotMinutes, addTimeOff, removeTimeOff, freeSlots, isDayOff],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePro() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePro must be used within ProProvider');
  return ctx;
}

/** Atendimentos de um dia, em ordem de horário. */
export function dayAppointments(appointments: Appointment[], date: string) {
  return appointments.filter((a) => a.date === date).sort((a, b) => a.time.localeCompare(b.time));
}
