import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { Look } from '../../convex/looks';
import { Avatar } from '@/components/avatar';
import { useRemixGate } from '@/components/remix-gate';
import { GENRE_COLORS, library, type GenreId } from '@/library';
import { useLocalIds } from '@/local';
import { useMyId } from '@/me';
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
  thumbnailUrl: string | null;
  commentCount: number;
  shareCount: number;
  views: number;
  remixCount: number;
  owner: { _id: Id<'users'>; handle: string; name: string; look: Look | null } | null;
  cast: { name: string; role: string; look: Look | null }[];
};

export function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

type Props = {
  item: ReelItem;
  active: boolean;
  height: number;
  bottomInset: number;
  muted: boolean;
  onToggleMute: () => void;
  onComments: () => void;
  onSend: () => void;
};

export function ReelCard({ item, active, height, bottomInset, muted, onToggleMute, onComments, onSend }: Props) {
  const router = useRouter();
  const gateHook = useRemixGate(item._id);
  const like = useMutation(api.movies.like);
  const follow = useMutation(api.social.toggleFollow);
  const me = useMyId();
  const [following, setFollowing] = useState(false);
  const liked = useLocalIds('liked');
  const saved = useLocalIds('saved');
  const heart = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0);
  const player = useVideoPlayer(item.videoUrl, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.25;
  });
  const time = useEvent(player, 'timeUpdate');

  useEffect(() => {
    if (time && player.duration > 0) setProgress(Math.min(1, time.currentTime / player.duration));
  }, [time, player]);

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
  const likeCount = item.likes;

  const toggleLike = async (fromDoubleTap = false) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (fromDoubleTap && isLiked) {
      burst();
      return;
    }
    const nowLiked = await liked.toggle(item._id);
    like({ movieId: item._id, delta: nowLiked ? 1 : -1 });
    if (nowLiked) burst();
  };
  const burst = () => {
    heart.setValue(0);
    Animated.sequence([
      Animated.spring(heart, { toValue: 1, useNativeDriver: true }),
      Animated.timing(heart, { toValue: 0, duration: 300, delay: 300, useNativeDriver: true }),
    ]).start();
  };

  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = 0;
      toggleLike(true);
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(onToggleMute, 280);
  };

  const credits = item.cast.map((c) => `${c.name} as ${c.role}`).join(' · ');
  const gate = gateHook;

  return (
    <View style={{ height, backgroundColor: '#000' }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onTap}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      </Pressable>
      <View pointerEvents="none" style={styles.shadeBottom} />
      <Animated.Text pointerEvents="none" style={[styles.bigHeart, { opacity: heart, transform: [{ scale: heart.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.3] }) }] }]}>
        ❤️
      </Animated.Text>

      <View style={[styles.rail, { bottom: bottomInset + 110 }]}>
        <RailButton testID="like" icon={isLiked ? 'heart.fill' : 'heart'} tint={isLiked ? colors.red : colors.text} label={compact(likeCount)} onPress={() => toggleLike()} />
        <RailButton testID="comments" icon="bubble.right" label={compact(item.commentCount)} onPress={onComments} />
        <RailButton testID="remix" icon={gate.locked ? 'lock.open.fill' : 'arrow.2.squarepath'} tint={gate.locked ? colors.yellow : colors.text} label={gate.locked ? `$${gate.access!.price}` : compact(item.remixCount)} onPress={gate.open} />
        <RailButton testID="send" icon="paperplane" label={compact(item.shareCount)} onPress={onSend} />
        <RailButton
          testID="save"
          icon={isSaved ? 'bookmark.fill' : 'bookmark'}
          tint={isSaved ? colors.yellow : colors.text}
          onPress={() => {
            Haptics.selectionAsync();
            saved.toggle(item._id);
          }}
        />
      </View>

      <View style={[styles.meta, { bottom: bottomInset + 20 }]}>
        <Pressable
          style={styles.authorRow}
          disabled={!item.owner}
          onPress={() => item.owner && router.push({ pathname: '/u/[handle]', params: { handle: item.owner.handle } })}>
          <Avatar look={item.owner?.look ?? item.cast[0]?.look} name={item.owner?.name ?? item.cast[0]?.name} size={36} ring />
          <Text style={styles.handle}>{item.owner ? item.owner.handle : 'cast.studio'}</Text>
          {item.owner && me && item.owner._id !== me ? (
            <Pressable
              testID="follow-owner"
              hitSlop={6}
              onPress={() => {
                Haptics.selectionAsync();
                setFollowing((f) => !f);
                follow({ followerId: me, followeeId: item.owner!._id });
              }}
              style={[styles.follow, following && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={styles.followText}>{following ? 'Following' : 'Follow'}</Text>
            </Pressable>
          ) : null}
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.views}>▶ {compact(item.views)} views</Text>
        <Text style={styles.caption} numberOfLines={2}>
          <Text style={{ color: accent, fontWeight: '900' }}>
            {genre?.emoji ?? '🎬'} {item.style}
          </Text>
          {'  '}Starring {credits}
        </Text>
        <View style={styles.castRow}>
          {item.cast.slice(0, 3).map((c, i) => (
            <View key={i} style={{ marginLeft: i ? -8 : 0 }}>
              <Avatar look={c.look} name={c.name} size={22} />
            </View>
          ))}
          <Text style={styles.castText}>
            {item.remixCount > 0 ? `${compact(item.remixCount)} people put themselves in this` : 'Tap remix to put yourself in this'}
          </Text>
        </View>
      </View>
      <View style={[styles.progressTrack, { bottom: bottomInset + 8 }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      {muted ? (
        <View style={styles.muted} pointerEvents="none">
          <SymbolView name="speaker.slash.fill" size={22} tintColor={colors.text} />
        </View>
      ) : null}
    </View>
  );
}

function RailButton({ icon, label, onPress, testID, tint = colors.text }: { icon: SFSymbol; label?: string; onPress: () => void; testID?: string; tint?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={testID} onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.railButton, { transform: [{ scale: pressed ? 0.88 : 1 }] }]}>
      <SymbolView name={icon} size={30} tintColor={tint} weight="semibold" style={styles.railIcon} />
      {label !== undefined ? <Text style={styles.railLabel}>{label}</Text> : null}
    </Pressable>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

const styles = StyleSheet.create({
  shadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 320, backgroundColor: 'rgba(0,0,0,0.28)' },
  rail: { position: 'absolute', right: 8, gap: 16, alignItems: 'center' },
  railButton: { alignItems: 'center', gap: 3, minWidth: 48 },
  railIcon: { width: 32, height: 32 },
  railLabel: { color: colors.text, fontSize: 13, fontWeight: '700', ...shadow },
  meta: { position: 'absolute', left: 14, right: 78, gap: 6 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  handle: { color: colors.text, fontSize: 16, fontWeight: '800', ...shadow },
  follow: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  followText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  title: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.3, ...shadow },
  views: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '800', marginTop: -2, ...shadow },
  caption: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 19, ...shadow },
  castRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  castText: { ...type.small, color: 'rgba(255,255,255,0.85)', fontSize: 13, ...shadow },
  progressTrack: { position: 'absolute', left: 14, right: 14, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.text },
  bigHeart: { position: 'absolute', alignSelf: 'center', top: '40%', fontSize: 110 },
  muted: { position: 'absolute', top: '46%', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 30, padding: 16 },
});
