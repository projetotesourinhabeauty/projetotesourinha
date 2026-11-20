import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { courses as seedCourses, jobs as seedJobs, professionals as seedPros, services as seedServices } from '@shared/catalog'
import type { BookingStatus, Course, Job, Professional, Service } from '@shared/types'

import { adminSignIn, loadAll, patchItem, saveItem, uploadImage } from './remote'
import { isRemote, supabase } from './supabase'

/* ------------------------------------------------------------------ */
/* Tipos do painel                                                     */
/* ------------------------------------------------------------------ */

export type AdminProfessional = Professional & { active: boolean }
export type AdminService = Service & { active: boolean }
export type AdminCourse = Course & { published: boolean }
export type AdminJob = Job & { open: boolean }

export interface AdminUser {
  id: string
  name: string
  email: string
  phone: string
  city: string
  createdAt: string
  role: 'cliente' | 'aluno' | 'profissional' | 'admin'
}

export interface AdminBooking {
  id: string
  userId: string
  professionalId: string
  serviceId: string
  date: string
  time: string
  status: BookingStatus
  price: number
}

export type ApplicationStatus = 'nova' | 'em análise' | 'aprovada' | 'recusada'

export interface Enrollment {
  id: string
  userId: string
  courseId: string
  createdAt: string
  status: 'inscrito' | 'lista de espera' | 'concluído'
}

export interface Application {
  id: string
  userId: string
  jobId: string
  createdAt: string
  status: ApplicationStatus
}

export interface DB {
  professionals: AdminProfessional[]
  services: AdminService[]
  courses: AdminCourse[]
  jobs: AdminJob[]
  users: AdminUser[]
  bookings: AdminBooking[]
  enrollments: Enrollment[]
  applications: Application[]
}

/* ------------------------------------------------------------------ */
/* Dados de exemplo (determinísticos)                                  */
/* ------------------------------------------------------------------ */

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const FIRST = ['Juliana', 'Patrícia', 'Camila', 'Larissa', 'Aline', 'Bianca', 'Fernanda', 'Rafael', 'Bruno', 'Thiago', 'Mariana', 'Beatriz', 'Gabriela', 'Lucas', 'Pedro', 'Amanda', 'Letícia', 'Vanessa', 'Carla', 'Débora', 'Renato', 'Rodrigo', 'Sabrina', 'Tatiane']
const LAST = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira', 'Almeida', 'Ribeiro', 'Carvalho', 'Gomes', 'Martins', 'Rocha']
const HOODS = ['Santo Amaro', 'Capão Redondo', 'Campo Limpo', 'Jardim São Luís', 'Vila Andrade', 'Moema', 'Grajaú']

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (n: number) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return d
}

function seed(): DB {
  const r = rng(37)
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]!

  const users: AdminUser[] = Array.from({ length: 48 }, (_, i) => {
    const name = `${pick(FIRST)} ${pick(LAST)}`
    return {
      id: `u${i + 1}`,
      name,
      email: `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(' ', '.')}${i}@email.com`,
      phone: `(11) 9${String(Math.floor(r() * 9000) + 1000)}-${String(Math.floor(r() * 9000) + 1000)}`,
      city: `${pick(HOODS)}, SP`,
      createdAt: dayKey(addDays(-Math.floor(r() * 90))),
      role: r() < 0.6 ? 'cliente' : r() < 0.85 ? 'aluno' : 'profissional',
    }
  })

  const services = seedServices.map((s) => ({ ...s, active: true }))
  const professionals = seedPros.map((p) => ({ ...p, active: true }))
  const hours = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']

  const bookings: AdminBooking[] = []
  for (let offset = -20; offset <= 10; offset++) {
    const d = addDays(offset)
    if (d.getDay() === 0) continue
    const count = Math.floor(r() * 7) + (offset <= 0 ? 4 : 1)
    for (let k = 0; k < count; k++) {
      const pro = pick(professionals)
      const sid = pick(pro.serviceIds)
      const svc = services.find((s) => s.id === sid)!
      const status: BookingStatus = offset < 0 ? (r() < 0.88 ? 'concluido' : 'cancelado') : r() < 0.93 ? 'confirmado' : 'cancelado'
      bookings.push({
        id: `b${bookings.length + 1}`,
        userId: pick(users).id,
        professionalId: pro.id,
        serviceId: svc.id,
        date: dayKey(d),
        time: pick(hours),
        status,
        price: svc.priceFrom + Math.round(r() * 4) * 10,
      })
    }
  }

  const courses = seedCourses.map((c) => ({ ...c, published: true }))
  const enrollments: Enrollment[] = []
  courses.forEach((c) => {
    const n = Math.min(c.seatsTaken, 14)
    for (let i = 0; i < n; i++)
      enrollments.push({ id: `e${enrollments.length + 1}`, userId: pick(users).id, courseId: c.id, createdAt: dayKey(addDays(-Math.floor(r() * 30))), status: c.seatsTaken >= c.seats && i > 10 ? 'lista de espera' : 'inscrito' })
  })

  const jobs = seedJobs.map((j) => ({ ...j, open: true }))
  const appStatuses: ApplicationStatus[] = ['nova', 'nova', 'em análise', 'aprovada', 'recusada']
  const applications: Application[] = []
  jobs.forEach((j) => {
    const n = 2 + Math.floor(r() * 6)
    for (let i = 0; i < n; i++)
      applications.push({ id: `a${applications.length + 1}`, userId: pick(users).id, jobId: j.id, createdAt: dayKey(addDays(-Math.floor(r() * 10))), status: pick(appStatuses) })
  })

  return { professionals, services, courses, jobs, users, bookings, enrollments, applications }
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

const KEY = 'tesourinha-admin:v1'

type Collection = keyof DB
type Item<C extends Collection> = DB[C][number]

interface Store {
  db: DB
  upsert: <C extends Collection>(c: C, item: Item<C>) => void
  patch: <C extends Collection>(c: C, id: string, p: Partial<Item<C>>) => void
  remove: (c: Collection, id: string) => void
  reset: () => void
  session: string | null
  /** Modo demonstração: entra sem senha. Com Supabase, use signIn. */
  login: (email: string) => void
  /** Login real (Supabase). Devolve a mensagem de erro, ou null quando deu certo. */
  signIn: (email: string, password: string) => Promise<string | null>
  logout: () => void
  /** true quando o painel está ligado ao Supabase. */
  remote: boolean
  /** Carregando dados do banco. */
  loading: boolean
  /** Último erro ao gravar/carregar no banco. */
  error: string | null
  /** Envia uma foto e devolve a URL (no modo demonstração, guarda a imagem no navegador). */
  upload: (file: File, prefix: string) => Promise<string>
}

const Ctx = createContext<Store | null>(null)

const emptyDB = (): DB => ({ professionals: [], services: [], courses: [], jobs: [], users: [], bookings: [], enrollments: [], applications: [] })

function load(): DB {
  if (isRemote) return emptyDB()
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as DB
  } catch {
    /* ignora */
  }
  return seed()
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(load)
  const [loading, setLoading] = useState(isRemote)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<string | null>(() => {
    if (isRemote) return null
    try {
      return localStorage.getItem(`${KEY}:session`)
    } catch {
      return null
    }
  })

  const refresh = useCallback(async () => {
    if (!isRemote) return
    try {
      setDb(await loadAll())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // Modo remoto: restaura a sessão do Supabase (só administradores) e carrega os dados.
  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    const apply = async (email: string | null, uid: string | null) => {
      if (!uid) {
        setSession(null)
        setDb(emptyDB())
        setLoading(false)
        return
      }
      const { data: prof } = await supabase!.from('profiles').select('role').eq('id', uid).maybeSingle()
      if (cancelled) return
      if (prof?.role !== 'admin') {
        setSession(null)
        setLoading(false)
        return
      }
      setSession(email)
      setLoading(true)
      await refresh()
      if (!cancelled) setLoading(false)
    }
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user.email ?? null, data.session?.user.id ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') setTimeout(() => void apply(null, null), 0)
      if (event === 'SIGNED_IN') setTimeout(() => void apply(s?.user.email ?? null, s?.user.id ?? null), 0)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [refresh])

  useEffect(() => {
    if (isRemote) return
    try {
      localStorage.setItem(KEY, JSON.stringify(db))
    } catch {
      /* ignora */
    }
  }, [db])

  const fail = useCallback(
    (e: unknown) => {
      setError(e instanceof Error ? e.message : String(e))
      void refresh()
    },
    [refresh],
  )

  const upsert = useCallback(<C extends Collection>(c: C, item: Item<C>) => {
    setDb((d) => {
      const list = d[c] as Item<C>[]
      const exists = list.some((x) => x.id === item.id)
      return { ...d, [c]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [item, ...list] }
    })
    if (isRemote) {
      saveItem(c, item)
        .then((id) => {
          if (id !== item.id) setDb((d) => ({ ...d, [c]: (d[c] as Item<C>[]).map((x) => (x.id === item.id ? { ...x, id } : x)) }))
        })
        .catch(fail)
    }
  }, [fail])

  const patch = useCallback(<C extends Collection>(c: C, id: string, p: Partial<Item<C>>) => {
    setDb((d) => ({ ...d, [c]: (d[c] as Item<C>[]).map((x) => (x.id === id ? { ...x, ...p } : x)) }))
    if (isRemote) patchItem(c, id, p as Record<string, unknown>).catch(fail)
  }, [fail])

  const remove = useCallback((c: Collection, id: string) => {
    setDb((d) => ({ ...d, [c]: (d[c] as { id: string }[]).filter((x) => x.id !== id) }))
  }, [])

  const reset = useCallback(() => (isRemote ? void refresh() : setDb(seed())), [refresh])
  const login = useCallback((email: string) => {
    setSession(email)
    try {
      localStorage.setItem(`${KEY}:session`, email)
    } catch {
      /* ignora */
    }
  }, [])
  const signIn = useCallback(async (email: string, password: string) => {
    if (!isRemote) {
      login(email)
      return null
    }
    return adminSignIn(email, password)
  }, [login])
  const logout = useCallback(() => {
    if (supabase) void supabase.auth.signOut()
    setSession(null)
    try {
      localStorage.removeItem(`${KEY}:session`)
    } catch {
      /* ignora */
    }
  }, [])

  const upload = useCallback(async (file: File, prefix: string) => {
    if (file.size > 5 * 1024 * 1024) throw new Error('A imagem passa de 5 MB. Escolha uma menor.')
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Use uma imagem JPG, PNG ou WebP.')
    if (isRemote) return uploadImage(file, prefix)
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
      fr.readAsDataURL(file)
    })
  }, [])

  const value = useMemo(
    () => ({ db, upsert, patch, remove, reset, session, login, signIn, logout, remote: isRemote, loading, error, upload }),
    [db, upsert, patch, remove, reset, session, login, signIn, logout, loading, error, upload],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore() {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fora do StoreProvider')
  return s
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')
}
export const today = () => dayKey(new Date())
export const offsetDay = (n: number) => dayKey(addDays(n))
export const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
