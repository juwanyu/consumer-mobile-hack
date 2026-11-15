import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Avatar } from '@/components/avatar';
import { StackedAvatars } from '@/components/stacked-avatars';
import { useMe } from '@/me';
import { saveVideo, shareVideo } from '@/save-video';
import { colors, radius, type } from '@/theme';

function ago(at: number) {
  const s = Math.max(1, Math.round((Date.now() - at) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
export { ago };

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={visible ? onClose : undefined}>
      <KeyboardAvoidingView behavior="padding" style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.sheetTitle}>{title}</Text>
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SendSheet({ movie, onClose }: { movie: { _id: Id<'movies'>; title: string; videoUrl: string | null } | null; onClose: () => void }) {
  const router = useRouter();
  const { id } = useMe();
  const people = useQuery(api.social.people, { userId: id ?? undefined });
  const crews = useQuery(api.crews.list, { userId: id ?? undefined });
  const groups = useQuery(api.groups.list, { userId: id ?? undefined });
  const sendGroup = useMutation(api.groups.send);
  const sendMessage = useMutation(api.social.sendMessage);
  const postToCrew = useMutation(api.crews.post);
  const countShare = useMutation(api.social.countShare);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState<'save' | 'saved' | 'share' | null>(null);

  const close = () => {
    setPicked(new Set());
    setNote('');
    setSent(false);
    onClose();
  };
  const toggle = (key: string) => {
    Haptics.selectionAsync();
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const send = async () => {
    if (!movie || !id) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const body = note.trim() || 'Put yourself in this one 👀';
    for (const key of picked) {
      if (key.startsWith('crew:')) await postToCrew({ crewId: key.slice(5) as Id<'crews'>, userId: id, body, movieId: movie._id });
      else if (key.startsWith('group:')) await sendGroup({ groupId: key.slice(6) as Id<'groups'>, userId: id, body, movieId: movie._id });
      else await sendMessage({ fromId: id, toId: key as Id<'users'>, body, movieId: movie._id });
    }
    setSent(true);
    const keys = [...picked];
    setTimeout(() => {
      close();
      if (keys.length !== 1) return;
      if (keys[0].startsWith('group:')) router.push({ pathname: '/group/[id]', params: { id: keys[0].slice(6) } });
      else if (!keys[0].startsWith('crew:')) router.push({ pathname: '/inbox/[peer]', params: { peer: keys[0] } });
    }, 700);
  };

  return (
    <Sheet visible={!!movie} onClose={close} title={sent ? `Sent ✓` : 'Send to'}>
      <Text style={[type.small, { textAlign: 'center' }]}>They can open it and put themselves into any role.</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 18, paddingVertical: 16 }}>
        <View style={styles.grid}>
          {(people ?? []).map((p) => {
            const on = picked.has(p._id);
            return (
              <Pressable key={p._id} testID={`send-to-${p.handle}`} onPress={() => toggle(p._id)} style={styles.person}>
                <View>
                  <Avatar look={p.look} name={p.name} size={64} ring={on} />
                  {on ? (
                    <View style={styles.check}>
                      <Text style={{ color: '#000', fontWeight: '900', fontSize: 12 }}>✓</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.personName} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {(groups ?? []).length > 0 ? <Text style={type.label}>Groups</Text> : null}
        {(groups ?? []).map((g) => {
          const on = picked.has(`group:${g._id}`);
          return (
            <Pressable key={g._id} onPress={() => toggle(`group:${g._id}`)} style={[styles.crewRow, on && { borderColor: colors.yellow }]}>
              <StackedAvatars members={g.members} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{g.name}</Text>
                <Text style={type.small}>{g.members.length + 1} people</Text>
              </View>
              <Text style={{ color: on ? colors.yellow : colors.faint, fontSize: 20 }}>{on ? '●' : '○'}</Text>
            </Pressable>
          );
        })}
        <Text style={type.label}>Post to a crew</Text>
        {(crews ?? []).map((c) => {
          const on = picked.has(`crew:${c._id}`);
          return (
            <Pressable key={c._id} onPress={() => toggle(`crew:${c._id}`)} style={[styles.crewRow, on && { borderColor: colors.yellow }]}>
              <Text style={{ fontSize: 26 }}>{c.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.personName}>{c.name}</Text>
                <Text style={type.small}>
                  {c.members} members
                </Text>
              </View>
              <Text style={{ color: on ? colors.yellow : colors.faint, fontSize: 20 }}>{on ? '●' : '○'}</Text>
            </Pressable>
          );
        })}
        {movie?.videoUrl ? (
          <Pressable
            testID="save-video"
            style={styles.crewRow}
            disabled={saving !== null}
            onPress={async () => {
              setSaving('save');
              const ok = await saveVideo(movie.videoUrl!, movie.title);
              setSaving(ok ? 'saved' : null);
              if (ok) setTimeout(() => setSaving(null), 2500);
            }}>
            <Text style={{ fontSize: 24 }}>{saving === 'saved' ? '✅' : '⬇️'}</Text>
            <Text style={[styles.personName, { flex: 1 }]}>{saving === 'saved' ? 'Saved to Photos ✅' : saving === 'save' ? 'Saving…' : 'Save video to Photos'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={styles.crewRow}
          disabled={saving !== null}
          onPress={async () => {
            if (!movie) return;
            if (movie.videoUrl) {
              setSaving('share');
              await shareVideo(movie.videoUrl, movie.title);
              setSaving(null);
            } else {
              await Share.share({ message: `🎬 ${movie.title}. Made with Cast.` });
            }
            countShare({ movieId: movie._id });
          }}>
          <Text style={{ fontSize: 24 }}>↗️</Text>
          <Text style={[styles.personName, { flex: 1 }]}>{saving === 'share' ? 'Preparing video…' : 'Share video (Instagram, TikTok, Messages)'}</Text>
        </Pressable>
        <Pressable
          style={styles.crewRow}
          onPress={() => {
            close();
            router.push('/(tabs)/inbox');
          }}>
          <Text style={{ fontSize: 24 }}>✉️</Text>
          <Text style={[styles.personName, { flex: 1 }]}>Open Inbox</Text>
        </Pressable>
      </ScrollView>
      <View style={styles.composer}>
        <TextInput value={note} onChangeText={setNote} placeholder="Write a message…" placeholderTextColor={colors.faint} style={styles.input} />
        <Pressable testID="send-confirm" onPress={send} disabled={picked.size === 0} style={[styles.sendBtn, { opacity: picked.size ? 1 : 0.4 }]}>
          <Text style={{ color: '#000', fontWeight: '900' }}>Send{picked.size > 1 ? ` (${picked.size})` : ''}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 18, paddingBottom: 28 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 8 },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center', marginVertical: 12 },
  comment: { flexDirection: 'row', gap: 12 },
  commentMeta: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  commentBody: { color: colors.text, fontSize: 15, lineHeight: 20 },
  quick: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8 },
  input: { flex: 1, color: colors.text, backgroundColor: colors.surfaceHi, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  post: { color: colors.cyan, fontSize: 16, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'flex-start' },
  person: { width: 72, alignItems: 'center', gap: 6 },
  personName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  check: { position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.yellow, alignItems: 'center', justifyContent: 'center' },
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceHi, borderWidth: 1.5, borderColor: 'transparent' },
  sendBtn: { backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 12 },
});
