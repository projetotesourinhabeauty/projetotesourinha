import { useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Loja Tesourinha (migração 0014). Usada nos dois apps.
 * O preço Pro vale para profissional aprovado; preços, estoque e cupom são conferidos no banco.
 */
export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  proPrice: number;
  stock: number;
  imageUrl?: string;
}

export interface ShopSettings {
  open: boolean;
  proDiscountPct: number;
  pickupAddress: string;
  deliveryEnabled: boolean;
  deliveryFee: number;
  onlinePayment: boolean;
}

export interface Shop {
  settings: ShopSettings;
  products: Product[];
  isPro: boolean;
}

export type OrderStatus = 'novo' | 'pago' | 'separando' | 'pronto' | 'enviado' | 'entregue' | 'cancelado';

export interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  total: number;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  delivery: 'retirada' | 'entrega';
  proPrice: boolean;
  createdAt: string;
  items: { name: string; qty: number; unitPrice: number }[];
}

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'brand' | 'success' | 'danger' | 'neutral' | 'dark' }> = {
  novo: { label: 'Recebido', tone: 'brand' },
  pago: { label: 'Pago', tone: 'success' },
  separando: { label: 'Separando', tone: 'brand' },
  pronto: { label: 'Pronto p/ retirar', tone: 'success' },
  enviado: { label: 'Saiu p/ entrega', tone: 'brand' },
  entregue: { label: 'Entregue', tone: 'neutral' },
  cancelado: { label: 'Cancelado', tone: 'danger' },
};

type Row = Record<string, any>;
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};

export async function loadShop(): Promise<Shop> {
  if (!supabase) return { settings: demoSettings, products: demoProducts, isPro: demoIsPro };
  const { data: auth } = await supabase.auth.getUser();
  const [cfg, prods, pro] = await Promise.all([
    supabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('products').select('*').eq('active', true).order('category').order('sort_order').order('name'),
    auth.user ? supabase.rpc('is_pro_buyer') : Promise.resolve({ data: false, error: null }),
  ]);
  fail(cfg.error);
  fail(prods.error);
  const c = (cfg.data ?? {}) as Row;
  const pct = c.pro_discount_pct ?? 0;
  return {
    settings: {
      open: c.open ?? false,
      proDiscountPct: pct,
      pickupAddress: c.pickup_address ?? '',
      deliveryEnabled: !!c.delivery_enabled,
      deliveryFee: Number(c.delivery_fee ?? 0),
      onlinePayment: !!c.online_payment,
    },
    products: (prods.data ?? []).map((p: Row) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? '',
      category: p.category,
      price: Number(p.price),
      proPrice: p.pro_price != null ? Number(p.pro_price) : Math.round(Number(p.price) * (100 - pct)) / 100,
      stock: p.stock,
      imageUrl: p.image_url ?? undefined,
    })),
    isPro: !!pro.data,
  };
}

export async function placeOrder(input: { items: CartItem[]; coupon?: string; delivery: 'retirada' | 'entrega'; address?: string; notes?: string }) {
  if (!supabase) {
    const items = input.items.map((i) => {
      const p = demoProducts.find((x) => x.id === i.productId)!;
      return { name: p.name, qty: i.qty, unitPrice: demoIsPro ? p.proPrice : p.price };
    });
    const subtotal = items.reduce((a, i) => a + i.unitPrice * i.qty, 0);
    const o: Order = { id: String(Date.now()), number: demoOrders.length + 1, status: 'novo', subtotal, discount: 0, deliveryFee: 0, total: subtotal, delivery: input.delivery, proPrice: demoIsPro, createdAt: new Date().toISOString(), items };
    demoOrders.unshift(o);
    return { id: o.id, number: o.number, total: o.total };
  }
  const { data, error } = await supabase.rpc('place_order', {
    p_items: input.items.map((i) => ({ product_id: i.productId, qty: i.qty })),
    p_coupon: input.coupon || null,
    p_delivery: input.delivery,
    p_address: input.address || null,
    p_payment: 'retirada',
    p_notes: input.notes || null,
  });
  fail(error);
  const d = data as Row;
  return { id: d.id as string, number: d.number as number, total: Number(d.total) };
}

export async function listOrders(): Promise<Order[]> {
  if (!supabase) return demoOrders;
  const { data, error } = await supabase
    .from('orders')
    .select('id, number, status, total, subtotal, discount, delivery_fee, delivery, pro_price, created_at, order_items(name, qty, unit_price)')
    .order('created_at', { ascending: false })
    .limit(50);
  fail(error);
  return (data ?? []).map((o: Row) => ({
    id: o.id,
    number: o.number,
    status: o.status,
    total: Number(o.total),
    subtotal: Number(o.subtotal),
    discount: Number(o.discount),
    deliveryFee: Number(o.delivery_fee),
    delivery: o.delivery,
    proPrice: o.pro_price,
    createdAt: o.created_at,
    items: (o.order_items ?? []).map((i: Row) => ({ name: i.name, qty: i.qty, unitPrice: Number(i.unit_price) })),
  }));
}

export async function cancelOrder(id: string): Promise<void> {
  if (!supabase) {
    const o = demoOrders.find((x) => x.id === id);
    if (o) o.status = 'cancelado';
    return;
  }
  fail((await supabase.rpc('cancel_my_order', { p_order: id })).error);
}

/* ------------------------------ carrinho ------------------------------ */
export interface CartItem {
  productId: string;
  qty: number;
}
let cart: CartItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const cartStore = {
  add(productId: string, qty = 1) {
    const found = cart.find((i) => i.productId === productId);
    cart = found ? cart.map((i) => (i.productId === productId ? { ...i, qty: i.qty + qty } : i)) : [...cart, { productId, qty }];
    emit();
  },
  set(productId: string, qty: number) {
    cart = qty <= 0 ? cart.filter((i) => i.productId !== productId) : cart.map((i) => (i.productId === productId ? { ...i, qty } : i));
    emit();
  },
  clear() {
    cart = [];
    emit();
  },
};

export function useCart(): CartItem[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => cart,
    () => cart,
  );
}

/* ---------------------------- demonstração ---------------------------- */
const demoIsPro = false;
const demoOrders: Order[] = [];
const demoSettings: ShopSettings = { open: true, proDiscountPct: 15, pickupAddress: 'Retirada na Associação Tesourinha', deliveryEnabled: false, deliveryFee: 0, onlinePayment: false };
const demoProducts: Product[] = [
  { id: 'd1', name: 'Tesoura profissional 6"', description: 'Aço inox, fio navalha, ideal para corte a seco e molhado.', category: 'Ferramentas', price: 189.9, proPrice: 149.9, stock: 8 },
  { id: 'd2', name: 'Kit pentes de carbono', description: '6 pentes antiestáticos resistentes ao calor.', category: 'Ferramentas', price: 49.9, proPrice: 42.4, stock: 20 },
  { id: 'd3', name: 'Máscara de hidratação 1 kg', description: 'Tratamento profundo para uso no salão.', category: 'Cabelo', price: 79.9, proPrice: 67.9, stock: 15 },
  { id: 'd4', name: 'Esmalte gel (cor única)', description: 'Alta duração, secagem em cabine UV/LED.', category: 'Unhas', price: 24.9, proPrice: 21.2, stock: 0 },
];

/** Cupons de pontos ainda válidos do usuário logado. */
export async function myCoupons(): Promise<{ code: string; value: number; expiresAt: string }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('coupons')
    .select('code, value, expires_at')
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at');
  fail(error);
  return (data ?? []).map((c: Row) => ({ code: c.code, value: Number(c.value), expiresAt: c.expires_at }));
}
