import { useMutation, useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { BlockyCharacter } from '@/components/blocky-character';
import { tap } from '@/components/studio';
import { Label, Screen } from '@/components/ui';
import { useArtStyle } from '@/art-style';
import { addLocal } from '@/local';
import { useMe } from '@/me';
import { colors, radius, type } from '@/theme';

export default function Remix() {
  const { id } = useLocalSearchParams<{ id: Id<'movies'> }>();
  const router = useRouter();
  const movie = useQuery(api.movies.get, { movieId: id });
  const ready = useQuery(api.casting.listReady);
  const remix = useMutation(api.movies.remix);
  const setArtStyle = useMutation(api.movies.setArtStyle);
  const { style } = useArtStyle();
  const { id: ownerId, me } = useMe();
  const [busy, setBusy] = useState<string | null>(null);
  const myCast = me?.castMemberId as Id<'castMembers'> | undefined;
  const lead = movie?.castDetails[0];
  const still = movie?.previewUrls[Math.floor((movie?.previewUrls.length ?? 0) / 2)]?.url;

  const pick = async (castMemberId: Id<'castMembers'>) => {
    tap('heavy');
    setBusy(castMemberId);
    try {
      const movieId = await remix({ movieId: id, castMemberId, ownerId: ownerId ?? undefined });
      await addLocal('mine', movieId);
      await setArtStyle({ movieId, artStyle: style }).catch(() => {});
      router.replace({ pathname: movie?.reel ? '/movie/[id]/edit' : '/movie/[id]/story', params: { id: movieId } });
    } catch (e) {
      Alert.alert('Could not remix', e instanceof Error ? e.message : 'Try again.');
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Pressable
        onPress={() => {
          tap();
          router.back();
        }}
        hitSlop={16}
        style={styles.back}>
        <SymbolView name="chevron.left" size={18} tintColor={colors.text} weight="bold" />
      </Pressable>
      <View style={styles.hero}>
        <View style={styles.thumb}>{still ? <Image source={{ uri: still }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.kicker}>COPY & EDIT</Text>
          <Text style={styles.title} numberOfLines={2}>
            {movie?.story.title ?? '…'}
          </Text>
          <Text style={type.small}>
            Same shots, your cast. You take the lead{lead ? ` as ${lead.role}` : ''}, then rewrite any line before you roll.
          </Text>
        </View>
      </View>
      {myCast && me?.look ? (
        <Pressable testID="remix-as-me" disabled={busy !== null} onPress={() => pick(myCast)} style={({ pressed }) => [styles.me, { opacity: pressed ? 0.9 : 1 }]}>
          <View style={styles.meAvatar}>
            <BlockyCharacter look={me.look} size={60} animate={false} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.meTitle}>Star as {me.name}</Text>
            <Text style={styles.meSub}>Swap yourself in, then edit the lines</Text>
          </View>
          {busy === myCast ? <ActivityIndicator color="#0A0A0A" /> : <SymbolView name="arrow.right" size={18} tintColor="#0A0A0A" weight="bold" />}
        </Pressable>
      ) : (
        <Pressable
          testID="remix-cast-yourself"
          onPress={() => {
            tap('medium');
            router.push({ pathname: '/cast/consent', params: { remix: id } });
          }}
          style={styles.me}>
          <Text style={{ fontSize: 30 }}>📸</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.meTitle}>Cast yourself</Text>
            <Text style={styles.meSub}>One selfie, then you star in this</Text>
          </View>
        </Pressable>
      )}
      <Label>Or put someone else in</Label>
      <FlatList
        data={(ready ?? []).filter((m) => m._id !== myCast)}
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
            {busy === item._id ? <ActivityIndicator color={colors.yellow} /> : null}
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  thumb: { width: 96, height: 136, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceHi },
  kicker: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.8 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.yellow, borderRadius: radius.lg, padding: 12, paddingRight: 18 },
  meAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.12)', overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' },
  meTitle: { color: '#0A0A0A', fontSize: 18, fontWeight: '900' },
  meSub: { color: 'rgba(0,0,0,0.65)', fontSize: 13, fontWeight: '700' },
  person: { flex: 1, maxWidth: '32%', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderRadius: radius.md, padding: 10 },
});
