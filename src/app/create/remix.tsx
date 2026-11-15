import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import { RemixCard, tap, useQuickRemix } from '@/components/studio';
import { colors } from '@/theme';

export default function CopyAndEdit() {
  const router = useRouter();
  const feed = useQuery(api.movies.feed);
  const quick = useQuickRemix();
  const items = [...(feed ?? [])].sort((a, b) => b.views - a.views);

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
          <Text style={styles.kicker}>COPY & EDIT</Text>
          <Text style={styles.title}>Remix a reel</Text>
        </View>
      </View>
      <View style={styles.steps}>
        {['Pick a reel', 'Swap yourself in', 'Rewrite the lines'].map((s, i) => (
          <View key={s} style={styles.step}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{s}</Text>
          </View>
        ))}
      </View>
      <FlatList
        data={items}
        keyExtractor={(r) => r._id}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40, gap: 18 }}
        renderItem={({ item }) => (
          <RemixCard
            item={item}
            width={168}
            onOpen={() => router.push({ pathname: '/movie/[id]/premiere', params: { id: item._id } })}
            onRemix={() => quick.go(item._id, item.isReel)}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>{feed === undefined ? 'Loading the feed…' : 'Nothing on the feed yet.'}</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 12 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  steps: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, paddingBottom: 16 },
  step: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: 12, padding: 8 },
  stepNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.cyan, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#0A0A0A', fontWeight: '900', fontSize: 11 },
  stepText: { color: colors.text, fontWeight: '700', fontSize: 11, flex: 1 },
  empty: { color: colors.muted, fontSize: 14, textAlign: 'center', marginTop: 40 },
});
