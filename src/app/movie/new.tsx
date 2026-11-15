import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Screen } from '@/components/ui';
import { GENRE_COLORS, GENRES, type GenreId } from '@/library';
import { colors, radius, type } from '@/theme';

export default function NewMovie() {
  const { castMemberId } = useLocalSearchParams<{ castMemberId: Id<'castMembers'> }>();
  const router = useRouter();
  const create = useMutation(api.movies.create);
  const [picking, setPicking] = useState<GenreId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (genre: GenreId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setPicking(genre);
    setError(null);
    try {
      const movieId = await create({ castMemberId, genre });
      router.replace({ pathname: '/movie/[id]/story', params: { id: movieId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the movie.');
      setPicking(null);
    }
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={16}>
        <Text style={type.small}>← Back</Text>
      </Pressable>
      <Text style={type.title}>Pick a genre</Text>
      {error ? <Text style={{ color: colors.red, fontWeight: '700' }}>{error}</Text> : null}
      <ScrollView contentContainerStyle={styles.grid}>
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
