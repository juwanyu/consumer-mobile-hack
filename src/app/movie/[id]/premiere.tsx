import { useQuery } from 'convex/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { BigButton, Screen } from '@/components/ui';
import { colors } from '@/theme';

export default function Premiere() {
  const { id } = useLocalSearchParams<{ id: Id<'movies'> }>();
  const router = useRouter();
  const movie = useQuery(api.movies.get, { movieId: id });
  const player = useVideoPlayer(movie?.videoUrl ?? null, (p) => {
    p.loop = true;
    p.play();
  });

  if (!movie?.videoUrl) {
    return (
      <Screen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </Screen>
    );
  }

  return (
    <View style={styles.full}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      <Screen style={styles.overlay}>
        <BigButton label="Back to the stage" onPress={() => router.replace('/')} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#000' },
  overlay: { justifyContent: 'flex-end', backgroundColor: 'transparent' },
});
