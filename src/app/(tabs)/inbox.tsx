import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Avatar } from '@/components/avatar';
import { ago } from '@/components/sheets';
import { StackedAvatars } from '@/components/stacked-avatars';
import { useMyId } from '@/me';
import { colors, radius, type } from '@/theme';

export default function Inbox() {
  const router = useRouter();
  const id = useMyId();
  const threads = useQuery(api.social.inbox, id ? { userId: id } : 'skip');
  const people = useQuery(api.social.people, { userId: id ?? undefined });
  const createGroup = useMutation(api.groups.create);
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<Set<Id<'users'>>>(new Set());
  const unread = (threads ?? []).reduce((n, t) => n + t.unread, 0);

  const closeCompose = () => {
    setComposing(false);
    setName('');
    setPicked(new Set());
  };
  const create = async () => {
    if (!id || picked.size === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const groupId = await createGroup({ userId: id, name, memberIds: [...picked] });
    closeCompose();
    router.push({ pathname: '/group/[id]', params: { id: groupId } });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <Text style={type.title}>
          Inbox {unread > 0 ? <Text style={{ color: colors.cyan, fontSize: 18 }}>{unread} new</Text> : null}
        </Text>
        <Pressable testID="new-group" onPress={() => setComposing(true)} style={styles.newGroup} hitSlop={8}>
          <Text style={styles.newGroupText}>＋ New group</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.people} style={{ flexGrow: 0 }}>
        {(people ?? []).map((p) => (
          <Pressable key={p._id} onPress={() => router.push({ pathname: '/inbox/[peer]', params: { peer: p._id } })} style={styles.person}>
            <Avatar look={p.look} name={p.name} size={60} ring />
            <Text style={styles.personName} numberOfLines={1}>
              {p.name.split(' ')[0]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text style={[type.label, { paddingHorizontal: 18, marginTop: 6 }]}>Messages</Text>
      <FlatList
        data={threads ?? []}
        keyExtractor={(t) => t.key}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={
          threads ? (
            <Text style={[type.small, { textAlign: 'center', marginTop: 40, paddingHorizontal: 40 }]}>
              Send a reel from the feed with ✈️ and your friends can put themselves into it.
            </Text>
          ) : undefined
        }
        renderItem={({ item }) => {
          const title = item.kind === 'group' ? item.group!.name : item.peer!.name;
          const open = () =>
            item.kind === 'group'
              ? router.push({ pathname: '/group/[id]', params: { id: item.group!._id } })
              : router.push({ pathname: '/inbox/[peer]', params: { peer: item.peer!._id } });
          return (
            <Pressable testID={`thread-${item.kind === 'group' ? 'group' : item.peer!.handle}`} onPress={open} style={styles.row}>
              {item.kind === 'group' ? <StackedAvatars members={item.group!.members} /> : <Avatar look={item.peer!.look} name={item.peer!.name} size={54} />}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.rowName, item.unread > 0 && { fontWeight: '900' }]} numberOfLines={1}>
                  {item.pinned ? '📌 ' : ''}
                  {title}
                  {item.kind === 'group' ? <Text style={{ color: colors.faint, fontWeight: '600' }}> · {item.group!.members.length + 1}</Text> : null}
                </Text>
                <Text style={[styles.rowPreview, item.unread > 0 && { color: colors.text, fontWeight: '700' }]} numberOfLines={1}>
                  {item.preview} · {ago(item.at)}
                </Text>
              </View>
              {item.unread > 1 ? (
                <View style={styles.count}>
                  <Text style={styles.countText}>{item.unread}</Text>
                </View>
              ) : item.unread > 0 ? (
                <View style={styles.dot} />
              ) : null}
            </Pressable>
          );
        }}
      />
      <Modal visible={composing} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeCompose}>
        <View style={styles.sheet}>
          <Text style={[type.heading, { textAlign: 'center' }]}>New group</Text>
          <TextInput testID="group-name" value={name} onChangeText={setName} placeholder="Group name (e.g. Cast crew 🎬)" placeholderTextColor={colors.faint} style={styles.input} />
          <Text style={type.label}>Add people</Text>
          <ScrollView contentContainerStyle={styles.grid}>
            {(people ?? []).map((p) => {
              const on = picked.has(p._id);
              return (
                <Pressable
                  key={p._id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPicked((s) => {
                      const next = new Set(s);
                      if (next.has(p._id)) next.delete(p._id);
                      else next.add(p._id);
                      return next;
                    });
                  }}
                  style={styles.pick}>
                  <Avatar look={p.look} name={p.name} size={58} ring={on} />
                  <Text style={[styles.personName, on && { color: colors.yellow }]} numberOfLines={1}>
                    {on ? '✓ ' : ''}
                    {p.name.split(' ')[0]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={closeCompose} style={[styles.btn, { backgroundColor: colors.surfaceHi }]}>
              <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable testID="create-group" onPress={create} disabled={picked.size === 0} style={[styles.btn, { opacity: picked.size ? 1 : 0.4 }]}>
              <Text style={styles.btnText}>Create{picked.size ? ` (${picked.size + 1})` : ''}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 6 },
  newGroup: { backgroundColor: colors.surfaceHi, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  newGroupText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  people: { gap: 14, paddingHorizontal: 18, paddingVertical: 14 },
  person: { alignItems: 'center', gap: 6, width: 66 },
  personName: { color: colors.text, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10 },
  rowName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowPreview: { color: colors.muted, fontSize: 14 },
  count: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.cyan, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countText: { color: '#000', fontWeight: '900', fontSize: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.cyan },
  sheet: { flex: 1, backgroundColor: colors.surface, padding: 18, paddingBottom: 32, gap: 14 },
  input: { color: colors.text, backgroundColor: colors.surfaceHi, borderRadius: radius.md, padding: 14, fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  pick: { width: 70, alignItems: 'center', gap: 6 },
  btn: { flex: 1, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#000', fontWeight: '900', fontSize: 16 },
});
