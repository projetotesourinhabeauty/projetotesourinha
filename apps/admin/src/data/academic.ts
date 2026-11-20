import { supabase } from './supabase'

/**
 * Área do Aluno no painel: aulas, chamada (QR e manual), materiais e certificados.
 * Fala direto com o Supabase (sem passar pelo store), carregando por curso.
 * No modo demonstração guarda tudo só na memória do navegador.
 */
export interface AdminClass {
  id: string
  courseId: string
  title: string
  startsAt: string
  endsAt: string
  room: string
  teacher: string
  code: string
  attendees: string[] // user ids presentes
}

export interface AdminMaterial {
  id: string
  courseId: string
  title: string
  url: string
  kind: 'pdf' | 'video' | 'link'
}

export interface AdminStudent {
  enrollmentId: string
  userId: string
  name: string
  phone: string
  status: 'inscrito' | 'lista de espera' | 'concluído' | 'cancelado'
  certificateCode?: string
  completedAt?: string
}

type Row = Record<string, any>
const sb = () => supabase!
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message)
}

/** Link aberto pelo QR (a câmera do celular abre o app e registra a presença). */
export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://tesourinhabeauty1.vercel.app'
export const checkInUrl = (code: string) => `${SITE_URL}/app/checkin/${code}`
export const certificateUrl = (code: string) => `${SITE_URL}/certificado/?c=${code}`

/* --------------------------- demonstração --------------------------- */
const memory = { classes: [] as AdminClass[], materials: [] as AdminMaterial[], completed: new Map<string, string>() }
const rnd = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('')

/* ------------------------------ aulas ------------------------------ */
export async function listClasses(courseId: string): Promise<AdminClass[]> {
  if (!supabase) return memory.classes.filter((c) => c.courseId === courseId).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const { data, error } = await sb().from('course_classes').select('*, attendance(user_id)').eq('course_id', courseId).order('starts_at')
  fail(error)
  return (data ?? []).map((c: Row) => ({
    id: c.id,
    courseId: c.course_id,
    title: c.title,
    startsAt: c.starts_at,
    endsAt: c.ends_at,
    room: c.room ?? '',
    teacher: c.teacher ?? '',
    code: c.check_in_code,
    attendees: (c.attendance ?? []).map((a: Row) => a.user_id),
  }))
}

export async function addClass(c: Omit<AdminClass, 'id' | 'code' | 'attendees'>): Promise<void> {
  if (!supabase) {
    memory.classes.push({ ...c, id: rnd(8), code: rnd(9), attendees: [] })
    return
  }
  const { error } = await sb().from('course_classes').insert({
    course_id: c.courseId, title: c.title, starts_at: c.startsAt, ends_at: c.endsAt, room: c.room || null, teacher: c.teacher || null,
  })
  fail(error)
}

export async function removeClass(id: string): Promise<void> {
  if (!supabase) {
    memory.classes = memory.classes.filter((c) => c.id !== id)
    return
  }
  fail((await sb().from('course_classes').delete().eq('id', id)).error)
}

export async function setPresence(classId: string, userId: string, present: boolean): Promise<void> {
  if (!supabase) {
    const c = memory.classes.find((x) => x.id === classId)
    if (c) c.attendees = present ? [...new Set([...c.attendees, userId])] : c.attendees.filter((u) => u !== userId)
    return
  }
  const q = present
    ? sb().from('attendance').upsert({ class_id: classId, user_id: userId, method: 'manual' }, { onConflict: 'class_id,user_id', ignoreDuplicates: true })
    : sb().from('attendance').delete().eq('class_id', classId).eq('user_id', userId)
  fail((await q).error)
}

/* ---------------------------- materiais ---------------------------- */
export async function listMaterials(courseId: string): Promise<AdminMaterial[]> {
  if (!supabase) return memory.materials.filter((m) => m.courseId === courseId)
  const { data, error } = await sb().from('course_materials').select('*').eq('course_id', courseId).order('sort_order').order('created_at')
  fail(error)
  return (data ?? []).map((m: Row) => ({ id: m.id, courseId: m.course_id, title: m.title, url: m.url, kind: m.kind }))
}

export async function addMaterial(m: Omit<AdminMaterial, 'id'>): Promise<void> {
  if (!supabase) {
    memory.materials.push({ ...m, id: rnd(8) })
    return
  }
  fail((await sb().from('course_materials').insert({ course_id: m.courseId, title: m.title, url: m.url, kind: m.kind })).error)
}

export async function removeMaterial(id: string): Promise<void> {
  if (!supabase) {
    memory.materials = memory.materials.filter((m) => m.id !== id)
    return
  }
  fail((await sb().from('course_materials').delete().eq('id', id)).error)
}

/** Envia uma apostila em PDF (até 30 MB) e devolve a URL pública. */
export async function uploadPdf(file: File): Promise<string> {
  if (file.type !== 'application/pdf') throw new Error('Envie um arquivo PDF.')
  if (file.size > 30 * 1024 * 1024) throw new Error('O PDF passa de 30 MB.')
  if (!supabase) return URL.createObjectURL(file)
  const safe = file.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9.]+/g, '-').replace(/-+/g, '-')
  const path = `${Date.now()}-${safe}`
  fail((await sb().storage.from('materiais').upload(path, file, { contentType: 'application/pdf' })).error)
  return sb().storage.from('materiais').getPublicUrl(path).data.publicUrl
}

/* ------------------------- alunos/certificado ------------------------- */
export async function listStudents(courseId: string, fallback: AdminStudent[]): Promise<AdminStudent[]> {
  if (!supabase) return fallback.map((s) => (memory.completed.has(s.enrollmentId) ? { ...s, status: 'concluído', certificateCode: memory.completed.get(s.enrollmentId) } : s))
  const { data, error } = await sb()
    .from('enrollments')
    .select('id, user_id, status, certificate_code, completed_at, profiles(full_name, phone)')
    .eq('course_id', courseId)
    .neq('status', 'cancelado')
    .order('created_at')
  fail(error)
  return (data ?? []).map((e: Row) => ({
    enrollmentId: e.id,
    userId: e.user_id,
    name: e.profiles?.full_name ?? 'Aluno',
    phone: e.profiles?.phone ?? '',
    status: e.status,
    certificateCode: e.certificate_code ?? undefined,
    completedAt: e.completed_at ?? undefined,
  }))
}

/** Marca como concluído: o banco gera o código do certificado e avisa o aluno. */
export async function completeStudent(enrollmentId: string): Promise<string> {
  if (!supabase) {
    const code = rnd(5).toUpperCase()
    memory.completed.set(enrollmentId, code)
    return code
  }
  const { data, error } = await sb().from('enrollments').update({ status: 'concluído' }).eq('id', enrollmentId).select('certificate_code').single()
  fail(error)
  return (data?.certificate_code ?? '') as string
}
