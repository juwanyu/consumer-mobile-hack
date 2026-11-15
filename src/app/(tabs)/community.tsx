import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Avatar } from '@/components/avatar';
import { FaceRow } from '@/components/face-row';
import { compact } from '@/components/reel-card';
import { useMyId } from '@/me';
import { colors, radius } from '@/theme';

const W = Dimensions.get('window').width;
const HERO_W = W - 40;
const CARD_W = (W - 40 - 12) / 2;

function Pulse({ color, children }: { color: string; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 72,
          height: 72,
          borderRadius: 36,
          borderWidth: 3,
          borderColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.25] }) }],
        }}
      />
      <View style={{ width: 66, height: 66, borderRadius: 33, borderWidth: 3, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  );
}

export default function Crews() {
  const router = useRouter();
  const id = useMyId();
  const crews = useQuery(api.crews.list, { userId: id ?? undefined });
  const live = useQuery(api.coop.live, {});
  const join = useMutation(api.crews.toggleJoin);
  const open = (slug: string) => {
    Haptics.selectionAsync();
    router.push({ pathname: '/crew/[slug]', params: { slug } });
  };
  const toggle = (crewId: Id<'crews'>) => {
    if (!id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    join({ crewId, userId: id });
  };
  const hero = (crews ?? []).slice(0, 4);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Crews</Text>
          <Text style={styles.subtitle}>Make reels together</Text>
        </View>

        <FlatList
          horizontal
          data={hero}
          keyExtractor={(c) => c._id}
          snapToInterval={HERO_W + 12}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          renderItem={({ item }) => (
            <Pressable testID={`hero-${item.slug}`} onPress={() => open(item.slug)} style={[styles.hero, { borderColor: item.accent }]}>
              {item.cover ? <Image source={{ uri: item.cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
              <View style={styles.heroShade} />
              <View style={styles.heroTop}>
                {item.liveCoopId ? (
                  <View style={styles.livePill}>
                    <View style={styles.liveDot} />
                    <Text style={styles.livePillText}>CO-OP LIVE</Text>
                  </View>
                ) : (
                  <View />
                )}
                {item.whop ? (
                  <View style={styles.whop}>
                    <Text style={styles.whopText}>WHOP</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ gap: 8 }}>
                <Text style={styles.heroName}>
                  {item.emoji} {item.name}
                </Text>
                <Text style={styles.heroBlurb} numberOfLines={1}>
                  {item.blurb}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <FaceRow faces={item.faces} extra={`${compact(item.members)} members`} />
                  <Pressable onPress={() => toggle(item._id)} hitSlop={8} style={[styles.joinPill, { backgroundColor: item.joined ? 'rgba(255,255,255,0.18)' : item.accent }]}>
                    <Text style={[styles.joinText, item.joined && { color: colors.text }]}>{item.joined ? 'Joined ✓' : 'Join'}</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          )}
        />

        {live && live.length ? (
          <>
            <Text style={styles.section}>🔴 Live now · co-op casting</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}>
              {live.map((l) => (
                <Pressable
                  key={l._id}
                  testID={`live-${l._id}`}
                  onPress={() => {
                    Haptics.selectionAsync();
                    router.push({ pathname: '/coop/[id]', params: { id: l._id } });
                  }}
                  style={{ alignItems: 'center', width: 84, gap: 4 }}>
                  <Pulse color={colors.pink}>
                    <Avatar look={l.host?.look} name={l.host?.name} size={56} />
                  </Pulse>
                  <Text style={styles.liveName} numberOfLines={1}>
                    {l.crew?.emoji} {l.crew?.name}
                  </Text>
                  <Text style={styles.liveMeta}>
                    {l.title} · {l.filled}/{l.total}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        <Text style={styles.section}>All crews</Text>
        <View style={styles.grid}>
          {(crews ?? []).map((c) => (
            <Pressable key={c._id} testID={`crew-${c.slug}`} onPress={() => open(c.slug)} style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.97 }] }]}>
              <View style={styles.cover}>
                {c.cover ? <Image source={{ uri: c.cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                <View style={[styles.emojiBadge, { backgroundColor: c.accent }]}>
                  <Text style={{ fontSize: 20 }}>{c.emoji}</Text>
                </View>
                {c.whop ? (
                  <View style={[styles.whop, { position: 'absolute', top: 8, right: 8 }]}>
                    <Text style={styles.whopText}>WHOP</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ padding: 10, gap: 6 }}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {c.name}
                </Text>
                <FaceRow faces={c.faces} size={18} extra={compact(c.members)} />
                {c.challenge ? (
                  <Text style={[styles.challenge, { color: c.accent }]} numberOfLines={1}>
                    🏆 {c.challenge.title}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  titleRow: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14, flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  title: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  subtitle: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  hero: { width: HERO_W, height: 230, borderRadius: radius.lg, overflow: 'hidden', padding: 16, justifyContent: 'space-between', backgroundColor: colors.surface, borderWidth: 2 },
  heroShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.42)' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between' },
  heroName: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -1, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
  heroBlurb: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  joinPill: { borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 9 },
  joinText: { color: '#000', fontWeight: '900', fontSize: 15 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.pink, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  livePillText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  whop: { backgroundColor: '#FA4616', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  whopText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  section: { color: colors.text, fontSize: 19, fontWeight: '900', paddingHorizontal: 20, marginTop: 26, marginBottom: 12 },
  liveName: { color: colors.text, fontSize: 12, fontWeight: '800' },
  liveMeta: { color: colors.pink, fontSize: 11, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 },
  card: { width: CARD_W, borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  cover: { height: CARD_W * 1.05, backgroundColor: colors.surfaceHi },
  emojiBadge: { position: 'absolute', left: 8, bottom: -16, width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.surface },
  cardName: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 10 },
  challenge: { fontSize: 12, fontWeight: '800' },
});
