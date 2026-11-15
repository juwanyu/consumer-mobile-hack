import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { GENRE_COLORS, library, type GenreId } from '@/library';
import { useLocalIds } from '@/local';
import { colors, type } from '@/theme';

export type ReelItem = {
  _id: Id<'movies'>;
  genre: string;
  title: string;
  logline: string;
  likes: number;
  style: string;
  isReel: boolean;
  remixOf: string | null;
  videoUrl: string | null;
  cast: { name: string; role: string }[];
};

export function ReelCard({ item, active, height, muted, onToggleMute }: { item: ReelItem; active: boolean; height: number; muted: boolean; onToggleMute: () => void }) {
  const router = useRouter();
  const like = useMutation(api.movies.like);
  const liked = useLocalIds('liked');
  const saved = useLocalIds('saved');
  const heart = useRef(new Animated.Value(0)).current;
  const player = useVideoPlayer(item.videoUrl, (p) => {
    p.loop = true;
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (active) {
      player.currentTime = 0;
      player.play();
    } else {
      player.pause();
    }
  }, [active, player]);

  const isLiked = liked.has(item._id);
  const isSaved = saved.has(item._id);
  const accent = GENRE_COLORS[item.genre] ?? colors.yellow;
  const genre = library.genres[item.genre as GenreId];

  const toggleLike = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const nowLiked = await liked.toggle(item._id);
    like({ movieId: item._id, delta: nowLiked ? 1 : -1 });
    if (nowLiked) {
      heart.setValue(0);
      Animated.sequence([
        Animated.spring(heart, { toValue: 1, useNativeDriver: true }),
        Animated.timing(heart, { toValue: 0, duration: 300, delay: 300, useNativeDriver: true }),
      ]).start();
    }
  };

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onToggleMute} onLongPress={toggleLike}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      </Pressable>
      <Animated.Text pointerEvents="none" style={[styles.bigHeart, { opacity: heart, transform: [{ scale: heart.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.3] }) }] }]}>
        ❤️
      </Animated.Text>

      <View style={styles.rail}>
        <RailButton testID="like" icon={isLiked ? '❤️' : '🤍'} label={String(item.likes)} onPress={toggleLike} />
        <RailButton
          testID="save"
          icon={isSaved ? '🔖' : '📑'}
          label={isSaved ? 'Saved' : 'Save'}
          onPress={() => {
            Haptics.selectionAsync();
            saved.toggle(item._id);
          }}
        />
        <RailButton
          testID="share"
          icon="↗️"
          label="Share"
          onPress={() =>
            Share.share({
              message: `🎬 ${item.title} — starring ${item.cast.map((c) => c.name).join(', ')}. Made with Cast.`,
              url: item.videoUrl ?? undefined,
            })
          }
        />
        <RailButton testID="remix" icon="🔁" label="Remix" onPress={() => router.push({ pathname: '/movie/[id]/remix', params: { id: item._id } })} />
      </View>

      <View style={styles.meta} pointerEvents="none">
        <Text style={[type.label, { color: accent }]}>
          {genre?.emoji} {item.style}
          {item.remixOf ? '  ·  REMIX' : ''}
        </Text>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.credits} numberOfLines={2}>
          Starring {item.cast.map((c) => `${c.name} as ${c.role}`).join(' · ')}
        </Text>
      </View>
      {muted ? (
        <View style={styles.muted} pointerEvents="none">
          <Text style={{ fontSize: 16 }}>🔇</Text>
        </View>
      ) : null}
    </View>
  );
}

function RailButton({ icon, label, onPress, testID }: { icon: string; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.railButton, { transform: [{ scale: pressed ? 0.9 : 1 }] }]}>
      <Text style={styles.railIcon}>{icon}</Text>
      <Text style={styles.railLabel}>{label}</Text>
    </Pressable>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  rail: { position: 'absolute', right: 10, bottom: 140, gap: 18, alignItems: 'center' },
  railButton: { alignItems: 'center', gap: 2 },
  railIcon: { fontSize: 32, ...shadow },
  railLabel: { color: colors.text, fontSize: 12, fontWeight: '800', ...shadow },
  meta: { position: 'absolute', left: 16, right: 84, bottom: 110, gap: 6 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5, ...shadow },
  credits: { color: colors.text, fontSize: 14, fontWeight: '600', opacity: 0.9, ...shadow },
  bigHeart: { position: 'absolute', alignSelf: 'center', top: '40%', fontSize: 110 },
  muted: { position: 'absolute', top: '48%', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 30, padding: 14 },
});
