import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { REEL_TEMPLATES } from '../../../../convex/reels';
import { BlockyCharacter } from '@/components/blocky-character';
import { ClapperButton } from '@/components/clapper-button';
import { Label, Screen } from '@/components/ui';
import { library } from '@/library';
import { colors, radius, type } from '@/theme';

type Beat = { caption: string; narration: string };

export default function ReelEditor() {
  const { id } = useLocalSearchParams<{ id: Id<'movies'> }>();
  const router = useRouter();
  const movie = useQuery(api.movies.get, { movieId: id });
  const ready = useQuery(api.casting.listReady);
  const updateReel = useMutation(api.movies.updateReel);
  const setSlot = useMutation(api.movies.setSlot);
  const lock = useMutation(api.movies.action);
  const [beats, setBeats] = useState<Beat[] | null>(null);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (movie?.reel && !beats) setBeats(movie.reel.beats);
    if (movie && movie.status !== 'draft') router.replace({ pathname: '/movie/[id]/render', params: { id } });
  }, [movie, beats, router, id]);

  if (!movie || !movie.reel || !beats) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </Screen>
    );
  }

  const template = REEL_TEMPLATES[movie.reel.templateId];
  const accent = colors.pink;

  const edit = (i: number, patch: Partial<Beat>) => {
    const next = beats.map((b, j) => (j === i ? { ...b, ...patch } : b));
    setBeats(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => updateReel({ movieId: id, beats: next }).catch(() => {}), 500);
  };

  const roll = async () => {
    setRolling(true);
    setError(null);
    try {
      if (timer.current) clearTimeout(timer.current);
      await updateReel({ movieId: id, beats });
      await lock({ movieId: id });
      router.replace({ pathname: '/movie/[id]/render', params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not roll camera.');
      setRolling(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} hitSlop={16}>
            <Text style={type.small}>← Back</Text>
          </Pressable>
          <Text style={[type.label, { color: accent }]}>
            {template?.emoji} Punchy reel · {template?.label}
          </Text>
          <Text style={type.title}>{movie.story.title}</Text>
          <Text style={[type.body, { color: colors.muted }]}>{movie.story.logline}</Text>

          {template?.slots.map((slot) => {
            const current = movie.castDetails.find((c) => c.slot === slot.id);
            return (
              <View key={slot.id} style={styles.slot}>
                <Label>{slot.role}</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {!slot.required ? (
                    <Pressable onPress={() => setSlot({ movieId: id, slot: slot.id })} style={[styles.person, !current && { borderColor: accent }]}>
                      <Text style={{ fontSize: 28 }}>∅</Text>
                      <Text style={type.small}>Nobody</Text>
                    </Pressable>
                  ) : null}
                  {(ready ?? []).map((m) => (
                    <Pressable
                      key={m._id}
                      onPress={() => setSlot({ movieId: id, slot: slot.id, castMemberId: m._id })}
                      style={[styles.person, current?.castMemberId === m._id && { borderColor: accent }]}>
                      {m.look ? <BlockyCharacter look={m.look} size={44} animate={false} /> : null}
                      <Text style={[type.small, { color: colors.text }]} numberOfLines={1}>
                        {m.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            );
          })}

          {template?.beats.map((beat, i) => (
            <View key={i} style={[styles.beat, { borderColor: accent }]}>
              <Text style={[type.heading, { color: accent }]}>
                Beat {i + 1} · {library.locations[beat.location as keyof typeof library.locations]?.label ?? beat.location}
              </Text>
              <Text style={type.small}>
                {beat.hud.map((h) => `${h.label} ${h.value}`).join('  ·  ')}  ·  fx: {[beat.fx].flat().join(', ').replace(/_/g, ' ')}
              </Text>
              <Label>Narrator</Label>
              <TextInput
                testID={`beat-${i + 1}-narration`}
                value={beats[i]?.narration ?? ''}
                onChangeText={(narration) => edit(i, { narration })}
                style={[type.body, styles.input]}
                multiline
                maxLength={140}
                placeholderTextColor={colors.faint}
              />
              <Label>On-screen caption</Label>
              <TextInput
                testID={`beat-${i + 1}-caption`}
                value={beats[i]?.caption ?? ''}
                onChangeText={(caption) => edit(i, { caption })}
                style={[type.body, styles.input, { fontWeight: '900' }]}
                maxLength={60}
                placeholderTextColor={colors.faint}
              />
            </View>
          ))}
          <Text style={type.small}>Use {'{master}'} and {'{caster}'} to drop in the cast's names.</Text>
          {error ? <Text style={{ color: colors.red, fontWeight: '700' }}>{error}</Text> : null}
        </ScrollView>
        <ClapperButton onPress={roll} loading={rolling} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingBottom: 24 },
  slot: { gap: 8 },
  person: { width: 76, alignItems: 'center', gap: 4, backgroundColor: colors.surface, borderRadius: radius.md, padding: 8, borderWidth: 2, borderColor: 'transparent' },
  beat: { gap: 8, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderLeftWidth: 4 },
  input: { backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10 },
});
