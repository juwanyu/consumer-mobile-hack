import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { REEL_TEMPLATES } from '../../../convex/reels';
import { Label, Screen } from '@/components/ui';
import { addLocal } from '@/local';
import { useMyId } from '@/me';
import { GENRE_COLORS, GENRES, type GenreId } from '@/library';
import { colors, radius, type } from '@/theme';

export default function NewMovie() {
  const { castMemberId } = useLocalSearchParams<{ castMemberId: Id<'castMembers'> }>();
  const router = useRouter();
  const ownerId = useMyId() ?? undefined;
  const create = useMutation(api.movies.create);
  const createReel = useMutation(api.movies.createReel);
  const [picking, setPicking] = useState<GenreId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (genre: GenreId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setPicking(genre);
    setError(null);
    try {
      const movieId = await create({ castMemberId, genre, ownerId });
      await addLocal('mine', movieId);
      router.replace({ pathname: '/movie/[id]/story', params: { id: movieId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the movie.');
      setPicking(null);
    }
  };

  const pickReel = async (templateId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setError(null);
    try {
      const movieId = await createReel({ templateId, master: castMemberId, ownerId });
      await addLocal('mine', movieId);
      router.replace({ pathname: '/movie/[id]/reel', params: { id: movieId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the reel.');
    }
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={16}>
        <Text style={type.small}>← Back</Text>
      </Pressable>
      <Text style={type.title}>Pick your reel</Text>
      {error ? <Text style={{ color: colors.red, fontWeight: '700' }}>{error}</Text> : null}
      <ScrollView contentContainerStyle={styles.grid}>
        <View style={{ width: '100%', gap: 10 }}>
          <Label>Punchy reels · narrated</Label>
          {Object.values(REEL_TEMPLATES).map((t) => (
            <Pressable
              key={t.id}
              testID={`reel-${t.id}`}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              onPress={() => pickReel(t.id)}
              style={({ pressed }) => [styles.reelCard, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
              <Text style={{ fontSize: 44 }}>{t.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[type.heading, { color: colors.pink }]}>{t.label}</Text>
                <Text style={type.small} numberOfLines={2}>
                  {t.logline} · {t.slots.map((s) => s.role).join(', ')} + Saber
                </Text>
              </View>
            </Pressable>
          ))}
          <Label>Cinematic · 3 shots</Label>
        </View>
        {GENRES.map((g) => (
          <Pressable
            key={g.id}
            testID={`genre-${g.id}`}
            accessibilityRole="button"
            accessibilityLabel={g.label}
            disabled={picking !== null}
            onPress={() => pick(g.id)}
            style={({ pressed }) => [styles.card, { borderColor: GENRE_COLORS[g.id], transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <Text style={styles.emoji}>{g.emoji}</Text>
            <Text style={[type.heading, { color: GENRE_COLORS[g.id] }]}>{g.label}</Text>
            <Text style={type.small} numberOfLines={1}>
              {g.roles.join(' · ')}
            </Text>
            {picking === g.id ? (
              <View style={styles.overlay}>
                <ActivityIndicator color={colors.text} />
              </View>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  reelCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.pink, padding: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 24 },
  card: {
    width: '48%',
    aspectRatio: 0.85,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    padding: 16,
    justifyContent: 'flex-end',
    gap: 4,
    overflow: 'hidden',
  },
  emoji: { fontSize: 56, position: 'absolute', top: 14, left: 14 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});
