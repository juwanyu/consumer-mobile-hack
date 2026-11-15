import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import { Chips } from '@/components/chips';
import { tap, TemplateCard } from '@/components/studio';
import { CATEGORIES, TEMPLATES, templateStats } from '@/templates';
import { colors } from '@/theme';

export default function Templates() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const [category, setCategory] = useState(params.category ?? 'all');
  const feed = useQuery(api.movies.feed);
  const stats = useMemo(() => templateStats(feed), [feed]);
  const ids = CATEGORIES.find((c) => c.id === category)?.templates;
  const list = ids ? TEMPLATES.filter((t) => ids.includes(t.id)) : TEMPLATES;

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable
          hitSlop={14}
          onPress={() => {
            tap();
            router.back();
          }}
          style={styles.back}>
          <SymbolView name="chevron.left" size={18} tintColor={colors.text} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>USE A TEMPLATE</Text>
          <Text style={styles.title}>Templates</Text>
        </View>
      </View>
      <View style={{ paddingLeft: 18, paddingBottom: 12 }}>
        <Chips
          accent={colors.pink}
          value={category}
          onChange={setCategory}
          options={[{ id: 'all', label: 'All' }, ...CATEGORIES.map((c) => ({ id: c.id, label: `${c.emoji} ${c.label}` }))]}
        />
      </View>
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {list.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            stats={stats[t.id]}
            width="48.5%"
            height={290}
            onPress={() => router.push({ pathname: '/create/template/[id]', params: { id: t.id } })}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.pink, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12, paddingHorizontal: 18, paddingBottom: 40 },
});
