import { findCourse } from '@/data/catalog';
import { friendlyError, supabase } from '@/lib/supabase';

/** Área do Aluno: aulas, presença, materiais e certificado de um curso. */
export interface ClassItem {
  id: string;
  title: string;
  startsAt: string; // ISO
  endsAt: string;
  room?: string;
  teacher?: string;
  present: boolean;
}

export interface Material {
  id: string;
  title: string;
  url: string;
  kind: 'pdf' | 'video' | 'link';
}

export interface StudentCourse {
  status: 'inscrito' | 'lista de espera' | 'concluído' | 'cancelado';
  certificateCode?: string;
  completedAt?: string;
  classes: ClassItem[];
  materials: Material[];
}

/** Frequência mínima para receber o certificado. */
export const MIN_ATTENDANCE = 0.75;

type Row = Record<string, any>;

export async function loadStudentCourse(courseId: string): Promise<StudentCourse> {
  if (!supabase) return demoCourse(courseId);
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  const [enr, cls, mat] = await Promise.all([
    supabase.from('enrollments').select('status, certificate_code, completed_at').eq('course_id', courseId).eq('user_id', uid ?? '').maybeSingle(),
    supabase.from('my_course_classes').select('*').eq('course_id', courseId).order('starts_at'),
    supabase.from('course_materials').select('id, title, url, kind').eq('course_id', courseId).order('sort_order'),
  ]);
  if (enr.error) throw new Error(enr.error.message);
  return {
    status: (enr.data?.status ?? 'inscrito') as StudentCourse['status'],
    certificateCode: enr.data?.certificate_code ?? undefined,
    completedAt: enr.data?.completed_at ?? undefined,
    classes: (cls.data ?? []).map((c: Row) => ({
      id: c.id,
      title: c.title,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      room: c.room ?? undefined,
      teacher: c.teacher ?? undefined,
      present: !!c.present,
    })),
    materials: (mat.data ?? []) as Material[],
  };
}

/** Lê o código do QR (URL .../checkin/<código>, tesourinha://checkin/<código> ou o código puro). */
export function parseCheckInCode(raw: string): string | null {
  const m = raw.trim().match(/checkin\/([a-f0-9]{8,64})/i) ?? raw.trim().match(/^([a-f0-9]{8,64})$/i);
  return m ? m[1]!.toLowerCase() : null;
}

export type CheckInResult = { ok: true; course: string; className: string; courseId: string } | { ok: false; error: string };

export async function checkIn(code: string): Promise<CheckInResult> {
  if (!supabase) return { ok: false, error: 'A presença por QR funciona na versão conectada ao servidor.' };
  const { data, error } = await supabase.rpc('check_in', { p_code: code });
  if (error) return { ok: false, error: friendlyError(error) };
  const d = data as Row;
  return { ok: true, course: d.course, className: d.class, courseId: d.course_id };
}

/** Modo demonstração: monta uma turma de exemplo a partir dos módulos do curso. */
function demoCourse(courseId: string): StudentCourse {
  const course = findCourse(courseId);
  const start = course?.startDate ? new Date(`${course.startDate}T19:00:00-03:00`) : new Date();
  const now = Date.now();
  const classes = (course?.modules ?? ['Aula 1', 'Aula 2', 'Aula 3']).map((m, i) => {
    const s = new Date(start.getTime() + i * 7 * 86400000);
    return {
      id: `demo-${i}`,
      title: `Módulo ${i + 1} · ${m}`,
      startsAt: s.toISOString(),
      endsAt: new Date(s.getTime() + 3 * 3600000).toISOString(),
      room: 'Sala 2',
      teacher: 'Equipe Tesourinha',
      present: s.getTime() < now,
    };
  });
  return { status: 'inscrito', classes, materials: [] };
}
