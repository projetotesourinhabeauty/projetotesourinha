import type { BookingStatus, CategoryId, CourseLevel, IconName, JobType } from '@shared/types'

import { supabase } from './supabase'
import type { AdminBooking, AdminCourse, AdminJob, AdminProfessional, AdminService, AdminUser, Application, DB, Enrollment } from './store'

/* Conversões entre as tabelas do Supabase e os tipos do painel. */

type Row = Record<string, any>
const PALETTE = ['#FF8A3D', '#3A3A3C', '#E5560A', '#1C1C1E', '#FF6A13', '#5B5B60', '#C2410C']
const colorFor = (s: string) => {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]!
}
/** ISO UTC -> data e hora de Brasília (UTC-3). */
const brt = (iso: string) => {
  const s = new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString()
  return { date: s.slice(0, 10), time: s.slice(11, 16) }
}
const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

export async function loadAll(): Promise<DB> {
  const sb = supabase!
  const q = await Promise.all([
    sb.from('professionals').select('*').order('name'),
    sb.from('professional_services').select('professional_id, service_id'),
    sb.from('services').select('*').order('name'),
    sb.from('courses').select('*').order('start_date'),
    sb.from('course_enrollment_counts').select('*'),
    sb.from('jobs').select('*').order('created_at', { ascending: false }),
    sb.from('profiles').select('*').order('created_at', { ascending: false }),
    sb.from('bookings').select('*').order('starts_at', { ascending: false }).limit(2000),
    sb.from('enrollments').select('*'),
    sb.from('applications').select('*'),
    sb.from('reviews').select('*'),
  ])
  const err = q.find((r) => r.error)?.error
  if (err) throw new Error(err.message)
  const [pros, ps, svcs, crs, cnt, jbs, profs, bks, enr, apps, revs] = q.map((r) => (r.data ?? []) as Row[])

  const taken = new Map(cnt!.map((c) => [c.course_id, c.taken as number]))

  const professionals: AdminProfessional[] = pros!.map((p) => ({
    id: p.id,
    slug: p.slug ?? undefined,
    name: p.name,
    role: p.role,
    categoryIds: p.category_ids ?? [],
    serviceIds: ps!.filter((x) => x.professional_id === p.id).map((x) => x.service_id),
    rating: Number(p.rating),
    reviewsCount: p.reviews_count,
    distanceKm: 0,
    neighborhood: p.neighborhood ?? '',
    bio: p.bio ?? '',
    yearsExperience: p.years_experience ?? 0,
    tesourinhaAlumni: !!p.tesourinha_alumni,
    avatarColor: colorFor(p.name),
    imageUrl: p.avatar_url ?? undefined,
    workingHours: [],
    reviews: revs!
      .filter((r) => r.professional_id === p.id)
      .map((r) => ({ id: r.id, author: r.author_name ?? 'Cliente', rating: r.rating, comment: r.comment ?? '', date: String(r.created_at).slice(0, 10) })),
    active: !!p.active && p.status === 'aprovado',
  }))

  const services: AdminService[] = svcs!.map((s) => ({
    id: s.id,
    slug: s.slug ?? undefined,
    categoryId: s.category_id,
    name: s.name,
    description: s.description ?? '',
    durationMin: s.duration_min,
    priceFrom: Number(s.price_from),
    icon: (s.icon ?? 'sparkles-outline') as IconName,
    active: !!s.active,
  }))

  const courses: AdminCourse[] = crs!.map((c) => ({
    id: c.id,
    slug: c.slug ?? undefined,
    title: c.title,
    subtitle: c.subtitle ?? '',
    categoryId: c.area,
    level: c.level as CourseLevel,
    durationHours: c.duration_hours,
    modality: c.modality,
    startDate: c.start_date ?? '',
    seats: c.seats,
    seatsTaken: taken.get(c.id) ?? 0,
    icon: (c.icon ?? 'school-outline') as IconName,
    description: c.description ?? '',
    modules: c.modules ?? [],
    certificate: !!c.certificate,
    coverUrl: c.cover_url ?? undefined,
    published: !!c.published,
  }))

  const jobs: AdminJob[] = jbs!.map((j) => ({
    id: j.id,
    slug: j.slug ?? undefined,
    title: j.title,
    company: j.company,
    location: j.location ?? '',
    type: j.job_type as JobType,
    salary: j.salary ?? undefined,
    postedAt: String(j.created_at).slice(0, 10),
    icon: (j.icon ?? 'briefcase-outline') as IconName,
    description: j.description ?? '',
    requirements: j.requirements ?? [],
    benefits: j.benefits ?? [],
    open: !!j.open,
  }))

  const users: AdminUser[] = profs!.map((u) => ({
    id: u.id,
    name: u.full_name,
    email: u.email ?? '',
    phone: u.phone ?? '',
    city: u.city ?? '',
    createdAt: String(u.created_at).slice(0, 10),
    role: u.role,
  }))

  // Clientes de "encaixe" (lançados pelo profissional, sem conta) entram como usuários virtuais.
  const bookings: AdminBooking[] = bks!.map((b) => {
    const { date, time } = brt(b.starts_at)
    let userId = b.user_id as string | null
    if (!userId) {
      userId = `encaixe:${b.id}`
      users.push({ id: userId, name: b.client_name ?? 'Encaixe', email: '', phone: b.client_phone ?? '', city: '', createdAt: date, role: 'cliente' })
    }
    const status: BookingStatus = b.status === 'nao_compareceu' ? 'cancelado' : b.status
    const svc = services.find((s) => s.id === b.service_id)
    return { id: b.id, userId, professionalId: b.professional_id, serviceId: b.service_id, date, time, status, price: Number(b.price ?? svc?.priceFrom ?? 0) }
  })

  const enrollments: Enrollment[] = enr!
    .filter((e) => e.status !== 'cancelado')
    .map((e) => ({ id: e.id, userId: e.user_id, courseId: e.course_id, createdAt: String(e.created_at).slice(0, 10), status: e.status }))
  const applications: Application[] = apps!.map((a) => ({ id: a.id, userId: a.user_id, jobId: a.job_id, createdAt: String(a.created_at).slice(0, 10), status: a.status }))

  return { professionals, services, courses, jobs, users, bookings, enrollments, applications }
}

/* ---------------------------- gravação ---------------------------- */

function toRow(c: keyof DB, item: any): Row | null {
  switch (c) {
    case 'professionals':
      return {
        name: item.name, role: item.role, bio: item.bio, neighborhood: item.neighborhood,
        years_experience: item.yearsExperience, tesourinha_alumni: item.tesourinhaAlumni,
        category_ids: item.categoryIds as CategoryId[], active: item.active,
        avatar_url: item.imageUrl ?? null,
      }
    case 'services':
      return {
        category_id: item.categoryId, name: item.name, description: item.description,
        duration_min: item.durationMin, price_from: item.priceFrom, icon: item.icon, active: item.active,
      }
    case 'courses':
      return {
        title: item.title, subtitle: item.subtitle, area: item.categoryId, level: item.level,
        duration_hours: item.durationHours, modality: item.modality, start_date: item.startDate || null,
        seats: item.seats, description: item.description, modules: item.modules, certificate: item.certificate,
        icon: item.icon, published: item.published, cover_url: item.coverUrl ?? null,
      }
    case 'jobs':
      return {
        title: item.title, company: item.company, location: item.location, job_type: item.type,
        salary: item.salary ?? null, description: item.description, requirements: item.requirements,
        benefits: item.benefits, icon: item.icon, open: item.open,
      }
    default:
      return null
  }
}

/** Grava um item novo ou editado. Devolve o id definitivo (uuid do banco). */
export async function saveItem(c: keyof DB, item: any): Promise<string> {
  const sb = supabase!
  const row = toRow(c, item)
  if (!row) throw new Error(`Coleção ${c} não pode ser editada pelo painel`)
  let id = item.id as string
  if (isUuid(id)) {
    const { error } = await sb.from(c).update(row).eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    // Profissional cadastrado pelo admin já entra aprovado.
    if (c === 'professionals') row.status = 'aprovado'
    const { data, error } = await sb.from(c).insert(row).select('id').single()
    if (error) throw new Error(error.message)
    id = data.id
  }
  if (c === 'professionals') {
    const del = await sb.from('professional_services').delete().eq('professional_id', id)
    if (del.error) throw new Error(del.error.message)
    const ids = (item.serviceIds as string[]).filter(isUuid)
    if (ids.length) {
      const ins = await sb.from('professional_services').insert(ids.map((service_id) => ({ professional_id: id, service_id })))
      if (ins.error) throw new Error(ins.error.message)
    }
    // Profissional novo ganha a grade padrão (seg a sáb, 9h–12h e 13h–19h).
    if (!isUuid(item.id)) {
      const hours = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
        { professional_id: id, weekday, start_time: '09:00', end_time: '12:00', slot_minutes: 60 },
        { professional_id: id, weekday, start_time: '13:00', end_time: '19:00', slot_minutes: 60 },
      ])
      const wh = await sb.from('working_hours').insert(hours)
      if (wh.error) throw new Error(wh.error.message)
    }
  }
  return id
}

/** Atualiza campos pontuais (status, ativo/publicado/aberto). */
export async function patchItem(c: keyof DB, id: string, p: Record<string, unknown>): Promise<void> {
  const sb = supabase!
  if (id.startsWith('encaixe:')) return
  const row: Row = {}
  for (const [k, v] of Object.entries(p)) {
    if (['status', 'active', 'published', 'open'].includes(k)) row[k] = v
  }
  if (c === 'professionals' && 'active' in p && p.active) row.status = 'aprovado'
  if (!Object.keys(row).length) return
  const { error } = await sb.from(c).update(row).eq('id', id)
  if (error) throw new Error(error.message)
}

/** Login do painel: só entra quem tem papel "admin" em profiles. */
export async function adminSignIn(email: string, password: string): Promise<string | null> {
  const sb = supabase!
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
  if (error || !data.user) return error?.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : (error?.message ?? 'Não foi possível entrar.')
  const { data: prof } = await sb.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
  if (prof?.role !== 'admin') {
    await sb.auth.signOut()
    return 'Esta conta não tem acesso de administrador.'
  }
  return null
}

/** Envia uma imagem para o bucket "fotos" (pasta admin/) e devolve a URL pública. */
export async function uploadImage(file: File, prefix: string): Promise<string> {
  const sb = supabase!
  const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg'
  const path = `admin/${prefix}-${Date.now()}.${ext}`
  const { error } = await sb.storage.from('fotos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
  if (error) throw new Error(error.message)
  return sb.storage.from('fotos').getPublicUrl(path).data.publicUrl
}
