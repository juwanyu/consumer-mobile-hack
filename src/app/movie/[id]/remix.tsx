import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { BlockyCharacter } from '@/components/blocky-character';
import { BigButton, Label, Screen } from '@/components/ui';
import { addLocal } from '@/local';
import { useMyId } from '@/me';
import { colors, radius, type } from '@/theme';

export default function Remix() {
  const { id } = useLocalSearchParams<{ id: Id<'movies'> }>();
  const router = useRouter();
  const movie = useQuery(api.movies.get, { movieId: id });
  const ready = useQuery(api.casting.listReady);
  const remix = useMutation(api.movies.remix);
  const ownerId = useMyId() ?? undefined;
  const [busy, setBusy] = useState<string | null>(null);

  const pick = async (castMemberId: Id<'castMembers'>) => {
    setBusy(castMemberId);
    const movieId = await remix({ movieId: id, castMemberId, ownerId });
    await addLocal('mine', movieId);
    router.replace({ pathname: movie?.reel ? '/movie/[id]/reel' : '/movie/[id]/story', params: { id: movieId } });
  };

  return (
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={16}>
        <Text style={type.small}>← Back</Text>
      </Pressable>
      <Label>Remix</Label>
      <Text style={type.title}>{movie?.story.title ?? '…'}</Text>
      <Text style={[type.body, { color: colors.muted }]}>
        Same script, your cast. You take the lead{movie?.castDetails[0] ? ` as ${movie.castDetails[0].role}` : ''}, then tweak any line before you roll.
      </Text>
      <BigButton testID="remix-cast-yourself" icon="📸" label="Cast yourself" onPress={() => router.push({ pathname: '/cast/consent', params: { remix: id } })} />
      <Label>Or pick someone already cast</Label>
      <FlatList
        data={ready ?? []}
        keyExtractor={(m) => m._id}
        numColumns={3}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <Pressable
            disabled={busy !== null}
            onPress={() => pick(item._id)}
            style={({ pressed }) => [styles.person, { opacity: busy && busy !== item._id ? 0.4 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
            {item.look ? <BlockyCharacter look={item.look} size={64} animate={false} /> : null}
            <Text style={[type.small, { color: colors.text }]} numberOfLines={1}>
              {item.name}
            </Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  person: { flex: 1, maxWidth: '32%', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: radius.md, padding: 10 },
});
