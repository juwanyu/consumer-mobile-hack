import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Avatar } from '@/components/avatar';
import { BlockyCharacter } from '@/components/blocky-character';
import { useMyId } from '@/me';
import { colors, radius, type } from '@/theme';

export default function Thread() {
  const { peer } = useLocalSearchParams<{ peer: Id<'users'> }>();
  const router = useRouter();
  const id = useMyId();
  const thread = useQuery(api.social.thread, id ? { userId: id, peerId: peer } : 'skip');
  const send = useMutation(api.social.sendMessage);
  const markRead = useMutation(api.social.markRead);
  const [text, setText] = useState('');
  const list = useRef<FlatList>(null);

  const count = thread?.messages.length ?? 0;
  useEffect(() => {
    if (id && count) markRead({ userId: id, peerId: peer });
  }, [id, peer, count, markRead]);

  const submit = async () => {
    if (!id || !text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const body = text;
    setText('');
    await send({ fromId: id, toId: peer, body });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Pressable style={styles.headerWho} onPress={() => thread?.peer && router.push({ pathname: '/u/[handle]', params: { handle: thread.peer.handle } })}>
          <Avatar look={thread?.peer?.look} name={thread?.peer?.name} size={36} />
          <View>
            <Text style={styles.headerName}>{thread?.peer?.name ?? '…'}</Text>
            <Text style={type.small}>{thread?.peer?.handle}</Text>
          </View>
        </Pressable>
      </View>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={10}>
        <FlatList
          ref={list}
          data={thread?.messages ?? []}
          keyExtractor={(m) => m._id}
          contentContainerStyle={{ padding: 14, gap: 8 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <View style={{ alignItems: item.mine ? 'flex-end' : 'flex-start', gap: 4 }}>
              {item.reel ? (
                <Pressable
                  testID="shared-reel"
                  onPress={() => router.push({ pathname: '/movie/[id]/premiere', params: { id: item.reel!._id } })}
                  style={styles.reel}>
                  <View style={styles.reelArt}>
                    {item.reel.thumbnailUrl ? (
                      <Image source={{ uri: item.reel.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : item.reel.cast[0]?.look ? (
                      <BlockyCharacter look={item.reel.cast[0].look} size={110} animate={false} />
                    ) : null}
                    <Text style={styles.play}>▶</Text>
                  </View>
                  <Text style={styles.reelTitle} numberOfLines={1}>
                    {item.reel.title}
                  </Text>
                  <Text style={styles.reelSub} numberOfLines={1}>
                    {item.reel.style} · {item.reel.cast.map((c: { name: string }) => c.name).join(', ')}
                  </Text>
                  <Pressable
                    testID="put-me-in"
                    onPress={() => router.push({ pathname: '/movie/[id]/remix', params: { id: item.reel!._id } })}
                    style={styles.putMeIn}>
                    <Text style={styles.putMeInText}>🎭 Put me in it</Text>
                  </Pressable>
                </Pressable>
              ) : null}
              {item.body ? (
                <View style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}>
                  <Text style={[styles.bubbleText, item.mine && { color: '#fff' }]}>{item.body}</Text>
                </View>
              ) : null}
            </View>
          )}
        />
        <View style={styles.composer}>
          <TextInput testID="message-input" value={text} onChangeText={setText} placeholder="Message…" placeholderTextColor={colors.faint} style={styles.input} onSubmitEditing={submit} returnKeyType="send" />
          <Pressable onPress={submit} disabled={!text.trim()} hitSlop={8}>
            <Text style={[styles.sendText, { opacity: text.trim() ? 1 : 0.4 }]}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  back: { color: colors.text, fontSize: 34, fontWeight: '300', marginTop: -4 },
  headerWho: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  bubble: { maxWidth: '78%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  mine: { backgroundColor: '#5B3CFF' },
  theirs: { backgroundColor: colors.surfaceHi },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  reel: { width: 210, borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  reelArt: { height: 220, backgroundColor: '#1B1030', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  play: { position: 'absolute', top: 90, alignSelf: 'center', fontSize: 34, color: '#fff' },
  reelTitle: { color: colors.text, fontWeight: '900', fontSize: 15, paddingHorizontal: 10, paddingTop: 8 },
  reelSub: { color: colors.muted, fontSize: 12, paddingHorizontal: 10 },
  putMeIn: { margin: 10, backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 8, alignItems: 'center' },
  putMeInText: { color: '#000', fontWeight: '900' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  input: { flex: 1, color: colors.text, backgroundColor: colors.surfaceHi, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 11, fontSize: 15 },
  sendText: { color: colors.cyan, fontWeight: '900', fontSize: 16 },
});
