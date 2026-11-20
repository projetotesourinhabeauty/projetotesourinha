import { Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Avatar, Badge, Drawer, Field, PageHeader, Segmented, Switch, useToast } from '../components/ui'
import { adjust, balanceOf, listEntries, listRules, saveRule, type Entry, type Rule } from '../data/points'
import { fmtDate, useStore } from '../data/store'

/** Pontos "Tesourinhas": quanto vale cada ação, extrato geral e ajustes manuais. */
export default function Points() {
  const { db } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState<'regras' | 'extrato'>('regras')
  const [rules, setRules] = useState<Rule[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  const load = useCallback(async () => {
    try {
      setError('')
      const [r, e] = await Promise.all([listRules(), listEntries()])
      setRules(r)
      setEntries(e)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const update = async (r: Rule) => {
    setRules((rs) => rs.map((x) => (x.key === r.key ? r : x)))
    try {
      await saveRule(r)
      toast('Regra salva')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const issued = entries.filter((e) => e.delta > 0).reduce((a, e) => a + e.delta, 0)
  const redeemed = -entries.filter((e) => e.reason === 'resgate').reduce((a, e) => a + e.delta, 0)

  return (
    <>
      <PageHeader title="Pontos e níveis" subtitle="Tesourinhas: 100 pontos = R$ 5,00 em cupom · Prata a partir de 500 e Ouro a partir de 1.500 pontos no ano">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'regras', label: 'Regras' }, { value: 'extrato', label: 'Extrato' }]} />
        <button className="btn primary" onClick={() => setAdjusting(true)}><Plus size={16} /> Ajuste manual</button>
      </PageHeader>

      {error && <div className="alert">{error}</div>}

      {tab === 'regras' ? (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ação que dá pontos</th>
                  <th style={{ width: 140 }}>Pontos</th>
                  <th style={{ width: 90 }}>Ativa</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.key}>
                    <td><span className="t" style={{ fontWeight: 600 }}>{r.label}</span></td>
                    <td>
                      <div className="field" style={{ margin: 0 }}>
                        <input
                          type="number"
                          min={0}
                          step={10}
                          defaultValue={r.points}
                          aria-label={`Pontos para ${r.label}`}
                          onBlur={(e) => {
                            const v = Math.max(0, Math.round(Number(e.target.value) || 0))
                            if (v !== r.points) void update({ ...r, points: v })
                          }}
                        />
                      </div>
                    </td>
                    <td><Switch on={r.active} label={`Ativar ${r.label}`} onChange={(v) => void update({ ...r, active: v })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rules.length === 0 && !error && <div className="empty">Carregando regras…</div>}
          </div>
          <p className="muted" style={{ padding: '12px 18px 16px', fontSize: 13 }}>
            Os pontos valem por 12 meses. Mudanças valem para os próximos créditos; os já lançados não mudam.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="toolbar" style={{ gap: 24 }}>
            <div><div className="muted" style={{ fontSize: 12.5 }}>Pontos distribuídos</div><strong style={{ fontSize: 20 }}>{issued.toLocaleString('pt-BR')}</strong></div>
            <div><div className="muted" style={{ fontSize: 12.5 }}>Trocados por cupom</div><strong style={{ fontSize: 20 }}>{redeemed.toLocaleString('pt-BR')}</strong></div>
            <div><div className="muted" style={{ fontSize: 12.5 }}>Em cupons</div><strong style={{ fontSize: 20 }}>{(redeemed / 20).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Motivo</th>
                  <th>Data</th>
                  <th className="right">Pontos</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td><div className="cell-main"><Avatar name={e.userName} color="#3A3A3C" /><span className="t">{e.userName}</span></div></td>
                    <td>
                      <div>{e.description}</div>
                      {e.reason === 'ajuste' && <Badge tone="blue">ajuste</Badge>}
                    </td>
                    <td className="muted">{fmtDate(e.createdAt.slice(0, 10))}</td>
                    <td className="right" style={{ fontWeight: 700, color: e.delta > 0 ? '#34C759' : undefined }}>{e.delta > 0 ? `+${e.delta}` : e.delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entries.length === 0 && <div className="empty">Nenhum ponto lançado ainda.</div>}
          </div>
        </div>
      )}

      <AdjustDrawer
        open={adjusting}
        users={db.users}
        onClose={() => setAdjusting(false)}
        onDone={() => {
          setAdjusting(false)
          toast('Pontos lançados')
          void load()
        }}
      />
    </>
  )
}

function AdjustDrawer({ open, users, onClose, onDone }: { open: boolean; users: { id: string; name: string; email: string }[]; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('')
  const [userId, setUserId] = useState('')
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const [bal, setBal] = useState<{ balance: number; level: string } | null>(null)

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? users.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(s)).slice(0, 8) : []
  }, [q, users])
  const user = users.find((u) => u.id === userId)

  useEffect(() => {
    setBal(null)
    if (userId) void balanceOf(userId).then(setBal).catch(() => {})
  }, [userId])
  useEffect(() => {
    if (!open) {
      setQ(''); setUserId(''); setDelta(''); setReason(''); setErr('')
    }
  }, [open])

  const submit = async () => {
    if (!user) return setErr('Escolha a pessoa.')
    setSaving(true)
    try {
      await adjust(user.id, user.name, Math.round(Number(delta)), reason)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      title="Ajuste manual de pontos"
      open={open}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={saving || !user || !Number(delta) || !reason.trim()} onClick={() => void submit()}>{saving ? 'Lançando…' : 'Lançar'}</button>
        </>
      }>
      <>
        {user ? (
          <div className="check-row">
            <div>
              <strong>{user.name}</strong>
              <div className="muted" style={{ fontSize: 12.5 }}>{user.email}{bal ? ` · saldo ${bal.balance} · ${bal.level}` : ''}</div>
            </div>
            <button className="btn sm" onClick={() => setUserId('')}>Trocar</button>
          </div>
        ) : (
          <Field label="Pessoa">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou e-mail" autoFocus />
            {matches.map((u) => (
              <button key={u.id} type="button" className="btn ghost" style={{ justifyContent: 'flex-start' }} onClick={() => setUserId(u.id)}>
                {u.name} <span className="muted" style={{ fontSize: 12.5 }}>{u.email}</span>
              </button>
            ))}
          </Field>
        )}
        <Field label="Pontos (use negativo para descontar)">
          <input type="number" step={10} value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="Ex.: 100 ou -50" />
        </Field>
        <Field label="Motivo (aparece no extrato da pessoa)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: Bônus de boas-vindas" />
        </Field>
        {err && <div className="alert">{err}</div>}
      </>
    </Drawer>
  )
}
