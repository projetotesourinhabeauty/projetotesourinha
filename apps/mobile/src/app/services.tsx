import { Icon } from '@/components/icon';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen, ScreenHeader, Sheet } from '@/components/screen';
import { EmptyState, ListGroup, ListRow, SearchBar, Text } from '@/components/ui';
import { categories, services } from '@/data/catalog';
import { servicePhoto } from '@/data/imagery';
import { formatDuration, formatPrice } from '@/lib/format';
import { colors, spacing } from '@/theme';

export default function Services() {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return categories
      .map((c) => ({ cat: c, items: services.filter((s) => s.categoryId === c.id && (!q || `${s.name} ${s.description}`.toLowerCase().includes(q))) }))
      .filter((g) => g.items.length);
  }, [query]);

  return (
    <Screen>
      <ScreenHeader title="Selecionar serviço" subtitle="O que você quer fazer hoje?">
        <SearchBar placeholder="Buscar serviços" value={query} onChangeText={setQuery} />
      </ScreenHeader>
      <Sheet contentStyle={{ gap: spacing.xxl }}>
        {groups.length === 0 && <EmptyState icon="search-outline" title="Nenhum serviço encontrado" text="Tente outro termo, como corte, unha ou limpeza de pele." />}
        {groups.map(({ cat, items }) => (
          <ListGroup key={cat.id} title={cat.name}>
            {items.map((s) => (
              <ListRow
                key={s.id}
                left={<Image source={{ uri: servicePhoto(s, 160, 160) }} style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: colors.surfaceMuted }} contentFit="cover" transition={200} />}
                title={s.name}
                subtitle={`${formatDuration(s.durationMin)} · a partir de ${formatPrice(s.priceFrom)}`}
                onPress={() => router.push({ pathname: '/professionals', params: { category: s.categoryId } })}
              />
            ))}
          </ListGroup>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="shield-checkmark-outline" size={16} color={colors.textSecondary} />
          <Text variant="footnote" color={colors.textSecondary}>Preços de referência. O valor final é definido pelo profissional.</Text>
        </View>
      </Sheet>
    </Screen>
  );
}
