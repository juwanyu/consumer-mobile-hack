import { useAction, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useMyId } from '@/me';
import { colors, radius } from '@/theme';

type Change = { beat: number; field: string; before: string | null; after: string | null };
type Item = { key: string; role: 'user' | 'assistant'; text: string; changes: Change[]; error?: boolean };

const SUGGESTIONS = [
  'Make shot 3 slow-mo',
  'Give Harris a funnier line',
  'Add a shot where Saber draws the sword',
  'Make it more dramatic',
  'Shorter and punchier',
];

const FIELD_LABELS: Record<string, string> = {
  caption: 'Caption',
  narration: 'Line',
  location: 'Set',
  fx: 'FX',
  camera: 'Camera',
  duration: 'Length',
  characters: 'Blocking',
  shot: 'Shot',
};

function errorText(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const match = message.match(/Uncaught Error: ([^\n]+)/);
  return match?.[1]?.trim() || 'The Director lost the script. Try again.';
}

function TypingDots() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.stagger(
        160,
        dots.map((d) =>
          Animated.sequence([
            Animated.timing(d, { toValue: 1, duration: 280, useNativeDriver: true }),
            Animated.timing(d, { toValue: 0.3, duration: 280, useNativeDriver: true }),
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [dots]);
  return (
    <View style={[styles.bubble, styles.assistant, styles.typing]}>
      <Text style={styles.typingLabel}>🎬 Recutting</Text>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.dot, { opacity: d, transform: [{ scale: d }] }]} />
      ))}
    </View>
  );
}

function DiffCard({ changes }: { changes: Change[] }) {
  const beats = [...new Set(changes.map((c) => c.beat))];
  return (
    <View style={styles.diff}>
      {beats.map((beat) => {
        const rows = changes.filter((c) => c.beat === beat);
        const added = rows.some((c) => c.field === 'shot' && c.after !== null);
        const cut = rows.some((c) => c.field === 'shot' && c.after === null);
        return (
          <View key={beat} style={styles.diffBeat}>
            <View style={styles.diffHeader}>
              <Text style={styles.diffShot}>{beat === 0 ? 'CAST' : 'SHOT ' + beat}</Text>
              {added && <Text style={[styles.badge, styles.badgeNew]}>NEW</Text>}
              {cut && <Text style={[styles.badge, styles.badgeCut]}>CUT</Text>}
            </View>
            {rows.map((c, i) => (
              <View key={i} style={styles.diffRow}>
                <Text style={styles.diffField}>{FIELD_LABELS[c.field] ?? c.field}</Text>
                {c.before !== null && (
                  <Text style={[styles.diffText, styles.before]}>
                    <Text style={styles.sign}>− </Text>
                    {c.before || '—'}
                  </Text>
                )}
                {c.after !== null && (
                  <Text style={[styles.diffText, styles.after]}>
                    <Text style={styles.sign}>+ </Text>
                    {c.after || '—'}
                  </Text>
                )}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function Message({ item }: { item: Item }) {
  if (item.role === 'user') {
    return (
      <View style={[styles.bubble, styles.user]}>
        <Text style={styles.userText}>{item.text}</Text>
      </View>
    );
  }
  return (
    <View style={styles.assistantWrap}>
      <View style={[styles.bubble, styles.assistant, item.error && styles.errorBubble]}>
        <Text style={styles.assistantName}>🎬 DIRECTOR</Text>
        <Text style={styles.assistantText}>{item.text}</Text>
      </View>
      {item.changes.length > 0 && <DiffCard changes={item.changes} />}
    </View>
  );
}

export function DirectorSheet({
  movieId,
  visible,
  onClose,
  onApplied,
}: {
  movieId: Id<'movies'>;
  visible: boolean;
  onClose: () => void;
  onApplied?: () => void;
}) {
  const history = useQuery(api.director.messages, visible ? { movieId } : 'skip');
  const edit = useAction(api.director.edit);
  const me = useMyId();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ prompt: string; message: string } | null>(null);
  const list = useRef<FlatList<Item>>(null);

  const items: Item[] = [
    ...(history ?? []).map((m) => ({ key: m._id, role: m.role, text: m.text, changes: m.changes })),
    ...(failed
      ? [
          { key: 'failed-prompt', role: 'user' as const, text: failed.prompt, changes: [] },
          { key: 'failed', role: 'assistant' as const, text: failed.message, changes: [], error: true },
        ]
      : []),
    ...(pending ? [{ key: 'pending', role: 'user' as const, text: pending, changes: [] }] : []),
  ];

  const send = async (text: string) => {
    const prompt = text.trim();
    if (!prompt || pending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDraft('');
    setFailed(null);
    setPending(prompt);
    try {
      const result = await edit({ movieId, prompt, ...(me ? { userId: me } : {}) });
      if (result.changes.length > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onApplied?.();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setFailed({ prompt, message: errorText(error) });
    } finally {
      setPending(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>🎬 Director</Text>
            <Text style={styles.subtitle}>Say it like a director. I'll recut the reel.</Text>
          </View>
          <Pressable testID="director-close" onPress={onClose} hitSlop={12} style={styles.close}>
            <SymbolView name="xmark" size={14} tintColor={colors.text} />
          </Pressable>
        </View>

        <FlatList
          ref={list}
          data={items}
          keyExtractor={(item) => item.key}
          renderItem={({ item }) => <Message item={item} />}
          contentContainerStyle={styles.list}
          keyboardDismissMode="interactive"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            history === undefined ? undefined : (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🎬</Text>
                <Text style={styles.emptyTitle}>Places, everyone.</Text>
                <Text style={styles.emptyText}>Ask for slow-mo, new shots, funnier lines or more drama. Every change shows up as a diff.</Text>
              </View>
            )
          }
          ListFooterComponent={pending ? <TypingDots /> : undefined}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {SUGGESTIONS.map((s) => (
            <Pressable
              key={s}
              testID="director-chip"
              disabled={!!pending}
              onPress={() => send(s)}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed, !!pending && { opacity: 0.4 }]}
            >
              <Text style={styles.chipText}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            testID="director-input"
            value={draft}
            onChangeText={setDraft}
            placeholder="Make shot 2 a closeup…"
            placeholderTextColor={colors.faint}
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={() => send(draft)}
            editable={!pending}
            maxLength={500}
          />
          <Pressable
            testID="director-send"
            onPress={() => send(draft)}
            disabled={!draft.trim() || !!pending}
            style={[styles.send, (!draft.trim() || !!pending) && { opacity: 0.35 }]}
          >
            <SymbolView name="arrow.up" size={18} weight="bold" tintColor="#000" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16, paddingBottom: 24 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  title: { color: colors.yellow, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 2 },
  close: { width: 30, height: 30, borderRadius: radius.pill, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  list: { paddingVertical: 14, gap: 12, flexGrow: 1 },
  bubble: { maxWidth: '86%', borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.yellow, borderBottomRightRadius: 4 },
  userText: { color: '#000', fontSize: 15, fontWeight: '700', lineHeight: 20 },
  assistantWrap: { gap: 8 },
  assistant: { alignSelf: 'flex-start', backgroundColor: colors.surfaceHi, borderBottomLeftRadius: 4, borderLeftWidth: 3, borderLeftColor: colors.pink },
  errorBubble: { borderLeftColor: colors.red },
  assistantName: { color: colors.pink, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 3 },
  assistantText: { color: colors.text, fontSize: 15, fontWeight: '500', lineHeight: 21 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  typingLabel: { color: colors.muted, fontSize: 13, fontWeight: '700', marginRight: 2 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.pink },
  diff: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 12 },
  diffBeat: { gap: 8 },
  diffHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diffShot: { color: colors.yellow, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  badge: { fontSize: 10, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
  badgeNew: { backgroundColor: colors.green, color: '#000' },
  badgeCut: { backgroundColor: colors.red, color: '#fff' },
  diffRow: { gap: 4 },
  diffField: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  diffText: { fontSize: 14, lineHeight: 19, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  before: { color: '#FFB3B3', backgroundColor: 'rgba(255,77,77,0.14)', textDecorationLine: 'line-through' },
  after: { color: '#B6F5CF', backgroundColor: 'rgba(61,220,132,0.14)', fontWeight: '600' },
  sign: { fontWeight: '900' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, paddingTop: 40 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  chips: { gap: 8, paddingVertical: 10 },
  chip: { borderWidth: 1.5, borderColor: colors.pink, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(255,46,136,0.1)' },
  chipPressed: { backgroundColor: colors.pink },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, color: colors.text, backgroundColor: colors.surfaceHi, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  send: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
});
