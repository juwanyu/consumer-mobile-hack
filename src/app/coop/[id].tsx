import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Avatar } from '@/components/avatar';
import { useMyId } from '@/me';
import { colors, radius, type } from '@/theme';

type Slot = { id: string; role: string; emoji: string; beats: number[]; player: { _id: Id<'users'>; name: string; look: never } | null; mine: boolean; editing: boolean };

function SlotCard({ slot, onClaim, accent }: { slot: Slot; onClaim: () => void; accent: string }) {
  const pop = useRef(new Animated.Value(slot.player ? 1 : 0)).current;
  const who = slot.player?._id;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (who) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      pop.setValue(0.2);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
    } else pop.setValue(0);
  }, [who, pop]);
  return (
    <Pressable testID={`slot-${slot.id}`} onPress={onClaim} style={[styles.slot, slot.mine && { borderColor: accent, backgroundColor: '#1E1A08' }]}>
      <Text style={styles.slotEmoji}>{slot.emoji}</Text>
      <Text style={styles.slotRole}>{slot.role}</Text>
      {slot.player ? (
        <Animated.View style={{ alignItems: 'center', gap: 4, transform: [{ scale: pop }] }}>
          <Avatar look={slot.player.look} name={slot.player.name} size={64} ring />
          <Text style={styles.slotName} numberOfLines={1}>
            {slot.mine ? 'You' : slot.player.name}
          </Text>
          {slot.editing && !slot.mine ? <Text style={styles.editing}>✍️ editing…</Text> : null}
        </Animated.View>
      ) : (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <View style={styles.empty}>
            <Text style={{ color: colors.faint, fontSize: 30, fontWeight: '300' }}>＋</Text>
          </View>
          <View style={[styles.claim, { backgroundColor: accent }]}>
            <Text style={styles.claimText}>Claim role</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function Coop() {
  const { id: coopId } = useLocalSearchParams<{ id: Id<'coops'> }>();
  const router = useRouter();
  const me = useMyId();
  const coop = useQuery(api.coop.get, { coopId, userId: me ?? undefined });
  const claim = useMutation(api.coop.claim);
  const setLine = useMutation(api.coop.setLine);
  const typing = useMutation(api.coop.typing);
  const roll = useMutation(api.coop.roll);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [count, setCount] = useState<number | null>(null);
  const timers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const accent = colors.yellow;

  const allIn = !!coop && coop.slots.every((s) => s.player);
  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      setCount(null);
      if (me) roll({ coopId, userId: me }).catch((e) => Alert.alert('Hold up', String(e.message ?? e)));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const t = setTimeout(() => setCount((c) => (c === null ? null : c - 1)), 800);
    return () => clearTimeout(t);
  }, [count, coopId, me, roll]);

  if (!coop)
    return (
      <SafeAreaView style={[styles.screen, { alignItems: 'center', justifyContent: 'center', gap: 14 }]}>
        <Text style={{ fontSize: 44 }}>🎬</Text>
        <Text style={styles.title}>{coop === null ? 'This lobby already wrapped' : 'Joining the lobby…'}</Text>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/community'))} style={[styles.claim, { backgroundColor: colors.yellow }]}>
          <Text style={styles.claimText}>Back to Crews</Text>
        </Pressable>
      </SafeAreaView>
    );

  const editors = coop.slots.filter((s) => s.editing && !s.mine && s.player).map((s) => s.player!.name.split(' ')[0]);
  const lineOwner = (beat: number) => coop.slots.find((s) => s.beats.includes(beat));
  const edit = (beat: number, text: string) => {
    if (!me) return;
    setDrafts((d) => ({ ...d, [beat]: text }));
    clearTimeout(timers.current[beat]);
    timers.current[beat] = setTimeout(() => setLine({ coopId, userId: me, beat, text }), 400);
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {coop.emoji} {coop.title}
          </Text>
          <Text style={type.small}>
            Co-op reel · {coop.crew?.emoji} {coop.crew?.name} · {coop.filled}/{coop.slots.length} cast
          </Text>
        </View>
        {coop.status === 'lobby' ? (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>LIVE</Text>
          </View>
        ) : null}
      </View>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <View style={styles.slots}>
            {coop.slots.map((s) => (
              <SlotCard
                key={s.id}
                slot={s as unknown as Slot}
                accent={accent}
                onClaim={() => {
                  if (!me || coop.status !== 'lobby' || (s.player && !s.mine)) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  claim({ coopId, slot: s.id, userId: me }).catch((e) => Alert.alert('Taken', String(e.message ?? e)));
                }}
              />
            ))}
          </View>
          {editors.length ? <Text style={styles.presence}>✍️ {editors.join(' & ')} {editors.length > 1 ? 'are' : 'is'} editing…</Text> : null}

          {coop.status !== 'lobby' && coop.movie ? (
            <View style={styles.rendering}>
              {coop.movie.thumbnailUrl ? <Image source={{ uri: coop.movie.thumbnailUrl }} style={styles.renderThumb} /> : null}
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.renderTitle}>{coop.movie.status === 'done' ? '🍿 Premiere ready' : '🎬 Rolling…'}</Text>
                <Text style={type.small}>{coop.movie.status === 'done' ? coop.credits : (coop.movie.progress?.label ?? 'Queued for the render farm…')}</Text>
                {coop.movie.status !== 'done' ? (
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${coop.movie.progress?.pct ?? 3}%` }]} />
                  </View>
                ) : (
                  <Pressable onPress={() => router.push({ pathname: '/movie/[id]/premiere', params: { id: coop.movie!._id } })} style={[styles.claim, { backgroundColor: accent, alignSelf: 'flex-start' }]}>
                    <Text style={styles.claimText}>▶ Watch</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : null}

          {coop.status === 'lobby' && coop.draftId ? (
            <Pressable
              testID="open-studio"
              onPress={() => {
                Haptics.selectionAsync();
                router.push({ pathname: '/movie/[id]/reel', params: { id: coop.draftId! } });
              }}
              style={styles.studio}>
              <Text style={{ fontSize: 26 }}>🎞️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.studioTitle}>Open the shared timeline</Text>
                <Text style={type.small}>Edit shots, camera and the 🎬 Director together. Changes sync live.</Text>
              </View>
              <Text style={{ color: colors.yellow, fontSize: 22, fontWeight: '900' }}>›</Text>
            </Pressable>
          ) : null}
          <Text style={styles.section}>Script · everyone writes their own lines</Text>
          {coop.lines.map((line, beat) => {
            const owner = lineOwner(beat);
            const mine = !!owner?.mine && coop.status === 'lobby';
            return (
              <View key={beat} style={[styles.line, mine && { borderColor: accent }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.beatNo}>SHOT {beat + 1}</Text>
                  <Text style={styles.caption} numberOfLines={1}>
                    {coop.captions[beat]}
                  </Text>
                  <Text style={styles.lineOwner}>
                    {owner?.emoji} {owner?.player ? (owner.mine ? 'You' : owner.player.name.split(' ')[0]) : owner?.role}
                  </Text>
                </View>
                {mine ? (
                  <TextInput
                    value={drafts[beat] ?? line}
                    onChangeText={(t) => edit(beat, t)}
                    onFocus={() => me && typing({ coopId, userId: me })}
                    multiline
                    style={styles.lineInput}
                  />
                ) : (
                  <Text style={styles.lineText}>{line}</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
        {coop.status === 'lobby' ? (
          <View style={styles.footer}>
            {allIn ? (
              <Pressable testID="roll-camera" onPress={() => setCount(3)} style={[styles.roll, { backgroundColor: colors.pink }]}>
                <Text style={styles.rollText}>{count !== null ? `Rolling in ${count}…` : 'Roll camera 🎬'}</Text>
              </Pressable>
            ) : (
              <View style={[styles.roll, { backgroundColor: colors.surfaceHi }]}>
                <Text style={[styles.rollText, { color: colors.muted }]}>Waiting for {coop.slots.length - coop.filled} more {coop.slots.length - coop.filled === 1 ? 'player' : 'players'}…</Text>
              </View>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>
      {count !== null ? (
        <View style={styles.countdown} pointerEvents="none">
          <Text style={styles.countText}>{count}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  back: { color: colors.text, fontSize: 34, fontWeight: '300', marginTop: -4 },
  title: { color: colors.text, fontWeight: '900', fontSize: 19 },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.pink, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff' },
  livePillText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  slot: { width: '47.8%', minHeight: 200, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  slotEmoji: { fontSize: 22 },
  slotRole: { color: colors.text, fontWeight: '900', fontSize: 16 },
  slotName: { color: colors.text, fontWeight: '800', fontSize: 14, maxWidth: 140 },
  editing: { color: colors.yellow, fontSize: 12, fontWeight: '800' },
  empty: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  claim: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  claimText: { color: '#000', fontWeight: '900', fontSize: 13 },
  presence: { color: colors.yellow, fontWeight: '800', fontSize: 14, textAlign: 'center' },
  studio: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.yellow },
  studioTitle: { color: colors.text, fontWeight: '900', fontSize: 16 },
  section: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 4 },
  line: { borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border, padding: 12, gap: 8 },
  beatNo: { color: colors.faint, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  caption: { flex: 1, color: colors.muted, fontWeight: '800', fontSize: 12 },
  lineOwner: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  lineText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  lineInput: { color: colors.text, fontSize: 15, lineHeight: 21, backgroundColor: colors.surfaceHi, borderRadius: 10, padding: 10 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 10, backgroundColor: colors.bg },
  roll: { borderRadius: radius.pill, paddingVertical: 17, alignItems: 'center' },
  rollText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  rendering: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  renderThumb: { width: 64, height: 96, borderRadius: 10 },
  renderTitle: { color: colors.text, fontWeight: '900', fontSize: 16 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceHi, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.yellow },
  countdown: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  countText: { color: colors.yellow, fontSize: 160, fontWeight: '900' },
});
