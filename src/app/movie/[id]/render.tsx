import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';

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

  return (
    <Screen>
      <View style={styles.centered}>
        <Label>Now filming</Label>
        <Text style={[type.title, { textAlign: 'center' }]}>{movie.story.title}</Text>
        {lead?.look ? <BlockyCharacter look={lead.look} size={180} /> : null}
        <Text testID="render-progress" style={[type.heading, { textAlign: 'center' }]}>
          {movie.progress?.label ?? 'Rolling…'}
        </Text>
        <View style={styles.track}>
          <Animated.View
            style={[styles.fill, { width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]}
          />
        </View>
        <Text style={type.small}>
          Starring {movie.castDetails.map((c) => `${c.name} as ${c.role}`).join(', ')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  track: { alignSelf: 'stretch', height: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceHi, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.yellow, borderRadius: radius.pill },
});
