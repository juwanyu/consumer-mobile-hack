import { useMutation, useQuery } from 'convex/react';
import { useEvent } from 'expo';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { BigButton, Pill } from '@/components/ui';
import { GENRE_COLORS, library, type GenreId } from '@/library';
import { colors, type } from '@/theme';

export default function Premiere() {
  const { id } = useLocalSearchParams<{ id: Id<'movies'> }>();
  const router = useRouter();
  const movie = useQuery(api.movies.get, { movieId: id });
  const post = useMutation(api.movies.postToFeed);
  const [posting, setPosting] = useState(false);
  const [muted, setMuted] = useState(false);
  const titleCard = useRef(new Animated.Value(1)).current;
  const panel = useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(movie?.videoUrl ?? null, (p) => {
    p.loop = false;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      setEnded(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.spring(panel, { toValue: 1, useNativeDriver: true }).start();
    });
    return () => sub.remove();
  }, [player, panel]);

  useEffect(() => {
    if (status !== 'readyToPlay') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    titleCard.setValue(1);
    Animated.sequence([
      Animated.delay(1600),
      Animated.timing(titleCard, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => player.play());
  }, [status, player, titleCard]);

  if (!movie?.videoUrl) {
    return (
      <View style={[styles.full, styles.center]}>
        <ActivityIndicator color={colors.yellow} size="large" />
      </View>
    );
  }

  const genre = library.genres[movie.genre as GenreId];
  const accent = GENRE_COLORS[movie.genre] ?? colors.yellow;
  const credits = movie.castDetails.map((c) => `${c.name} as ${c.role}`).join('  ·  ');

  const replay = () => {
    setEnded(false);
    panel.setValue(0);
    player.currentTime = 0;
    player.play();
  };

  return (
    <View style={styles.full}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => (isPlaying ? player.pause() : player.play())}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      </Pressable>

      <Animated.View pointerEvents="none" style={[styles.titleCard, { opacity: titleCard }]}>
        <Text style={[type.label, { color: accent }]}>
          {genre?.emoji} A Cast original
        </Text>
        <Text style={[type.hero, { textAlign: 'center' }]}>{movie.story.title}</Text>
        {movie.story.logline ? <Text style={[type.body, styles.logline]}>{movie.story.logline}</Text> : null}
        <Text style={[type.small, { color: colors.text }]}>Starring {credits}</Text>
      </Animated.View>

      <SafeAreaView style={styles.chrome} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.topRow}>
          <Pressable onPress={() => router.replace('/')} hitSlop={16} style={styles.iconButton}>
            <Text style={styles.icon}>✕</Text>
          </Pressable>
          <Pressable
            testID="toggle-sound"
            onPress={() => {
              player.muted = !muted;
              setMuted(!muted);
            }}
            hitSlop={16}
            style={styles.iconButton}>
            <Text style={styles.icon}>{muted ? '🔇' : '🔊'}</Text>
          </Pressable>
        </View>

        <Animated.View
          style={[
            styles.panel,
            {
              opacity: ended ? 1 : 0.0001,
              transform: [{ translateY: panel.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }],
            },
          ]}
          pointerEvents={ended ? 'auto' : 'none'}>
          <Pill text="That's a wrap" color={accent} />
          <Text style={type.title} numberOfLines={2}>
            {movie.story.title}
          </Text>
          <Text style={type.small}>Starring {credits}</Text>
          {movie.okToPost ? (
            <BigButton
              testID="post-to-feed"
              icon={movie.postedToFeed ? '✅' : '📣'}
              label={movie.postedToFeed ? 'On the feed' : 'Post to the feed'}
              disabled={movie.postedToFeed}
              loading={posting}
              onPress={async () => {
                setPosting(true);
                await post({ movieId: id }).finally(() => setPosting(false));
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
            />
          ) : (
            <Text style={type.small}>🔒 Private — the star didn't OK posting.</Text>
          )}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <BigButton testID="recast" variant="secondary" icon="🔄" label="Recast" onPress={() => router.push({ pathname: '/cast/consent', params: { recast: id } })} />
            </View>
            <View style={{ flex: 1 }}>
              <BigButton testID="replay" variant="secondary" icon="▶️" label="Replay" onPress={replay} />
            </View>
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  full: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  titleCard: { ...StyleSheet.absoluteFill, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
  logline: { textAlign: 'center', color: colors.muted },
  chrome: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.text, fontSize: 18, fontWeight: '900' },
  panel: { margin: 12, padding: 18, gap: 12, borderRadius: 28, backgroundColor: 'rgba(10,10,14,0.92)', borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', gap: 10 },
});
