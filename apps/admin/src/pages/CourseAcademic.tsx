import { Award, CalendarPlus, Check, ExternalLink, FileText, Link2, Loader2, PlayCircle, QrCode, Trash2, Upload, X } from 'lucide-react'
import QRCode from 'qrcode'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Avatar, Badge, Drawer, Field, useToast } from '../components/ui'
import {
  addClass,
  addMaterial,
  certificateUrl,
  checkInUrl,
  completeStudent,
  listClasses,
  listMaterials,
  listStudents,
  removeClass,
  removeMaterial,
  setPresence,
  uploadPdf,
  type AdminClass,
  type AdminMaterial,
  type AdminStudent,
} from '../data/academic'
import { useStore, type AdminCourse } from '../data/store'

type Tab = 'aulas' | 'alunos' | 'materiais'
const MIN = 0.75

const dt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const hm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
/** data (AAAA-MM-DD) + hora (HH:MM) de Brasília -> ISO */
const toIso = (d: string, t: string) => new Date(`${d}T${t}:00-03:00`).toISOString()

/** Turma do curso no painel: aulas e chamada, alunos e certificados, materiais. */
export function CourseAcademic({ course, onClose }: { course: AdminCourse | null; onClose: () => void }) {
  const { db } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('aulas')
  const [classes, setClasses] = useState<AdminClass[]>([])
  const [students, setStudents] = useState<AdminStudent[]>([])
  const [materials, setMaterials] = useState<AdminMaterial[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [qr, setQr] = useState<AdminClass | null>(null)
  const [roll, setRoll] = useState<AdminClass | null>(null)

  const load = useCallback(async () => {
    if (!course) return
    setLoading(true)
    setErr('')
    try {
      const fallback: AdminStudent[] = db.enrollments
        .filter((e) => e.courseId === course.id)
        .map((e) => {
          const u = db.users.find((x) => x.id === e.userId)
          return { enrollmentId: e.id, userId: e.userId, name: u?.name ?? 'Aluno', phone: u?.phone ?? '', status: e.status }
        })
      const [c, s, m] = await Promise.all([listClasses(course.id), listStudents(course.id, fallback), listMaterials(course.id)])
      setClasses(c)
      setStudents(s)
      setMaterials(m)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [course, db])

  useEffect(() => {
    if (course) {
      setTab('aulas')
      void load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id])

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) toast(ok)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const attendedBy = (userId: string) => classes.filter((c) => c.attendees.includes(userId)).length
  const enrolled = students.filter((s) => s.status === 'inscrito' || s.status === 'concluído')

  return (
    <>
      <Drawer open={!!course} title={course?.title ?? ''} onClose={onClose}>
        <div className="seg" role="tablist" style={{ alignSelf: 'flex-start' }}>
          {(['aulas', 'alunos', 'materiais'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
              {t === 'aulas' ? `Aulas (${classes.length})` : t === 'alunos' ? `Alunos (${enrolled.length})` : `Materiais (${materials.length})`}
            </button>
          ))}
        </div>
        {err && <div className="alert">{err}</div>}
        {loading && classes.length + students.length + materials.length === 0 ? (
          <div className="empty"><Loader2 className="spin" size={20} /></div>
        ) : tab === 'aulas' ? (
          <ClassesTab course={course!} classes={classes} total={enrolled.length} onAdd={(c) => run(() => addClass(c), 'Aula adicionada')} onRemove={(id) => run(() => removeClass(id), 'Aula removida')} onQr={setQr} onRoll={setRoll} />
        ) : tab === 'alunos' ? (
          <StudentsTab
            students={students}
            classes={classes}
            attendedBy={attendedBy}
            onComplete={(s) => run(async () => {
              const code = await completeStudent(s.enrollmentId)
              toast(`Certificado emitido: ${code}`)
            })}
          />
        ) : (
          <MaterialsTab courseId={course!.id} materials={materials} onAdd={(m) => run(() => addMaterial(m), 'Material adicionado')} onRemove={(id) => run(() => removeMaterial(id), 'Material removido')} />
        )}
      </Drawer>

      {qr && <QrModal cls={qr} courseTitle={course?.title ?? ''} onClose={() => setQr(null)} />}
      {roll && (
        <RollCall
          cls={classes.find((c) => c.id === roll.id) ?? roll}
          students={enrolled}
          onToggle={(userId, v) => run(() => setPresence(roll.id, userId, v))}
          onClose={() => setRoll(null)}
        />
      )}
    </>
  )
}

/* ------------------------------ Aulas ------------------------------ */
function ClassesTab({ course, classes, total, onAdd, onRemove, onQr, onRoll }: {
  course: AdminCourse
  classes: AdminClass[]
  total: number
  onAdd: (c: Omit<AdminClass, 'id' | 'code' | 'attendees'>) => void
  onRemove: (id: string) => void
  onQr: (c: AdminClass) => void
  onRoll: (c: AdminClass) => void
}) {
  const nextModule = course.modules.filter(Boolean)[classes.length]
  const [form, setForm] = useState({ title: '', date: course.startDate || '', start: '19:00', end: '22:00', room: '', teacher: '' })
  const title = form.title || (nextModule ? `Módulo ${classes.length + 1} · ${nextModule}` : `Aula ${classes.length + 1}`)
  const valid = !!form.date && form.end > form.start
  return (
    <>
      <div className="card" style={{ padding: 16, display: 'grid', gap: 12, boxShadow: 'none', border: '1px solid var(--border)' }}>
        <strong style={{ fontSize: 14 }}>Nova aula</strong>
        <Field label="Título"><input value={form.title} placeholder={title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <div className="fields-3">
          <Field label="Data"><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
          <Field label="Início"><input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
          <Field label="Fim"><input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
        </div>
        <div className="fields-2">
          <Field label="Sala"><input value={form.room} placeholder="Ex.: Sala 2" onChange={(e) => setForm({ ...form, room: e.target.value })} /></Field>
          <Field label="Professor(a)"><input value={form.teacher} onChange={(e) => setForm({ ...form, teacher: e.target.value })} /></Field>
        </div>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            onAdd({ courseId: course.id, title, startsAt: toIso(form.date, form.start), endsAt: toIso(form.date, form.end), room: form.room, teacher: form.teacher })
            // próxima aula: mesma hora, uma semana depois
            const d = new Date(`${form.date}T12:00:00`)
            d.setDate(d.getDate() + 7)
            setForm({ ...form, title: '', date: d.toISOString().slice(0, 10) })
          }}>
          <CalendarPlus size={15} /> Adicionar aula
        </button>
      </div>

      {classes.length === 0 ? (
        <div className="empty">Nenhuma aula cadastrada. Os alunos veem o cronograma no app assim que você adicionar.</div>
      ) : (
        classes.map((c) => (
          <div key={c.id} style={{ display: 'grid', gap: 10, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div className="cell-main">
              <div style={{ flex: 1 }}>
                <div className="t">{c.title}</div>
                <div className="s">{dt(c.startsAt)}–{hm(c.endsAt)}{c.room ? ` · ${c.room}` : ''}{c.teacher ? ` · ${c.teacher}` : ''}</div>
              </div>
              <Badge tone={c.attendees.length ? 'green' : 'gray'}>{c.attendees.length}/{total} presentes</Badge>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn sm primary" onClick={() => onQr(c)}><QrCode size={13} /> QR da chamada</button>
              <button className="btn sm" onClick={() => onRoll(c)}><Check size={13} /> Chamada</button>
              <button className="btn sm ghost danger" aria-label="Remover aula" onClick={() => confirm(`Remover "${c.title}"? As presenças desta aula também serão apagadas.`) && onRemove(c.id)}><Trash2 size={13} /></button>
            </div>
          </div>
        ))
      )}
    </>
  )
}

/* ------------------------------ Alunos ------------------------------ */
function StudentsTab({ students, classes, attendedBy, onComplete }: {
  students: AdminStudent[]
  classes: AdminClass[]
  attendedBy: (userId: string) => number
  onComplete: (s: AdminStudent) => void
}) {
  if (students.length === 0) return <div className="empty">Nenhum inscrito ainda.</div>
  return (
    <>
      <div className="muted" style={{ fontSize: 13 }}>
        O certificado exige {Math.round(MIN * 100)}% de presença. Ao emitir, o aluno recebe um aviso no app e, se for profissional, ganha o selo "Formado pela Tesourinha".
      </div>
      {students.map((s) => {
        const n = attendedBy(s.userId)
        const pct = classes.length ? n / classes.length : 0
        const done = s.status === 'concluído'
        return (
          <div key={s.enrollmentId} className="cell-main" style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <Avatar name={s.name} color="#3A3A3C" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t">{s.name}</div>
              <div className="s">{s.phone || 'sem telefone'} · {n}/{classes.length} aulas ({Math.round(pct * 100)}%)</div>
              <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${pct * 100}%`, background: pct < MIN ? '#AEAEB2' : undefined }} /></div>
            </div>
            {done ? (
              <a className="btn sm" href={certificateUrl(s.certificateCode ?? '')} target="_blank" rel="noreferrer"><Award size={13} /> {s.certificateCode}</a>
            ) : s.status === 'lista de espera' ? (
              <Badge tone="orange">lista de espera</Badge>
            ) : (
              <button
                className="btn sm primary"
                onClick={() => (pct >= MIN || confirm(`${s.name} tem ${Math.round(pct * 100)}% de presença (mínimo ${Math.round(MIN * 100)}%). Emitir o certificado mesmo assim?`)) && onComplete(s)}>
                <Award size={13} /> Emitir certificado
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}

/* ---------------------------- Materiais ---------------------------- */
function MaterialsTab({ courseId, materials, onAdd, onRemove }: {
  courseId: string
  materials: AdminMaterial[]
  onAdd: (m: Omit<AdminMaterial, 'id'>) => void
  onRemove: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<AdminMaterial['kind']>('link')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const upload = async (f?: File) => {
    if (!f) return
    setBusy(true)
    setErr('')
    try {
      const u = await uploadPdf(f)
      onAdd({ courseId, title: title || f.name.replace(/\.pdf$/i, ''), url: u, kind: 'pdf' })
      setTitle('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }

  const icon = (k: AdminMaterial['kind']) => (k === 'pdf' ? <FileText size={16} /> : k === 'video' ? <PlayCircle size={16} /> : <Link2 size={16} />)

  return (
    <>
      <div className="card" style={{ padding: 16, display: 'grid', gap: 12, boxShadow: 'none', border: '1px solid var(--border)' }}>
        <Field label="Título"><input value={title} placeholder="Ex.: Apostila do Módulo 1" onChange={(e) => setTitle(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn sm primary" disabled={busy} onClick={() => file.current?.click()}>
            {busy ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Enviar PDF
          </button>
          <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>ou cole um link (YouTube, Drive…):</span>
        </div>
        <input ref={file} type="file" accept="application/pdf" hidden onChange={(e) => void upload(e.target.files?.[0])} />
        <div className="fields-2">
          <Field label="Link"><input value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} /></Field>
          <Field label="Tipo">
            <select value={kind} onChange={(e) => setKind(e.target.value as AdminMaterial['kind'])}>
              <option value="link">Link</option>
              <option value="video">Vídeo</option>
              <option value="pdf">PDF</option>
            </select>
          </Field>
        </div>
        <button className="btn" disabled={!title.trim() || !/^https?:\/\//.test(url)} onClick={() => { onAdd({ courseId, title: title.trim(), url: url.trim(), kind }); setTitle(''); setUrl('') }}>
          Adicionar link
        </button>
        {err && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}
      </div>
      {materials.length === 0 ? (
        <div className="empty">Nenhum material ainda. Os alunos inscritos veem os materiais no app.</div>
      ) : (
        materials.map((m) => (
          <div key={m.id} className="cell-main" style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <div className="avatar" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>{icon(m.kind)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="t">{m.title}</div>
              <div className="s" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.url}</div>
            </div>
            <a className="btn sm ghost" href={m.url} target="_blank" rel="noreferrer" aria-label="Abrir"><ExternalLink size={13} /></a>
            <button className="btn sm ghost danger" aria-label="Remover material" onClick={() => confirm(`Remover "${m.title}"?`) && onRemove(m.id)}><Trash2 size={13} /></button>
          </div>
        ))
      )}
    </>
  )
}

/* ------------------------- QR da chamada ------------------------- */
function QrModal({ cls, courseTitle, onClose }: { cls: AdminClass; courseTitle: string; onClose: () => void }) {
  const [src, setSrc] = useState('')
  const url = checkInUrl(cls.code)
  useEffect(() => {
    void QRCode.toDataURL(url, { width: 640, margin: 1, color: { dark: '#0B0B0C', light: '#FFFFFF' }, errorCorrectionLevel: 'M' }).then(setSrc)
  }, [url])
  useEffect(() => {
    // Esc fecha só o QR (não a gaveta da turma por trás).
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [onClose])
  return (
    <div className="qr-full" role="dialog" aria-label="QR Code da chamada">
      <button className="btn icon" style={{ position: 'absolute', top: 20, right: 20 }} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
      <div className="qr-title">{courseTitle}</div>
      <h2>{cls.title}</h2>
      <div className="muted">Aponte a câmera do celular para registrar a presença</div>
      {src && <img src={src} alt="QR Code da chamada" />}
      <div className="qr-code">Código: <strong>{cls.code}</strong></div>
      <div className="muted" style={{ fontSize: 13 }}>A chamada fica aberta de 30 min antes do início até 30 min depois do fim ({hm(cls.startsAt)}–{hm(cls.endsAt)}).</div>
    </div>
  )
}

/* -------------------------- Chamada manual -------------------------- */
function RollCall({ cls, students, onToggle, onClose }: { cls: AdminClass; students: AdminStudent[]; onToggle: (userId: string, v: boolean) => void; onClose: () => void }) {
  return (
    <Drawer open title={`Chamada · ${cls.title}`} onClose={onClose}>
      <div className="muted" style={{ fontSize: 13 }}>{dt(cls.startsAt)} · {cls.attendees.length} de {students.length} presentes. Toque para marcar ou desmarcar.</div>
      {students.length === 0 ? (
        <div className="empty">Nenhum aluno inscrito.</div>
      ) : (
        students.map((s) => {
          const on = cls.attendees.includes(s.userId)
          return (
            <button key={s.userId} className="check-row" style={{ cursor: 'pointer', border: 0, textAlign: 'left' }} onClick={() => onToggle(s.userId, !on)}>
              <span>{s.name}</span>
              <Badge tone={on ? 'green' : 'gray'}>{on ? 'presente' : 'ausente'}</Badge>
            </button>
          )
        })
      )}
    </Drawer>
  )
}
