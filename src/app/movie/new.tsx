import { useMutation } from 'convex/react';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { tap } from '@/components/studio';
import { useArtStyle } from '@/art-style';
import { addLocal } from '@/local';
import { useMyId } from '@/me';
import { TEMPLATES } from '@/templates';
import { colors, radius } from '@/theme';

const WORLDS = TEMPLATES.filter((t) => t.kind === 'genre');

export default function StartFromScratch() {
  const { castMemberId } = useLocalSearchParams<{ castMemberId: Id<'castMembers'> }>();
  const router = useRouter();
  const ownerId = useMyId() ?? undefined;
  const create = useMutation(api.movies.create);
  const setArtStyle = useMutation(api.movies.setArtStyle);
  const { style } = useArtStyle();
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (genre: string) => {
    tap('heavy');
    setPicking(genre);
    setError(null);
    try {
      const movieId = await create({ castMemberId, genre, ownerId });
      await addLocal('mine', movieId);
      await setArtStyle({ movieId, artStyle: style }).catch(() => {});
      router.replace({ pathname: '/movie/[id]/story', params: { id: movieId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the movie.');
      setPicking(null);
    }
  };

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
          <Text style={styles.kicker}>START FROM SCRATCH</Text>
          <Text style={styles.title}>Pick a world</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sub}>You write the title, every shot and every line. Pick where it happens.</Text>
        {error ? <Text style={{ color: colors.red, fontWeight: '700' }}>{error}</Text> : null}
        <View style={styles.grid}>
          {WORLDS.map((g) => (
            <Pressable
              key={g.id}
              testID={`genre-${g.id}`}
              accessibilityRole="button"
              accessibilityLabel={g.label}
              disabled={picking !== null}
              onPress={() => pick(g.id)}
              style={({ pressed }) => [styles.card, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
              {g.still ? <Image source={g.still} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              <View style={styles.shade} />
              <View style={[styles.bar, { backgroundColor: g.accent }]} />
              <View style={{ padding: 12, gap: 2 }}>
                <Text style={styles.cardTitle}>
                  {g.emoji} {g.label}
                </Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {g.roles.join(' · ')}
                </Text>
              </View>
              {picking === g.id ? (
                <View style={styles.overlay}>
                  <ActivityIndicator color={colors.text} />
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={() => {
            tap();
            router.push('/create/templates');
          }}
          style={styles.alt}>
          <SymbolView name="square.grid.2x2.fill" size={18} tintColor={colors.pink} />
          <Text style={styles.altText}>Rather start from a narrated template?</Text>
          <SymbolView name="chevron.right" size={14} tintColor={colors.muted} weight="bold" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 8 },
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  kicker: { color: colors.yellow, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  sub: { color: colors.muted, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  content: { paddingHorizontal: 18, paddingBottom: 40, gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  card: { width: '48.5%', height: 200, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.surfaceHi, justifyContent: 'flex-end' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%', backgroundColor: 'rgba(0,0,0,0.6)' },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  cardSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface },
  altText: { flex: 1, color: colors.text, fontWeight: '800', fontSize: 15 },
});
