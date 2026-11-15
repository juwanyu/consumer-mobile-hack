import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { BlockyCharacter } from '@/components/blocky-character';
import { BigButton, Label, Screen } from '@/components/ui';
import { colors, radius, type } from '@/theme';

export default function Render() {
  const { id } = useLocalSearchParams<{ id: Id<'movies'> }>();
  const router = useRouter();
  const movie = useQuery(api.movies.get, { movieId: id });
  const retry = useMutation(api.movies.retry);
  const width = useRef(new Animated.Value(0)).current;
  const pct = movie?.progress?.pct ?? 0;

  useEffect(() => {
    Animated.timing(width, { toValue: pct, duration: 500, useNativeDriver: false }).start();
  }, [pct, width]);

  useEffect(() => {
    if (movie?.status === 'done') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/movie/[id]/premiere', params: { id } });
    }
    if (movie?.status === 'failed') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [movie?.status, router, id]);

  if (!movie) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </Screen>
    );
  }

  const lead = movie.castDetails[0];

  if (movie.status === 'failed') {
    return (
      <Screen style={styles.centered}>
        <Text style={{ fontSize: 64 }}>🎬</Text>
        <Text style={[type.title, { textAlign: 'center' }]}>Cut! Something broke.</Text>
        <Text style={[type.body, { color: colors.muted, textAlign: 'center' }]}>{movie.error ?? 'The render failed.'}</Text>
        <View style={{ alignSelf: 'stretch', gap: 10 }}>
          <BigButton testID="retry-render" label="Try again" icon="🔁" onPress={() => retry({ movieId: id })} />
          <BigButton variant="ghost" label="Back to the stage" onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }

  const previews = movie.previewUrls ?? [];
  const latest = previews[previews.length - 1];
  const stages = movie.stages ?? [];
  const waiting = movie.status === 'queued' || movie.status === 'voicing';

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <Pressable onPress={() => router.back()} hitSlop={16}>
          <Text style={type.small}>← Back</Text>
        </Pressable>
        <Label>{waiting ? (movie.status === 'voicing' ? 'Recording the narrator' : 'Waiting for the render farm') : 'Live from Blender'}</Label>
        <Text style={type.title}>{movie.story.title}</Text>
        <View style={styles.monitor}>
          {latest ? (
            <Image source={{ uri: latest.url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : lead?.look ? (
            <BlockyCharacter look={lead.look} size={150} />
          ) : null}
          <View style={styles.rec}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>{latest ? `SHOT ${latest.shot}` : 'REC'}</Text>
          </View>
        </View>
        <View style={styles.strip}>
          {Array.from({ length: movie.shotCount || 6 }, (_, i) => {
            const p = previews.find((x) => x.shot === i + 1);
            return (
              <View key={i} style={[styles.thumb, p && { borderColor: colors.yellow }]}>
                {p ? <Image source={{ uri: p.url }} style={StyleSheet.absoluteFill} /> : <Text style={styles.thumbNum}>{i + 1}</Text>}
              </View>
            );
          })}
        </View>
        <Text testID="render-progress" style={type.heading}>
          {movie.progress?.label ?? 'Rolling…'}
        </Text>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
        </View>
        <View style={{ gap: 6 }}>
          {stages.map((s, i) => (
            <View key={i} style={styles.stage}>
              <Text style={{ color: i === stages.length - 1 ? colors.yellow : colors.green, fontWeight: '900' }}>{i === stages.length - 1 ? '●' : '✓'}</Text>
              <Text style={[styles.stageText, i === stages.length - 1 && { color: colors.text }]}>{s}</Text>
            </View>
          ))}
        </View>
        <Text style={type.small}>
          Starring {movie.castDetails.map((c) => `${c.name} as ${c.role}`).join(', ')} · rendered in Blender on a Mac, delivered through Convex
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  track: { alignSelf: 'stretch', height: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceHi, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.yellow, borderRadius: radius.pill },
  monitor: { alignSelf: 'center', width: 220, height: 390, borderRadius: radius.md, backgroundColor: '#111', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.border },
  rec: { position: 'absolute', top: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  recText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  strip: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  thumb: { width: 46, height: 82, borderRadius: 6, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbNum: { color: colors.faint, fontWeight: '900' },
  stage: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  stageText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
});
