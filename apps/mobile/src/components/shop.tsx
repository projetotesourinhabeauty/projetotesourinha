import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen, ScreenHeader, Sheet } from '@/components/screen';
import { Badge, Button, Card, Chip, EmptyState, IconTile, ListGroup, ListRow, PressableScale, SectionHeader, Text } from '@/components/ui';
import { money } from '@/data/points';
import { ORDER_STATUS, cancelOrder, cartStore, listOrders, loadShop, myCoupons, placeOrder, useCart, type Order, type Product, type Shop } from '@/data/shop';
import { confirm, notify } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import { isRemote } from '@/lib/supabase';
import { colors, radius, spacing } from '@/theme';

function useShop() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setError('');
      setShop(await loadShop());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return { shop, error, load };
}

const unitPrice = (p: Product, pro: boolean) => (pro ? p.proPrice : p.price);

function CartButton() {
  const cart = useCart();
  const n = cart.reduce((a, i) => a + i.qty, 0);
  return (
    <PressableScale
      onPress={() => router.push('/cart')}
      accessibilityLabel={n ? `Carrinho, ${n} itens` : 'Carrinho'}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="cart-outline" size={22} color={colors.white} />
      {n > 0 && (
        <View style={{ position: 'absolute', top: 4, right: 4, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="caption" weight="700" color={colors.white} style={{ fontSize: 10, lineHeight: 12 }}>{n}</Text>
        </View>
      )}
    </PressableScale>
  );
}

/* ------------------------------------------------------------------ */
/* Vitrine                                                             */
/* ------------------------------------------------------------------ */
export function ShopScreen() {
  const { shop, error, load } = useShop();
  const [cat, setCat] = useState('Todos');
  const [refreshing, setRefreshing] = useState(false);
  const cart = useCart();
  const cats = useMemo(() => ['Todos', ...new Set((shop?.products ?? []).map((p) => p.category))], [shop]);
  const list = (shop?.products ?? []).filter((p) => cat === 'Todos' || p.category === cat);
  const pro = !!shop?.isPro;

  return (
    <Screen>
      <ScreenHeader title="Loja Tesourinha" subtitle={pro ? 'Você compra com preço Pro' : 'Produtos para beleza e para o salão'} right={<CartButton />} />
      <Sheet
        contentStyle={{ gap: spacing.xl, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {!shop && !error ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />
        ) : error || !shop ? (
          <EmptyState icon="cloud-offline-outline" title="Não foi possível carregar" text={error} action="Tentar de novo" onAction={() => void load()} />
        ) : !shop.settings.open ? (
          <EmptyState icon="bag-handle-outline" title="Loja fechada" text="A loja está fechada no momento. Volte em breve!" />
        ) : shop.products.length === 0 ? (
          <EmptyState icon="bag-handle-outline" title="Em breve" text="Os produtos da Loja Tesourinha aparecem aqui assim que forem cadastrados." />
        ) : (
          <>
            {pro ? (
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.black }}>
                <Icon name="ribbon" size={22} color={colors.brand} />
                <Text variant="subhead" color={colors.white} style={{ flex: 1 }}>Preço Pro aplicado: profissionais aprovados pagam menos em todos os produtos.</Text>
              </View>
            ) : (
              <Text variant="footnote" color={colors.textSecondary}>
                Profissional aprovado no app Tesourinha Pro compra com até {shop.settings.proDiscountPct}% de desconto.
              </Text>
            )}
            {cats.length > 2 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {cats.map((c) => <Chip key={c} label={c} active={c === cat} onPress={() => setCat(c)} />)}
              </View>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
              {list.map((p) => {
                const inCart = cart.find((i) => i.productId === p.id)?.qty ?? 0;
                const out = p.stock <= 0;
                return (
                  <View key={p.id} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' }}>
                    <View style={{ aspectRatio: 1, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
                      {p.imageUrl ? <Image source={{ uri: p.imageUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} /> : <IconTile icon="bag-handle" size={56} />}
                      {out && <View style={{ position: 'absolute', top: 8, left: 8 }}><Badge label="ESGOTADO" tone="dark" /></View>}
                    </View>
                    <View style={{ padding: spacing.md, gap: 4, flex: 1 }}>
                      <Text variant="subhead" weight="600" numberOfLines={2}>{p.name}</Text>
                      {!!p.description && <Text variant="caption" color={colors.textSecondary} numberOfLines={2}>{p.description}</Text>}
                      <View style={{ flex: 1 }} />
                      {pro && p.proPrice < p.price && <Text variant="caption" color={colors.textTertiary} style={{ textDecorationLine: 'line-through' }}>{money(p.price)}</Text>}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text variant="headline" color={colors.brand}>{money(unitPrice(p, pro))}</Text>
                        <PressableScale
                          disabled={out || inCart >= p.stock}
                          onPress={() => { haptic.success(); cartStore.add(p.id); }}
                          accessibilityLabel={`Adicionar ${p.name} ao carrinho`}
                          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: out ? colors.border : colors.brand, alignItems: 'center', justifyContent: 'center' }}>
                          {inCart ? <Text variant="footnote" weight="700" color={colors.white}>{inCart}</Text> : <Icon name="add" size={20} color={colors.white} />}
                        </PressableScale>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </Sheet>
      {cart.length > 0 && (
        <View style={{ position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.xxl }}>
          <Button title={`Ver carrinho (${cart.reduce((a, i) => a + i.qty, 0)})`} icon="cart-outline" variant="dark" onPress={() => router.push('/cart')} />
        </View>
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Carrinho e fechamento                                               */
/* ------------------------------------------------------------------ */
export function CartScreen() {
  const { shop, error, load } = useShop();
  const cart = useCart();
  const [coupons, setCoupons] = useState<{ code: string; value: number; expiresAt: string }[]>([]);
  const [coupon, setCoupon] = useState('');
  const [delivery, setDelivery] = useState<'retirada' | 'entrega'>('retirada');
  const [address, setAddress] = useState('');
  const [sending, setSending] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void myCoupons().then(setCoupons).catch(() => {});
    }, []),
  );

  const pro = !!shop?.isPro;
  const lines = cart
    .map((i) => ({ ...i, p: shop?.products.find((p) => p.id === i.productId) }))
    .filter((l): l is typeof l & { p: Product } => !!l.p);
  const subtotal = lines.reduce((a, l) => a + unitPrice(l.p, pro) * l.qty, 0);
  const off = Math.min(coupons.find((c) => c.code === coupon)?.value ?? 0, subtotal);
  const fee = delivery === 'entrega' ? shop?.settings.deliveryFee ?? 0 : 0;
  const total = subtotal - off + fee;

  const submit = async () => {
    if (!isRemote && !shop) return;
    setSending(true);
    try {
      const o = await placeOrder({ items: cart, coupon, delivery, address });
      cartStore.clear();
      haptic.success();
      notify(`Pedido #${o.number} recebido!`, delivery === 'retirada' ? `Total ${money(o.total)}. Avisaremos quando estiver pronto para retirar.` : `Total ${money(o.total)}. Avisaremos quando sair para entrega.`);
      router.replace('/orders');
    } catch (e) {
      haptic.warning();
      notify('Não foi possível fechar o pedido', e instanceof Error ? e.message : String(e));
      void load();
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader title="Carrinho" subtitle={pro ? 'Com preço Pro' : undefined} />
      <Sheet contentStyle={{ gap: spacing.xxl, paddingBottom: 160 }}>
        {!shop && !error ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />
        ) : error || !shop ? (
          <EmptyState icon="cloud-offline-outline" title="Não foi possível carregar" text={error} action="Tentar de novo" onAction={() => void load()} />
        ) : lines.length === 0 ? (
          <EmptyState icon="cart-outline" title="Carrinho vazio" text="Escolha seus produtos na Loja Tesourinha." action="Ver a loja" onAction={() => router.replace('/shop')} />
        ) : (
          <>
            <ListGroup>
              {lines.map((l) => (
                <ListRow
                  key={l.productId}
                  left={<IconTile icon="bag-handle" size={36} />}
                  title={l.p.name}
                  subtitle={`${money(unitPrice(l.p, pro))} cada`}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Stepper icon="remove" label={`Tirar um ${l.p.name}`} onPress={() => cartStore.set(l.productId, l.qty - 1)} />
                      <Text variant="headline" style={{ minWidth: 20, textAlign: 'center' }}>{l.qty}</Text>
                      <Stepper icon="add" label={`Mais um ${l.p.name}`} disabled={l.qty >= l.p.stock} onPress={() => cartStore.set(l.productId, l.qty + 1)} />
                    </View>
                  }
                />
              ))}
            </ListGroup>

            <View>
              <SectionHeader title="Entrega" />
              <ListGroup>
                <ListRow icon="location-outline" title="Retirar" subtitle={shop.settings.pickupAddress} onPress={() => setDelivery('retirada')} right={<Radio on={delivery === 'retirada'} />} />
                {shop.settings.deliveryEnabled && (
                  <ListRow icon="paper-plane" title="Receber em casa" subtitle={`Taxa ${money(shop.settings.deliveryFee)}`} onPress={() => setDelivery('entrega')} right={<Radio on={delivery === 'entrega'} />} />
                )}
              </ListGroup>
              {delivery === 'entrega' && (
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Rua, número, bairro e complemento"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  style={{ marginTop: spacing.md, minHeight: 64, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface, color: colors.text, fontSize: 16 }}
                />
              )}
            </View>

            {coupons.length > 0 && (
              <View>
                <SectionHeader title="Cupom de pontos" />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                  {coupons.map((c) => (
                    <Chip key={c.code} icon="pricetag" label={`${money(c.value)} · ${c.code}`} active={coupon === c.code} onPress={() => setCoupon(coupon === c.code ? '' : c.code)} />
                  ))}
                </View>
              </View>
            )}

            <Card style={{ gap: spacing.sm }}>
              <Line label="Produtos" value={money(subtotal)} />
              {off > 0 && <Line label="Cupom" value={`- ${money(off)}`} color={colors.success} />}
              {fee > 0 && <Line label="Entrega" value={money(fee)} />}
              <View style={{ height: 1, backgroundColor: colors.separator, marginVertical: 4 }} />
              <Line label="Total" value={money(total)} bold />
              <Text variant="footnote" color={colors.textSecondary}>
                {shop.settings.onlinePayment ? 'Pagamento por Pix ou cartão.' : 'Pagamento na retirada (Pix, cartão ou dinheiro). A compra entregue vale pontos Tesourinhas.'}
              </Text>
            </Card>
          </>
        )}
      </Sheet>
      {lines.length > 0 && (
        <View style={{ position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.xxl }}>
          <Button title={`Fechar pedido · ${money(total)}`} loading={sending} disabled={sending || (delivery === 'entrega' && address.trim().length < 8)} onPress={() => void submit()} />
        </View>
      )}
    </Screen>
  );
}

function Stepper({ icon, label, onPress, disabled }: { icon: 'add' | 'remove'; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityLabel={label} hitSlop={6} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: disabled ? colors.surfaceMuted : colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={16} color={disabled ? colors.textTertiary : colors.brand} />
    </Pressable>
  );
}

function Radio({ on }: { on: boolean }) {
  return on ? <Icon name="checkmark-circle" size={24} color={colors.brand} /> : <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border }} />;
}

function Line({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant={bold ? 'headline' : 'subhead'} color={bold ? colors.text : colors.textSecondary}>{label}</Text>
      <Text variant={bold ? 'headline' : 'subhead'} color={color ?? colors.text}>{value}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Meus pedidos                                                        */
/* ------------------------------------------------------------------ */
export function OrdersScreen() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setError('');
      setOrders(await listOrders());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const cancel = (o: Order) =>
    confirm(`Cancelar o pedido #${o.number}?`, 'Os produtos voltam para a loja e, se você usou cupom, ele volta para você.', 'Cancelar pedido', async () => {
      try {
        await cancelOrder(o.id);
        await load();
      } catch (e) {
        notify('Não foi possível cancelar', e instanceof Error ? e.message : String(e));
      }
    });

  return (
    <Screen>
      <ScreenHeader title="Meus pedidos" subtitle="Loja Tesourinha" />
      <Sheet
        contentStyle={{ gap: spacing.lg, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {orders === null && !error ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />
        ) : error ? (
          <EmptyState icon="cloud-offline-outline" title="Não foi possível carregar" text={error} action="Tentar de novo" onAction={() => void load()} />
        ) : orders!.length === 0 ? (
          <EmptyState icon="bag-handle-outline" title="Nenhum pedido ainda" text="Seus pedidos da Loja Tesourinha aparecem aqui." action="Ver a loja" onAction={() => router.replace('/shop')} />
        ) : (
          orders!.map((o) => (
            <Card key={o.id} style={{ gap: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text variant="headline">Pedido #{o.number}</Text>
                  <Text variant="footnote" color={colors.textSecondary}>
                    {new Date(o.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '')} · {o.delivery === 'retirada' ? 'Retirada' : 'Entrega'}
                    {o.proPrice ? ' · Preço Pro' : ''}
                  </Text>
                </View>
                <Badge label={ORDER_STATUS[o.status].label.toUpperCase()} tone={ORDER_STATUS[o.status].tone} />
              </View>
              <View style={{ gap: 2 }}>
                {o.items.map((i, k) => (
                  <Text key={k} variant="subhead" color={colors.textSecondary}>{i.qty}× {i.name}</Text>
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="headline">{money(o.total)}{o.discount > 0 ? <Text variant="footnote" color={colors.success}>{`  (cupom - ${money(o.discount)})`}</Text> : null}</Text>
                {o.status === 'novo' && (
                  <Pressable onPress={() => cancel(o)} hitSlop={8}>
                    <Text variant="subhead" color={colors.danger}>Cancelar</Text>
                  </Pressable>
                )}
              </View>
            </Card>
          ))
        )}
      </Sheet>
    </Screen>
  );
}
