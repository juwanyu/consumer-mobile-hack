import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import { BlockyCharacter } from '@/components/blocky-character';
import { BigButton, Label, Screen } from '@/components/ui';
import { GENRE_COLORS, library, type GenreId } from '@/library';
import { colors, radius, type } from '@/theme';

const DEMO_LOOK = {
  skin_tone: '#E0A878',
  hair_color: '#FFD23F',
  hair_style: 'spiky',
  facial_hair: 'none',
  glasses: 'sunglasses',
  shirt_color: '#FF2E88',
  shirt_style: 'hoodie',
  pants_color: '#2EE6FF',
  accessory: 'none',
  vibe: '',
} as const;

export default function Home() {
  const router = useRouter();
  const feed = useQuery(api.movies.feed);
  const empty = feed !== undefined && feed.length === 0;

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.logo}>
          CAST<Text style={{ color: colors.yellow }}>.</Text>
        </Text>
        <Label>Live from the stage</Label>
      </View>

      {feed && feed.length > 0 ? (
        <FlatList
          data={feed}
          keyExtractor={(m) => m._id}
          contentContainerStyle={{ gap: 12, paddingBottom: 12 }}
          ListHeaderComponent={<Text style={[type.heading, { marginBottom: 4 }]}>Now showing</Text>}
          renderItem={({ item }) => {
            const accent = GENRE_COLORS[item.genre] ?? colors.yellow;
            const genre = library.genres[item.genre as GenreId];
            const lead = item.cast[0];
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Watch ${item.title}`}
                onPress={() => router.push({ pathname: '/movie/[id]/premiere', params: { id: item._id } })}
                style={({ pressed }) => [styles.card, { borderColor: accent, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
                <View style={[styles.poster, { backgroundColor: accent }]}>
                  {lead?.look ? <BlockyCharacter look={lead.look} size={64} animate={false} /> : null}
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={[type.label, { color: accent }]}>
                    {genre?.emoji} {genre?.label}
                  </Text>
                  <Text style={type.heading} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={type.small} numberOfLines={1}>
                    Starring {item.cast.map((c) => c.name).join(', ')}
                  </Text>
                </View>
                <Text style={{ fontSize: 28 }}>▶</Text>
              </Pressable>
            );
          }}
        />
      ) : (
        <View style={styles.hero}>
          <BlockyCharacter look={DEMO_LOOK} size={200} />
          <Text style={[type.title, styles.center]}>Turn a judge into a movie star.</Text>
          <Text style={[type.small, styles.center]}>
            {empty ? 'No premieres yet. The first one is yours.' : 'Snap a photo, get a blocky twin, roll camera.'}
          </Text>
        </View>
      )}

      <BigButton testID="cast-a-judge" icon="🎬" label="Cast a judge" onPress={() => router.push('/cast/consent')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  center: { textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 2, padding: 12 },
  poster: { width: 72, height: 96, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
