import { Pencil, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge, Drawer, Field, ImageUpload, PageHeader, Segmented, Switch, useToast, type Tone } from '../components/ui'
import { getSettings, listOrders, listProducts, saveProduct, saveSettings, setOrderStatus, type AdminOrder, type AdminProduct, type OrderStatus, type StoreSettings } from '../data/shop'
import { useStore } from '../data/store'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  novo: { label: 'Novo', tone: 'orange' },
  pago: { label: 'Pago', tone: 'green' },
  separando: { label: 'Separando', tone: 'blue' },
  pronto: { label: 'Pronto p/ retirar', tone: 'green' },
  enviado: { label: 'Saiu p/ entrega', tone: 'blue' },
  entregue: { label: 'Entregue', tone: 'gray' },
  cancelado: { label: 'Cancelado', tone: 'red' },
}
const NEXT: Partial<Record<OrderStatus, (o: AdminOrder) => OrderStatus>> = {
  novo: () => 'separando',
  pago: () => 'separando',
  separando: (o) => (o.delivery === 'retirada' ? 'pronto' : 'enviado'),
  pronto: () => 'entregue',
  enviado: () => 'entregue',
}
const blank = (): AdminProduct => ({ name: '', description: '', category: 'Cabelo', price: 0, proPrice: null, stock: 0, active: true, sortOrder: 0, featured: false })

/** Loja Tesourinha: pedidos, produtos com preço Pro e configuração. */
export default function StorePage() {
  const { upload } = useStore()
  const toast = useToast()
  const [tab, setTab] = useState<'pedidos' | 'produtos' | 'config'>('pedidos')
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [products, setProducts] = useState<AdminProduct[]>([])
  const [settings, setSettings] = useState<StoreSettings | null>(null)
  const [filter, setFilter] = useState<'abertos' | 'todos'>('abertos')
  const [edit, setEdit] = useState<AdminProduct | null>(null)
  const [view, setView] = useState<AdminOrder | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setError('')
      const [o, p, s] = await Promise.all([listOrders(), listProducts(), getSettings()])
      setOrders(o)
      setProducts(p)
      setSettings(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const run = async (fn: () => Promise<void>, msg: string) => {
    setSaving(true)
    try {
      await fn()
      toast(msg)
      await load()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setSaving(false)
    }
  }

  const shown = useMemo(() => orders.filter((o) => filter === 'todos' || !['entregue', 'cancelado'].includes(o.status)), [orders, filter])
  const open = orders.filter((o) => !['entregue', 'cancelado'].includes(o.status)).length
  const proPriceOf = (p: AdminProduct) => p.proPrice ?? Math.round(p.price * (100 - (settings?.proDiscountPct ?? 0))) / 100

  const move = (o: AdminOrder, s: OrderStatus) =>
    void run(() => setOrderStatus(o.id, s), `Pedido #${o.number}: ${STATUS[s].label}`).then((ok) => ok && setView(null))

  return (
    <>
      <PageHeader title="Loja" subtitle="Produtos com preço Pro para profissionais aprovados · pagamento na retirada">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pedidos', label: `Pedidos (${open})` },
            { value: 'produtos', label: `Produtos (${products.length})` },
            { value: 'config', label: 'Configurações' },
          ]}
        />
        {tab === 'produtos' && <button className="btn primary" onClick={() => setEdit(blank())}><Plus size={16} /> Novo produto</button>}
      </PageHeader>

      {error && <div className="alert">{error}</div>}

      {tab === 'pedidos' && (
        <div className="card">
          <div className="toolbar">
            <Segmented value={filter} onChange={setFilter} options={[{ value: 'abertos', label: 'Em aberto' }, { value: 'todos', label: 'Todos' }]} />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Itens</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <div className="t" style={{ fontWeight: 600 }}>#{o.number}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{new Date(o.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td>
                      <div>{o.userName} {o.proPrice && <Badge tone="gray">Pro</Badge>}</div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{o.phone} · {o.delivery === 'retirada' ? 'Retirada' : 'Entrega'}</div>
                    </td>
                    <td className="muted">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</td>
                    <td style={{ fontWeight: 600 }}>
                      {brl(o.total)}
                      <div className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
                        {o.paymentMethod === 'mercadopago' ? `Online · ${{ pendente: 'aguardando', aprovado: 'pago', recusado: 'recusado', estornado: 'estornado' }[o.paymentStatus]}` : 'Na retirada'}
                      </div>
                    </td>
                    <td><Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge></td>
                    <td className="right"><button className="btn sm" onClick={() => setView(o)}>Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.length === 0 && <div className="empty">Nenhum pedido {filter === 'abertos' ? 'em aberto' : 'ainda'}.</div>}
          </div>
        </div>
      )}

      {tab === 'produtos' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Preço</th>
                  <th>Preço Pro</th>
                  <th>Estoque</th>
                  <th>Na loja</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-main">
                        {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover' }} /> : <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FFF1E8' }} />}
                        <span className="t" style={{ fontWeight: 600 }}>{p.name}</span>
                      </div>
                    </td>
                    <td className="muted">{p.category}{p.featured && <> <Badge tone="orange">Destaque</Badge></>}</td>
                    <td>{brl(p.price)}</td>
                    <td>{brl(proPriceOf(p))} {p.proPrice == null && <span className="muted" style={{ fontSize: 12 }}>(padrão)</span>}</td>
                    <td>{p.stock === 0 ? <Badge tone="red">Esgotado</Badge> : p.stock}</td>
                    <td><Switch on={p.active} label={`Mostrar ${p.name}`} onChange={(v) => void run(() => saveProduct({ ...p, active: v }), v ? 'Produto visível' : 'Produto oculto')} /></td>
                    <td className="right"><button className="btn sm" onClick={() => setEdit({ ...p })}><Pencil size={13} /> Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {products.length === 0 && <div className="empty">Nenhum produto cadastrado. Clique em “Novo produto”.</div>}
          </div>
        </div>
      )}

      {tab === 'config' && settings && (
        <div className="card" style={{ padding: 22, display: 'grid', gap: 16, maxWidth: 560 }}>
          <div className="check-row">Loja aberta <Switch on={settings.open} onChange={(v) => setSettings({ ...settings, open: v })} /></div>
          <Field label="Vitrine: produtos por linha no app">
            <Segmented<'1' | '2'> value={String(settings.gridColumns) as '1' | '2'} onChange={(v) => setSettings({ ...settings, gridColumns: v === '1' ? 1 : 2 })} options={[{ value: '2', label: '2 por linha' }, { value: '1', label: '1 por linha (grande)' }]} />
          </Field>
          <Field label="Banner: título">
            <input value={settings.bannerTitle} onChange={(e) => setSettings({ ...settings, bannerTitle: e.target.value })} />
          </Field>
          <Field label="Banner: texto">
            <input value={settings.bannerSubtitle} onChange={(e) => setSettings({ ...settings, bannerSubtitle: e.target.value })} />
          </Field>
          <Field label="Banner: foto (opcional)">
            <div style={{ display: 'grid', gap: 8 }}>
              {settings.bannerImageUrl && <img src={settings.bannerImageUrl} alt="" className="cover-preview" />}
              <ImageUpload value={settings.bannerImageUrl} onChange={(url) => setSettings({ ...settings, bannerImageUrl: url })} upload={(f) => upload(f, 'banner-loja')} label="Enviar foto do banner" hint="Sem foto, o app usa uma imagem padrão de produtos de beleza." />
            </div>
          </Field>
          <Field label="Desconto Pro padrão (%)">
            <input type="number" min={0} max={90} value={settings.proDiscountPct} onChange={(e) => setSettings({ ...settings, proDiscountPct: Math.min(90, Math.max(0, Number(e.target.value) || 0)) })} />
          </Field>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Vale para produtos sem “Preço Pro” próprio. Só profissional aprovado e ativo compra com esse preço.</p>
          <Field label="Onde retirar">
            <input value={settings.pickupAddress} onChange={(e) => setSettings({ ...settings, pickupAddress: e.target.value })} />
          </Field>
          <div className="check-row">Fazer entregas <Switch on={settings.deliveryEnabled} onChange={(v) => setSettings({ ...settings, deliveryEnabled: v })} /></div>
          {settings.deliveryEnabled && (
            <Field label="Taxa de entrega (R$)">
              <input type="number" min={0} step={0.5} value={settings.deliveryFee} onChange={(e) => setSettings({ ...settings, deliveryFee: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
          )}
          <div className="check-row">Pagamento online (Pix e cartão pelo Mercado Pago) <Switch on={settings.onlinePayment} onChange={(v) => setSettings({ ...settings, onlinePayment: v })} /></div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Ligue só depois de cadastrar o Access Token do Mercado Pago no Supabase (Edge Functions › Secrets › MP_ACCESS_TOKEN). Desligado, o cliente paga na retirada.</p>          <div><button className="btn primary" disabled={saving} onClick={() => void run(() => saveSettings(settings), 'Configurações salvas')}>Salvar</button></div>
        </div>
      )}

      {/* Produto */}
      <Drawer
        title={edit?.id ? 'Editar produto' : 'Novo produto'}
        open={!!edit}
        onClose={() => setEdit(null)}
        footer={
          <>
            <button className="btn ghost" onClick={() => setEdit(null)}>Cancelar</button>
            <button className="btn primary" disabled={saving || !edit?.name.trim() || !(edit.price > 0)} onClick={() => edit && void run(() => saveProduct(edit), 'Produto salvo').then((ok) => ok && setEdit(null))}>Salvar</button>
          </>
        }>
        {edit && (
          <>
            {edit.imageUrl && <img src={edit.imageUrl} alt="" className="cover-preview" />}
            <ImageUpload value={edit.imageUrl} onChange={(url) => setEdit({ ...edit, imageUrl: url })} upload={(f) => upload(f, 'produto')} label="Enviar foto do produto" hint="Foto quadrada, fundo claro. JPG, PNG ou WebP até 5 MB." />
            <Field label="Nome"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Ex.: Tesoura profissional 6”" /></Field>
            <Field label="Descrição"><textarea rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <div className="fields-2">
              <Field label="Categoria">
                <input list="cats" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
                <datalist id="cats">{[...new Set(['Cabelo', 'Unhas', 'Pele', 'Ferramentas', 'Maquiagem', ...products.map((p) => p.category)])].map((c) => <option key={c} value={c} />)}</datalist>
              </Field>
              <Field label="Estoque"><input type="number" min={0} value={edit.stock} onChange={(e) => setEdit({ ...edit, stock: Number(e.target.value) })} /></Field>
            </div>
            <div className="fields-2">
              <Field label="Preço (R$)"><input type="number" min={0} step={0.1} value={edit.price || ''} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></Field>
              <Field label={`Preço Pro (vazio = -${settings?.proDiscountPct ?? 0}%)`}>
                <input type="number" min={0} step={0.1} value={edit.proPrice ?? ''} placeholder={edit.price ? brl(proPriceOf({ ...edit, proPrice: null })) : ''} onChange={(e) => setEdit({ ...edit, proPrice: e.target.value === '' ? null : Number(e.target.value) })} />
              </Field>
            </div>
            <div className="check-row">Visível na loja <Switch on={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} /></div>
            <div className="check-row">Destaque na vitrine <Switch on={edit.featured} onChange={(v) => setEdit({ ...edit, featured: v })} /></div>
          </>
        )}
      </Drawer>

      {/* Pedido */}
      <Drawer
        title={view ? `Pedido #${view.number}` : ''}
        open={!!view}
        onClose={() => setView(null)}
        footer={
          view && !['entregue', 'cancelado'].includes(view.status) ? (
            <>
              <button className="btn ghost" style={{ color: '#FF3B30' }} disabled={saving} onClick={() => window.confirm(`Cancelar o pedido #${view.number}? O estoque e o cupom voltam.`) && move(view, 'cancelado')}>Cancelar pedido</button>
              {NEXT[view.status] && (
                <button className="btn primary" disabled={saving} onClick={() => move(view, NEXT[view.status]!(view))}>Marcar “{STATUS[NEXT[view.status]!(view)].label}”</button>
              )}
            </>
          ) : undefined
        }>
        {view && (
          <>
            <div className="check-row">
              <div>
                <strong>{view.userName}</strong>
                <div className="muted" style={{ fontSize: 12.5 }}>{view.phone}{view.proPrice ? ' · comprou com preço Pro' : ''}</div>
              </div>
              <Badge tone={STATUS[view.status].tone}>{STATUS[view.status].label}</Badge>
            </div>
            <table>
              <tbody>
                {view.items.map((i, k) => (
                  <tr key={k}><td>{i.qty}× {i.name}</td><td className="right">{brl(i.unitPrice * i.qty)}</td></tr>
                ))}
                <tr><td className="muted">Produtos</td><td className="right">{brl(view.subtotal)}</td></tr>
                {view.discount > 0 && <tr><td className="muted">Cupom de pontos</td><td className="right" style={{ color: '#34C759' }}>- {brl(view.discount)}</td></tr>}
                {view.deliveryFee > 0 && <tr><td className="muted">Entrega</td><td className="right">{brl(view.deliveryFee)}</td></tr>}
                <tr><td><strong>Total</strong></td><td className="right"><strong>{brl(view.total)}</strong></td></tr>
              </tbody>
            </table>
            <Field label="Entrega"><div>{view.delivery === 'retirada' ? 'Retirada' : `Entrega: ${view.address ?? ''}`}</div></Field>
            {view.notes && <Field label="Observação"><div>{view.notes}</div></Field>}
            {view.status === 'novo' && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Pagamento na retirada. O cliente recebe um aviso a cada mudança de status e ganha pontos quando o pedido é entregue.</p>}
          </>
        )}
      </Drawer>
    </>
  )
}
