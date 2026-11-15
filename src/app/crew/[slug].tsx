import { useAction, useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import { Avatar } from '@/components/avatar';
import { BlockyCharacter } from '@/components/blocky-character';
import { ago } from '@/components/sheets';
import { useMyId } from '@/me';
import { colors, radius, type } from '@/theme';

export default function Crew() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const id = useMyId();
  const crew = useQuery(api.crews.get, { slug, userId: id ?? undefined });
  const join = useMutation(api.crews.toggleJoin);
  const post = useMutation(api.crews.post);
  const sync = useAction(api.crews.syncFromWhop);
  const [text, setText] = useState('');
  const list = useRef<FlatList>(null);

  const crewId = crew?._id;
  const onWhop = crew?.onWhop;
  useEffect(() => {
    if (!crewId || !onWhop) return;
    sync({ crewId }).catch(() => {});
    const timer = setInterval(() => sync({ crewId }).catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [crewId, onWhop, sync]);

  const submit = async () => {
    if (!id || !crew || !text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const body = text;
    setText('');
    await post({ crewId: crew._id, userId: id, body });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={{ fontSize: 28 }}>{crew?.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{crew?.name ?? '…'}</Text>
          <Text style={type.small}>
            {crew?.members ?? 0} members{crew?.onWhop ? ' · synced with Whop' : ''}
          </Text>
        </View>
        {crew && id ? (
          <Pressable testID="join-crew" onPress={() => join({ crewId: crew._id, userId: id })} style={[styles.join, crew.joined && { backgroundColor: colors.surfaceHi }]}>
            <Text style={[styles.joinText, crew.joined && { color: colors.text }]}>{crew.joined ? 'Joined' : 'Join'}</Text>
          </Pressable>
        ) : null}
      </View>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }} keyboardVerticalOffset={10}>
        <FlatList
          ref={list}
          data={crew?.posts ?? []}
          keyExtractor={(m) => m._id}
          contentContainerStyle={{ padding: 14, gap: 14 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={<Text style={[type.small, { textAlign: 'center', marginBottom: 6 }]}>{crew?.blurb}</Text>}
          ListEmptyComponent={crew ? <Text style={[type.small, { textAlign: 'center', marginTop: 30 }]}>Quiet in here. Send the crew a reel from the feed ✈️</Text> : undefined}
          renderItem={({ item }) => (
            <View style={styles.post}>
              <Avatar look={item.author?.look} name={item.authorName} size={36} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.meta}>
                  {item.authorName}
                  {item.source === 'whop' ? <Text style={{ color: '#FA4616' }}> · via Whop</Text> : null}
                  <Text style={{ color: colors.faint }}> · {ago(item.at)}</Text>
                </Text>
                {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
                {item.reel ? (
                  <Pressable onPress={() => router.push({ pathname: '/movie/[id]/premiere', params: { id: item.reel!._id } })} style={styles.reel}>
                    <View style={styles.reelArt}>
                      {item.reel.thumbnailUrl ? (
                      <Image source={{ uri: item.reel.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    ) : item.reel.cast[0]?.look ? (
                      <BlockyCharacter look={item.reel.cast[0].look} size={90} animate={false} />
                    ) : null}
                    </View>
                    <View style={{ flex: 1, gap: 4, padding: 10 }}>
                      <Text style={styles.reelTitle}>{item.reel.title}</Text>
                      <Text style={type.small} numberOfLines={2}>
                        {item.reel.style} · {item.reel.cast.map((c: { name: string }) => c.name).join(', ')}
                      </Text>
                      <Pressable onPress={() => router.push({ pathname: '/movie/[id]/remix', params: { id: item.reel!._id } })} style={styles.putMeIn}>
                        <Text style={styles.putMeInText}>🎭 Put me in it</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        />
        <View style={styles.composer}>
          <TextInput testID="crew-input" value={text} onChangeText={setText} placeholder={`Message ${crew?.name ?? 'the crew'}…`} placeholderTextColor={colors.faint} style={styles.input} onSubmitEditing={submit} returnKeyType="send" />
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
  name: { color: colors.text, fontWeight: '900', fontSize: 17 },
  join: { backgroundColor: colors.yellow, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 8 },
  joinText: { color: '#000', fontWeight: '900' },
  post: { flexDirection: 'row', gap: 10 },
  meta: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  body: { color: colors.text, fontSize: 15, lineHeight: 21 },
  reel: { flexDirection: 'row', borderRadius: radius.md, backgroundColor: colors.surface, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  reelArt: { width: 96, backgroundColor: '#1B1030', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  reelTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  putMeIn: { alignSelf: 'flex-start', backgroundColor: colors.yellow, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12, marginTop: 4 },
  putMeInText: { color: '#000', fontWeight: '900', fontSize: 13 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  input: { flex: 1, color: colors.text, backgroundColor: colors.surfaceHi, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 11, fontSize: 15 },
  sendText: { color: colors.cyan, fontWeight: '900', fontSize: 16 },
});
