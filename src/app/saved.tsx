import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import { BlockyCharacter } from '@/components/blocky-character';
import { FeedChrome } from '@/components/feed-chrome';
import { GENRE_COLORS } from '@/library';
import { useLocalIds } from '@/local';
import { colors, radius, type } from '@/theme';

export default function Saved() {
  const router = useRouter();
  const saved = useLocalIds('saved');
  const mine = useLocalIds('mine');
  const ids = [...new Set([...mine.ids, ...saved.ids])];
  const items = useQuery(api.movies.byIds, { ids });

  return (
    <View style={styles.full}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <FlatList
          data={items ?? []}
          keyExtractor={(m) => m._id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={styles.grid}
          ListHeaderComponent={<Text style={[type.title, { marginBottom: 6 }]}>Your reels</Text>}
          ListEmptyComponent={
            items ? <Text style={[type.small, { marginTop: 24 }]}>Save reels from the feed, or make your own with ＋ Create.</Text> : undefined
          }
          renderItem={({ item }) => {
            const accent = GENRE_COLORS[item.genre] ?? colors.yellow;
            const lead = item.cast[0];
            const isMine = mine.has(item._id);
            const target = item.status === 'done' ? '/movie/[id]/premiere' : item.status === 'draft' ? (item.isReel ? '/movie/[id]/reel' : '/movie/[id]/story') : '/movie/[id]/render';
            return (
              <Pressable onPress={() => router.push({ pathname: target, params: { id: item._id } })} style={[styles.tile, { borderColor: accent }]}>
                <View style={[styles.poster, { backgroundColor: accent }]}>{lead?.look ? <BlockyCharacter look={lead.look} size={80} animate={false} /> : null}</View>
                <Text style={type.label}>{isMine ? 'MADE BY YOU' : 'SAVED'}{item.status !== 'done' ? ` · ${item.status.toUpperCase()}` : ''}</Text>
                <Text style={[type.heading, { fontSize: 17 }]} numberOfLines={2}>
                  {item.title}
                </Text>
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
      <FeedChrome tab="saved" />
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: colors.bg },
  grid: { padding: 16, paddingTop: 48, paddingBottom: 120, gap: 10 },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 2, padding: 10, gap: 6, maxWidth: '50%' },
  poster: { height: 150, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
