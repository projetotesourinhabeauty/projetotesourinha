import { supabase } from './supabase'

/** Loja no painel: produtos, pedidos e configuração (migração 0014). */
export interface AdminProduct {
  id?: string
  name: string
  description: string
  category: string
  price: number
  proPrice: number | null
  stock: number
  imageUrl?: string
  active: boolean
  sortOrder: number
}

export interface StoreSettings {
  open: boolean
  proDiscountPct: number
  pickupAddress: string
  deliveryEnabled: boolean
  deliveryFee: number
  onlinePayment: boolean
}

export type OrderStatus = 'novo' | 'pago' | 'separando' | 'pronto' | 'enviado' | 'entregue' | 'cancelado'

export interface AdminOrder {
  id: string
  number: number
  userName: string
  phone: string
  status: OrderStatus
  proPrice: boolean
  subtotal: number
  discount: number
  deliveryFee: number
  total: number
  delivery: 'retirada' | 'entrega'
  address?: string
  notes?: string
  createdAt: string
  items: { name: string; qty: number; unitPrice: number }[]
}

type Row = Record<string, any>
const sb = () => supabase!
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message)
}

const memory = {
  settings: { open: true, proDiscountPct: 15, pickupAddress: 'Retirada na Associação Tesourinha', deliveryEnabled: false, deliveryFee: 0, onlinePayment: false } as StoreSettings,
  products: [
    { id: 'd1', name: 'Tesoura profissional 6"', description: 'Aço inox, fio navalha.', category: 'Ferramentas', price: 189.9, proPrice: 149.9, stock: 8, active: true, sortOrder: 0 },
    { id: 'd2', name: 'Máscara de hidratação 1 kg', description: 'Tratamento profundo.', category: 'Cabelo', price: 79.9, proPrice: null, stock: 15, active: true, sortOrder: 0 },
  ] as AdminProduct[],
  orders: [] as AdminOrder[],
}

export async function getSettings(): Promise<StoreSettings> {
  if (!supabase) return { ...memory.settings }
  const { data, error } = await sb().from('store_settings').select('*').eq('id', 1).single()
  fail(error)
  return {
    open: data.open,
    proDiscountPct: data.pro_discount_pct,
    pickupAddress: data.pickup_address,
    deliveryEnabled: data.delivery_enabled,
    deliveryFee: Number(data.delivery_fee),
    onlinePayment: data.online_payment,
  }
}

export async function saveSettings(s: StoreSettings): Promise<void> {
  if (!supabase) {
    memory.settings = { ...s }
    return
  }
  fail(
    (
      await sb().from('store_settings').update({
        open: s.open,
        pro_discount_pct: s.proDiscountPct,
        pickup_address: s.pickupAddress,
        delivery_enabled: s.deliveryEnabled,
        delivery_fee: s.deliveryFee,
      }).eq('id', 1)
    ).error,
  )
}

export async function listProducts(): Promise<AdminProduct[]> {
  if (!supabase) return memory.products.map((p) => ({ ...p }))
  const { data, error } = await sb().from('products').select('*').order('category').order('sort_order').order('name')
  fail(error)
  return (data ?? []).map((p: Row) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    price: Number(p.price),
    proPrice: p.pro_price != null ? Number(p.pro_price) : null,
    stock: p.stock,
    imageUrl: p.image_url ?? undefined,
    active: p.active,
    sortOrder: p.sort_order,
  }))
}

export async function saveProduct(p: AdminProduct): Promise<void> {
  if (!p.name.trim()) throw new Error('Informe o nome do produto.')
  if (!(p.price > 0)) throw new Error('Informe o preço.')
  if (p.proPrice != null && !(p.proPrice > 0)) throw new Error('Preço Pro inválido.')
  if (!supabase) {
    if (p.id) memory.products = memory.products.map((x) => (x.id === p.id ? { ...p } : x))
    else memory.products.push({ ...p, id: String(Date.now()) })
    return
  }
  const row = {
    name: p.name.trim(),
    description: p.description.trim(),
    category: p.category.trim() || 'Outros',
    price: p.price,
    pro_price: p.proPrice,
    stock: Math.max(0, Math.round(p.stock)),
    image_url: p.imageUrl ?? null,
    active: p.active,
    sort_order: p.sortOrder,
  }
  fail((p.id ? await sb().from('products').update(row).eq('id', p.id) : await sb().from('products').insert(row)).error)
}

export async function listOrders(): Promise<AdminOrder[]> {
  if (!supabase) return memory.orders
  const { data, error } = await sb()
    .from('orders')
    .select('*, order_items(name, qty, unit_price), profiles(full_name, phone)')
    .order('created_at', { ascending: false })
    .limit(300)
  fail(error)
  return (data ?? []).map((o: Row) => ({
    id: o.id,
    number: o.number,
    userName: o.profiles?.full_name ?? 'Cliente',
    phone: o.profiles?.phone ?? '',
    status: o.status,
    proPrice: o.pro_price,
    subtotal: Number(o.subtotal),
    discount: Number(o.discount),
    deliveryFee: Number(o.delivery_fee),
    total: Number(o.total),
    delivery: o.delivery,
    address: o.address ?? undefined,
    notes: o.notes ?? undefined,
    createdAt: o.created_at,
    items: (o.order_items ?? []).map((i: Row) => ({ name: i.name, qty: i.qty, unitPrice: Number(i.unit_price) })),
  }))
}

/** Muda o status: o banco avisa o cliente, devolve estoque/cupom ao cancelar e dá pontos na entrega. */
export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  if (!supabase) {
    memory.orders = memory.orders.map((o) => (o.id === id ? { ...o, status } : o))
    return
  }
  const patch: Row = { status }
  if (status === 'pago') patch.payment_status = 'aprovado'
  fail((await sb().from('orders').update(patch).eq('id', id)).error)
}
