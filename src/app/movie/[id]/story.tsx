import { useMutation, useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import type { Story } from '../../../../convex/story';
import { BlockyCharacter } from '@/components/blocky-character';
import { Chips } from '@/components/chips';
import { ClapperButton } from '@/components/clapper-button';
import { Label, Screen } from '@/components/ui';
import { ACTIONS, CAMERA_MARKS, CAMERA_MOVES, GENRE_COLORS, LOCATIONS, library, type GenreId } from '@/library';
import { colors, radius, type } from '@/theme';

export default function StoryEditor() {
  const { id } = useLocalSearchParams<{ id: Id<'movies'> }>();
  const router = useRouter();
  const movie = useQuery(api.movies.get, { movieId: id });
  const updateStory = useMutation(api.movies.updateStory);
  const setRole = useMutation(api.movies.setRole);
  const lock = useMutation(api.movies.action);
  const [story, setStory] = useState<Story | null>(null);
  const [rolling, setRolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (movie && !story) setStory(movie.story);
    if (movie && movie.status !== 'draft') router.replace({ pathname: '/movie/[id]/render', params: { id } });
  }, [movie, story, router, id]);

  if (movie === undefined || (movie && !story)) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </Screen>
    );
  }
  if (movie === null || !story) {
    return (
      <Screen style={styles.centered}>
        <Text style={type.title}>Movie not found</Text>
      </Screen>
    );
  }

  const genre = library.genres[movie.genre as GenreId];
  const accent = GENRE_COLORS[movie.genre] ?? colors.yellow;
  const lead = movie.castDetails[0];

  const edit = (next: Story) => {
    setStory(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => updateStory({ movieId: id, story: next }).catch(() => {}), 500);
  };
  const editShot = (i: number, patch: Partial<Story['shots'][number]>) =>
    edit({ ...story, shots: story.shots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const roll = async () => {
    setRolling(true);
    setError(null);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await updateStory({ movieId: id, story });
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
            {genre?.emoji} {genre?.label}
          </Text>
          <TextInput
            testID="story-title"
            value={story.title}
            onChangeText={(title) => edit({ ...story, title })}
            style={[type.title, styles.titleInput]}
            placeholder="Movie title"
            placeholderTextColor={colors.faint}
            multiline
          />
          <TextInput
            testID="story-logline"
            value={story.logline}
            onChangeText={(logline) => edit({ ...story, logline })}
            style={[type.body, styles.input]}
            placeholder="One-line logline"
            placeholderTextColor={colors.faint}
            multiline
          />

          {lead ? (
            <View style={styles.castCard}>
              {lead.look ? <BlockyCharacter look={lead.look} size={70} animate={false} /> : null}
              <View style={{ flex: 1, gap: 8 }}>
                <Text style={type.heading}>{lead.name}</Text>
                <Chips
                  testID="role-picker"
                  accent={accent}
                  options={(genre?.roles ?? []).map((r) => ({ id: r, label: r }))}
                  value={lead.role}
                  onChange={(role) => setRole({ movieId: id, castMemberId: lead.castMemberId, role })}
                />
              </View>
            </View>
          ) : null}

          {story.shots.map((shot, i) => (
            <View key={i} style={[styles.shot, { borderColor: accent }]}>
              <Text style={[type.heading, { color: accent }]}>Shot {i + 1}</Text>
              <Label>Location</Label>
              <Chips accent={accent} options={LOCATIONS} value={shot.location} onChange={(location) => editShot(i, { location })} />
              <Label>Action</Label>
              <Chips accent={accent} options={ACTIONS} value={shot.action} onChange={(action) => editShot(i, { action })} />
              <Label>Camera</Label>
              <Chips accent={accent} options={CAMERA_MARKS} value={shot.cameraMark} onChange={(cameraMark) => editShot(i, { cameraMark })} />
              <Chips accent={accent} options={CAMERA_MOVES} value={shot.cameraMove} onChange={(cameraMove) => editShot(i, { cameraMove })} />
              <Label>Line</Label>
              <TextInput
                testID={`shot-${i + 1}-dialogue`}
                value={shot.dialogue}
                onChangeText={(dialogue) => editShot(i, { dialogue })}
                style={[type.body, styles.input]}
                placeholder={`What does ${lead?.name ?? 'the star'} say?`}
                placeholderTextColor={colors.faint}
                maxLength={90}
              />
            </View>
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
        <ClapperButton onPress={roll} loading={rolling} />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { gap: 14, paddingBottom: 24 },
  titleInput: { padding: 0 },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12 },
  castCard: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14 },
  shot: { gap: 10, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, borderLeftWidth: 4 },
  error: { color: colors.red, fontWeight: '700' },
});
