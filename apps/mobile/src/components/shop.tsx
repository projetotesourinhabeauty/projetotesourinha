import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { BackButton, Screen, ScreenHeader, Sheet } from '@/components/screen';
import { Badge, Button, Card, Chip, EmptyState, IconTile, ListGroup, ListRow, PressableScale, SearchBar, SectionHeader, Text } from '@/components/ui';
import { heroPhotos, productPhoto } from '@/data/imagery';
import { money } from '@/data/points';
import { ORDER_STATUS, cancelOrder, cartStore, listOrders, loadShop, myCoupons, payOrder, placeOrder, useCart, type Order, type Product, type Shop } from '@/data/shop';
import { confirm, notify } from '@/lib/confirm';
import { haptic } from '@/lib/haptics';
import { isRemote } from '@/lib/supabase';
import { colors, radius, shadow, spacing } from '@/theme';

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
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const cart = useCart();
  const cats = useMemo(() => ['Todos', ...new Set((shop?.products ?? []).map((p) => p.category))], [shop]);
  const q = query.trim().toLowerCase();
  const list = (shop?.products ?? []).filter((p) => (cat === 'Todos' || p.category === cat) && (!q || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q)));
  const featured = (shop?.products ?? []).filter((p) => p.featured);
  const pro = !!shop?.isPro;
  const cols = shop?.settings.gridColumns ?? 2;
  const count = cart.reduce((a, i) => a + i.qty, 0);

  return (
    <Screen>
      <ScreenHeader title="Loja Tesourinha" subtitle={pro ? 'Você compra com preço Pro' : 'Produtos para beleza e para o salão'} right={<CartButton />} />
      <Sheet
        contentStyle={{ gap: spacing.xl, paddingBottom: 150 }}
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
            {/* Banner */}
            <View style={{ borderRadius: radius.xxl, overflow: 'hidden', aspectRatio: 1.15, justifyContent: 'flex-end', backgroundColor: colors.black }}>
              <Image source={{ uri: shop.settings.bannerImageUrl ?? heroPhotos.shop(1000, 870) }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={300} />
              <LinearGradient colors={['rgba(11,11,12,0)', 'rgba(11,11,12,0.35)', 'rgba(11,11,12,0.92)']} locations={[0, 0.45, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
              <View style={{ padding: spacing.xl, gap: spacing.sm }}>
                <View style={{ alignSelf: 'flex-start' }}><Badge label={pro ? 'PREÇO PRO ATIVO' : 'LOJA TESOURINHA'} icon={pro ? 'ribbon' : 'bag-handle'} /></View>
                <Text variant="title1" color={colors.white}>{pro ? 'Seu desconto de profissional já está aplicado' : shop.settings.bannerTitle}</Text>
                <Text variant="subhead" color="rgba(255,255,255,0.8)">
                  {pro ? 'Profissionais aprovados pagam menos em todos os produtos.' : shop.settings.bannerSubtitle || `Profissional aprovado compra com até ${shop.settings.proDiscountPct}% de desconto.`}
                </Text>
              </View>
            </View>

            <SearchBar placeholder="Buscar produtos" value={query} onChangeText={setQuery} />

            {cats.length > 2 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.xl }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
                {cats.map((c) => <Chip key={c} label={c} active={c === cat} onPress={() => setCat(c)} />)}
              </ScrollView>
            )}

            {/* Destaques */}
            {featured.length > 0 && cat === 'Todos' && !q && (
              <View>
                <SectionHeader title="Destaques" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.xl }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md }}>
                  {featured.map((p) => (
                    <View key={p.id} style={{ width: 220 }}>
                      <ProductCard p={p} pro={pro} inCart={cart.find((i) => i.productId === p.id)?.qty ?? 0} />
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <View>
              <SectionHeader title={cat === 'Todos' ? (q ? 'Resultados' : 'Todos os produtos') : cat} />
              {list.length === 0 ? (
                <EmptyState icon="search-outline" title="Nada encontrado" text="Tente outra palavra ou outra categoria." />
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                  {list.map((p) => (
                    <View key={p.id} style={cols === 2 ? { flexBasis: '47%', flexGrow: 1, maxWidth: '50%' } : { width: '100%' }}>
                      <ProductCard p={p} pro={pro} wide={cols === 1} inCart={cart.find((i) => i.productId === p.id)?.qty ?? 0} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </Sheet>
      {count > 0 && (
        <View style={{ position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.xxl }}>
          <Button title={`Ver carrinho (${count})`} icon="cart-outline" variant="dark" onPress={() => router.push('/cart')} />
        </View>
      )}
    </Screen>
  );
}

function ProductCard({ p, pro, inCart, wide }: { p: Product; pro: boolean; inCart: number; wide?: boolean }) {
  const out = p.stock <= 0;
  const photo = productPhoto(p, wide ? 900 : 500);
  const off = pro && p.proPrice < p.price ? Math.round((1 - p.proPrice / p.price) * 100) : 0;
  return (
    <PressableScale
      scaleTo={0.98}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: p.id } })}
      accessibilityLabel={`${p.name}, ${money(unitPrice(p, pro))}`}
      style={{ backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card }}>
      <View style={{ aspectRatio: wide ? 4 / 3 : 1, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
        {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} /> : <IconTile icon="bag-handle" size={56} />}
        <View style={{ position: 'absolute', top: 10, left: 10, flexDirection: 'row', gap: 6 }}>
          {out ? <Badge label="ESGOTADO" tone="dark" /> : off > 0 ? <Badge label={`PRO -${off}%`} tone="dark" /> : p.featured ? <Badge label="DESTAQUE" /> : null}
        </View>
      </View>
      <View style={{ padding: spacing.md, gap: 4 }}>
        <Text variant="caption" color={colors.brand} weight="600">{p.category.toUpperCase()}</Text>
        <Text variant={wide ? 'headline' : 'subhead'} weight="600" numberOfLines={2} style={{ minHeight: wide ? undefined : 40 }}>{p.name}</Text>
        {wide && !!p.description && <Text variant="footnote" color={colors.textSecondary} numberOfLines={2}>{p.description}</Text>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 }}>
          <View>
            {off > 0 && <Text variant="caption" color={colors.textTertiary} style={{ textDecorationLine: 'line-through' }}>{money(p.price)}</Text>}
            <Text variant="headline" color={colors.text}>{money(unitPrice(p, pro))}</Text>
          </View>
          <PressableScale
            disabled={out || inCart >= p.stock}
            onPress={() => { haptic.success(); cartStore.add(p.id); }}
            accessibilityLabel={`Adicionar ${p.name} ao carrinho`}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: out ? colors.border : colors.brand, alignItems: 'center', justifyContent: 'center' }}>
            {inCart ? <Text variant="footnote" weight="700" color={colors.white}>{inCart}</Text> : <Icon name="add" size={20} color={colors.white} />}
          </PressableScale>
        </View>
      </View>
    </PressableScale>
  );
}

/* ------------------------------------------------------------------ */
/* Página do produto                                                   */
/* ------------------------------------------------------------------ */
export function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { shop, error, load } = useShop();
  const cart = useCart();
  const insets = useSafeAreaInsets();
  const [qty, setQty] = useState(1);
  const p = shop?.products.find((x) => x.id === id);
  const pro = !!shop?.isPro;
  const inCart = cart.find((i) => i.productId === id)?.qty ?? 0;
  const count = cart.reduce((a, i) => a + i.qty, 0);

  if (!shop || !p) {
    return (
      <Screen>
        <ScreenHeader title="Produto" />
        <Sheet>
          {error ? (
            <EmptyState icon="cloud-offline-outline" title="Não foi possível carregar" text={error} action="Tentar de novo" onAction={() => void load()} />
          ) : !shop ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.huge }} />
          ) : (
            <EmptyState icon="bag-handle-outline" title="Produto indisponível" text="Este produto saiu da loja." action="Ver a loja" onAction={() => router.replace('/shop')} />
          )}
        </Sheet>
      </Screen>
    );
  }
  const out = p.stock <= 0;
  const max = Math.max(0, p.stock - inCart);
  const photo = productPhoto(p, 1100);
  const off = pro && p.proPrice < p.price ? Math.round((1 - p.proPrice / p.price) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={{ aspectRatio: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          {photo ? <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={250} /> : <IconTile icon="bag-handle" size={96} />}
          <View style={{ position: 'absolute', top: insets.top + spacing.sm, left: spacing.xl, right: spacing.xl, flexDirection: 'row', justifyContent: 'space-between' }}>
            <BackButton tone="glass" />
            <View style={{ backgroundColor: 'rgba(11,11,12,0.55)', borderRadius: 22 }}><CartButton /></View>
          </View>
        </View>
        <View style={{ padding: spacing.xl, gap: spacing.lg, marginTop: -spacing.xl, backgroundColor: colors.background, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl }}>
          <View style={{ gap: 6 }}>
            <Text variant="footnote" color={colors.brand} weight="600">{p.category.toUpperCase()}</Text>
            <Text variant="title1">{p.name}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md }}>
            <Text variant="title1" color={colors.brand}>{money(unitPrice(p, pro))}</Text>
            {off > 0 && <Text variant="subhead" color={colors.textTertiary} style={{ textDecorationLine: 'line-through', marginBottom: 4 }}>{money(p.price)}</Text>}
            {off > 0 && <View style={{ marginBottom: 4 }}><Badge label={`PRO -${off}%`} tone="dark" /></View>}
          </View>
          {!pro && p.proPrice < p.price && (
            <Text variant="footnote" color={colors.textSecondary}>Profissional aprovado paga {money(p.proPrice)} pelo app Tesourinha Pro.</Text>
          )}
          <Card style={{ gap: spacing.sm }}>
            <Text variant="headline">Sobre o produto</Text>
            <Text variant="callout" color={colors.textSecondary}>{p.description || 'Produto selecionado pela Associação Tesourinha.'}</Text>
          </Card>
          <ListGroup>
            <ListRow icon="location-outline" title="Retirada" subtitle={shop.settings.pickupAddress} />
            {shop.settings.deliveryEnabled && <ListRow icon="paper-plane" title="Entrega" subtitle={`Taxa ${money(shop.settings.deliveryFee)}`} />}
            <ListRow icon="sparkles" title="Vale pontos Tesourinhas" subtitle="A compra entregue soma pontos e você pode pagar com cupom." />
            <ListRow icon="bag-handle-outline" title="Estoque" value={out ? 'Esgotado' : p.stock <= 5 ? `Últimas ${p.stock}` : 'Disponível'} />
          </ListGroup>
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.separator, flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        {!out && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Stepper icon="remove" label="Menos um" disabled={qty <= 1} onPress={() => setQty((n) => Math.max(1, n - 1))} />
            <Text variant="headline" style={{ minWidth: 24, textAlign: 'center' }}>{qty}</Text>
            <Stepper icon="add" label="Mais um" disabled={qty >= max} onPress={() => setQty((n) => Math.min(max, n + 1))} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          {out ? (
            <Button title="Esgotado" disabled />
          ) : max === 0 ? (
            <Button title={`Ver carrinho (${count})`} variant="dark" icon="cart-outline" onPress={() => router.push('/cart')} />
          ) : (
            <Button
              title={`Adicionar · ${money(unitPrice(p, pro) * qty)}`}
              onPress={() => {
                haptic.success();
                cartStore.add(p.id, Math.min(qty, max));
                setQty(1);
                router.push('/cart');
              }}
            />
          )}
        </View>
      </View>
    </View>
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
  const [payment, setPayment] = useState<'mercadopago' | 'retirada'>('mercadopago');

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
      const pay = shop?.settings.onlinePayment ? payment : 'retirada';
      const o = await placeOrder({ items: cart, coupon, delivery, address, payment: pay });
      cartStore.clear();
      haptic.success();
      if (pay === 'mercadopago') {
        router.replace('/orders');
        try {
          await payOrder(o.id);
        } catch (e) {
          notify(`Pedido #${o.number} recebido`, `Não abrimos o pagamento agora (${e instanceof Error ? e.message : String(e)}). Toque em "Pagar agora" em Meus pedidos.`);
        }
        return;
      }
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

            {shop.settings.onlinePayment && (
              <View>
                <SectionHeader title="Pagamento" />
                <ListGroup>
                  <ListRow icon="wallet-outline" title="Pagar agora" subtitle="Pix ou cartão, pelo Mercado Pago" onPress={() => setPayment('mercadopago')} right={<Radio on={payment === 'mercadopago'} />} />
                  <ListRow icon="cash-outline" title={delivery === 'entrega' ? 'Pagar na entrega' : 'Pagar na retirada'} subtitle="Pix, cartão ou dinheiro" onPress={() => setPayment('retirada')} right={<Radio on={payment === 'retirada'} />} />
                </ListGroup>
              </View>
            )}

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
                {shop.settings.onlinePayment && payment === 'mercadopago'
                  ? 'Você será levado ao Mercado Pago para pagar com Pix ou cartão. A compra entregue vale pontos Tesourinhas.'
                  : 'Pagamento na retirada (Pix, cartão ou dinheiro). A compra entregue vale pontos Tesourinhas.'}
              </Text>
            </Card>
          </>
        )}
      </Sheet>
      {lines.length > 0 && (
        <View style={{ position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.xxl }}>
          <Button title={`${shop?.settings.onlinePayment && payment === 'mercadopago' ? 'Pagar' : 'Fechar pedido'} · ${money(total)}`} loading={sending} disabled={sending || (delivery === 'entrega' && address.trim().length < 8)} onPress={() => void submit()} />
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
const PAY_LABEL: Record<Order['paymentStatus'], string> = {
  pendente: 'Aguardando pagamento (Pix ou cartão)',
  aprovado: 'Pago pelo Mercado Pago',
  recusado: 'Pagamento recusado',
  estornado: 'Pagamento estornado',
};

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

  const [paying, setPaying] = useState('');
  const pay = async (o: Order) => {
    setPaying(o.id);
    try {
      await payOrder(o.id, o.paymentStatus === 'recusado');
    } catch (e) {
      notify('Não foi possível abrir o pagamento', e instanceof Error ? e.message : String(e));
    } finally {
      setPaying('');
      void load();
    }
  };

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
                {o.status === 'novo' && o.paymentStatus === 'pendente' && (
                  <Pressable onPress={() => cancel(o)} hitSlop={8}>
                    <Text variant="subhead" color={colors.danger}>Cancelar</Text>
                  </Pressable>
                )}
              </View>
              {o.paymentMethod === 'mercadopago' && o.status !== 'cancelado' && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
                  <Text variant="footnote" color={o.paymentStatus === 'aprovado' ? colors.success : o.paymentStatus === 'recusado' ? colors.danger : colors.textSecondary}>
                    {PAY_LABEL[o.paymentStatus]}
                  </Text>
                  {o.status === 'novo' && (o.paymentStatus === 'pendente' || o.paymentStatus === 'recusado') && (
                    <Button title={o.paymentStatus === 'recusado' ? 'Tentar de novo' : 'Pagar agora'} size="sm" full={false} loading={paying === o.id} disabled={!!paying} onPress={() => void pay(o)} />
                  )}
                </View>
              )}
            </Card>
          ))
        )}
      </Sheet>
    </Screen>
  );
}
