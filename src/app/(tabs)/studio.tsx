import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { REEL_TEMPLATES } from '../../../convex/reels';
import { BlockyCharacter } from '@/components/blocky-character';
import { DEMO_LOOK } from '@/demo-look';
import { GENRE_COLORS, GENRES, type GenreId } from '@/library';
import { addLocal } from '@/local';
import { useMe } from '@/me';
import { colors, radius, type } from '@/theme';

const PIPELINE = [
  { icon: '📸', label: 'Photo', sub: 'deleted after' },
  { icon: '🧠', label: 'AI look', sub: 'OpenAI' },
  { icon: '✍️', label: 'Script', sub: 'you direct' },
  { icon: '🎙️', label: 'Voice', sub: 'narration' },
  { icon: '🧊', label: 'Blender', sub: 'renders 3D' },
  { icon: '📲', label: 'Premiere', sub: 'via Convex' },
];

export default function Studio() {
  const router = useRouter();
  const { id, me } = useMe();
  const profile = useQuery(api.social.profile, id ? { userId: id, viewerId: id } : 'skip');
  const create = useMutation(api.movies.create);
  const createReel = useMutation(api.movies.createReel);
  const [starting, setStarting] = useState<string | null>(null);

  const castMemberId = me?.castMemberId as Id<'castMembers'> | undefined;
  const productions = (profile?.reels ?? []).filter((r) => r.status !== 'done').slice(0, 6);
  const finished = (profile?.reels ?? []).filter((r) => r.status === 'done').slice(0, 6);

  const start = async (kind: 'reel' | 'genre', key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (!castMemberId) {
      router.push('/cast/consent');
      return;
    }
    setStarting(key);
    try {
      const movieId =
        kind === 'reel'
          ? await createReel({ templateId: key, master: castMemberId, ownerId: id ?? undefined })
          : await create({ castMemberId, genre: key, ownerId: id ?? undefined });
      await addLocal('mine', movieId);
      router.push({ pathname: kind === 'reel' ? '/movie/[id]/reel' : '/movie/[id]/story', params: { id: movieId } });
    } finally {
      setStarting(null);
    }
  };

  const open = (item: { _id: Id<'movies'>; status: string; isReel: boolean }) => {
    const pathname =
      item.status === 'done' ? '/movie/[id]/premiere' : item.status === 'draft' ? (item.isReel ? '/movie/[id]/reel' : '/movie/[id]/story') : '/movie/[id]/render';
    router.push({ pathname, params: { id: item._id } });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={type.label}>Cast Studio</Text>
        <Text style={type.title}>Direct everything.</Text>

        <View style={styles.starCard}>
          <View style={styles.starArt}>
            <BlockyCharacter look={me?.look ?? DEMO_LOOK} size={130} />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={type.label}>{me?.look ? 'Your star' : 'Step 1'}</Text>
            <Text style={type.heading} numberOfLines={1}>
              {me?.look ? me.name : 'Cast yourself'}
            </Text>
            <Text style={type.small}>{me?.look ? 'Your blocky twin is ready for any role.' : 'One photo becomes your blocky movie twin. The photo is deleted right after.'}</Text>
            <Pressable testID="studio-cast" onPress={() => router.push('/cast/consent')} style={styles.smallBtn}>
              <Text style={styles.smallBtnText}>{me?.look ? '📸 Recast' : '📸 Cast yourself'}</Text>
            </Pressable>
          </View>
        </View>

        <Text style={type.label}>Narrated reels</Text>
        {Object.values(REEL_TEMPLATES).map((t) => (
          <Pressable key={t.id} testID={`studio-reel-${t.id}`} onPress={() => start('reel', t.id)} style={({ pressed }) => [styles.reelCard, pressed && { opacity: 0.85 }]}>
            <Text style={{ fontSize: 44 }}>{t.emoji}</Text>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[type.heading, { color: colors.text }]}>{t.label}</Text>
              <Text style={type.small}>
                {t.beats.length} shots · AI narrator · {t.slots.map((s) => s.role).join(' + ')}
              </Text>
            </View>
            {starting === t.id ? <ActivityIndicator color={colors.yellow} /> : <Text style={styles.go}>Direct →</Text>}
          </Pressable>
        ))}

        <Text style={type.label}>Cinematic genres</Text>
        <View style={styles.grid}>
          {GENRES.filter((g) => g.id !== 'fate').map((g) => (
            <Pressable
              key={g.id}
              testID={`studio-genre-${g.id}`}
              onPress={() => start('genre', g.id)}
              style={({ pressed }) => [styles.genre, { borderColor: GENRE_COLORS[g.id as GenreId] ?? colors.border, opacity: pressed ? 0.85 : 1 }]}>
              <Text style={{ fontSize: 30 }}>{g.emoji}</Text>
              <Text style={styles.genreLabel}>{g.label}</Text>
              {starting === g.id ? <ActivityIndicator color={colors.yellow} size="small" /> : null}
            </Pressable>
          ))}
        </View>

        {productions.length > 0 ? (
          <>
            <Text style={type.label}>In production</Text>
            {productions.map((m) => (
              <Pressable key={m._id} onPress={() => open(m)} style={styles.prodRow}>
                <Text style={{ fontSize: 26 }}>{m.status === 'draft' ? '📝' : m.status === 'failed' ? '⚠️' : '🎬'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prodTitle} numberOfLines={1}>
                    {m.title}
                  </Text>
                  <Text style={type.small}>{m.status === 'draft' ? 'Draft · tap to keep directing' : m.status === 'failed' ? 'Render failed · tap to retry' : 'Rendering in Blender · tap to watch'}</Text>
                </View>
                {m.status === 'rendering' || m.status === 'queued' || m.status === 'voicing' ? <ActivityIndicator color={colors.yellow} /> : <Text style={styles.go}>›</Text>}
              </Pressable>
            ))}
          </>
        ) : null}

        {finished.length > 0 ? (
          <>
            <Text style={type.label}>Your premieres</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {finished.map((m) => (
                <Pressable key={m._id} onPress={() => open(m)} style={[styles.poster, { borderColor: GENRE_COLORS[m.genre] ?? colors.yellow }]}>
                  {m.thumbnailUrl ? (
                    <Image source={{ uri: m.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  ) : m.cast[0]?.look ? (
                    <BlockyCharacter look={m.cast[0].look} size={70} animate={false} />
                  ) : null}
                  <Text style={styles.posterTitle} numberOfLines={2}>
                    {m.title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Text style={type.label}>How Cast makes a reel</Text>
        <View style={styles.pipeline}>
          {PIPELINE.map((s, i) => (
            <View key={s.label} style={styles.step}>
              <Text style={{ fontSize: 22 }}>{s.icon}</Text>
              <Text style={styles.stepLabel}>{s.label}</Text>
              <Text style={styles.stepSub}>{s.sub}</Text>
              {i < PIPELINE.length - 1 ? <Text style={styles.arrow}>→</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 18, paddingBottom: 32, gap: 14 },
  starCard: { flexDirection: 'row', gap: 14, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
  starArt: { width: 120, height: 150, borderRadius: radius.md, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  smallBtn: { alignSelf: 'flex-start', backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  smallBtnText: { color: '#0A0A0A', fontWeight: '900' },
  reelCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: '#1B1030', borderWidth: 1.5, borderColor: '#6B4BFF' },
  go: { color: colors.yellow, fontWeight: '900', fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  genre: { width: '31.5%', aspectRatio: 1, borderRadius: radius.md, borderWidth: 1.5, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 6 },
  genreLabel: { color: colors.text, fontWeight: '800', fontSize: 13, textAlign: 'center' },
  prodRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface },
  prodTitle: { color: colors.text, fontWeight: '800', fontSize: 16 },
  poster: { width: 120, height: 170, borderRadius: radius.md, borderWidth: 1.5, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'flex-end', padding: 8, gap: 6, overflow: 'hidden' },
  posterTitle: { color: colors.text, fontWeight: '800', fontSize: 13, textAlign: 'center' },
  pipeline: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12 },
  step: { width: '31%', alignItems: 'center', paddingVertical: 8, gap: 2 },
  stepLabel: { color: colors.text, fontWeight: '800', fontSize: 13 },
  stepSub: { color: colors.muted, fontSize: 11 },
  arrow: { position: 'absolute', right: -6, top: 16, color: colors.faint },
});
