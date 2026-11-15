import { useAction, useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../../convex/_generated/api';
import { Avatar } from '@/components/avatar';
import { BlockyCharacter } from '@/components/blocky-character';
import { FaceRow } from '@/components/face-row';
import { compact } from '@/components/reel-card';
import { ago } from '@/components/sheets';
import { useMyId } from '@/me';
import { colors, radius, type } from '@/theme';

const W = Dimensions.get('window').width;
const TILE = (W - 4) / 3;
type Tab = 'reels' | 'coop' | 'chat';

export default function Crew() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const id = useMyId();
  const crew = useQuery(api.crews.get, { slug, userId: id ?? undefined });
  const coops = useQuery(api.coop.forCrew, crew ? { crewId: crew._id, userId: id ?? undefined } : 'skip');
  const join = useMutation(api.crews.toggleJoin);
  const startCoop = useMutation(api.coop.start);
  const [tab, setTab] = useState<Tab>('reels');

  const header = (
    <View>
      <View style={styles.cover}>
        {crew?.cover ? <Image source={{ uri: crew.cover }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        <View style={styles.coverShade} />
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.back, { top: insets.top + 6 }]}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.name}>
              {crew?.emoji} {crew?.name ?? ''}
            </Text>
            {crew?.whop ? (
              <View style={styles.whop}>
                <Text style={styles.whopText}>WHOP</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.blurb}>{crew?.blurb}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <FaceRow faces={crew?.faces ?? []} extra={`${compact(crew?.members ?? 0)} members${crew?.whop ? ' · Synced with Whop' : ''}`} />
            {crew && id ? (
              <Pressable
                testID="join-crew"
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  join({ crewId: crew._id, userId: id });
                }}
                style={[styles.join, { backgroundColor: crew.joined ? 'rgba(255,255,255,0.18)' : crew.accent }]}>
                <Text style={[styles.joinText, crew.joined && { color: colors.text }]}>{crew.joined ? 'Joined ✓' : 'Join'}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      {crew?.challenge ? (
        <View style={[styles.challenge, { borderColor: crew.accent }]}>
          <Text style={{ fontSize: 26 }}>🏆</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.challengeLabel}>WEEKLY CHALLENGE · ends {ends(crew.challenge.endsAt)}</Text>
            <Text style={styles.challengeTitle}>{crew.challenge.title}</Text>
            <Text style={type.small}>Prize: {crew.challenge.prize}</Text>
          </View>
        </View>
      ) : null}
      {crew?.premium ? (
        <View style={styles.premium}>
          <View style={{ flex: 1 }}>
            <Text style={styles.premiumTitle}>🔒 Members only · {crew.premium.label}</Text>
            <Text style={type.small}>Creators monetize their reel templates and communities through Whop.</Text>
          </View>
          <Pressable
            onPress={() =>
              Alert.alert('Join on Whop', `Demo checkout: ${crew.premium!.label} for ${crew.premium!.price}. Open Whop?`, [
                { text: 'Not now', style: 'cancel' },
                { text: 'Open Whop', onPress: () => Linking.openURL(crew.premium!.url) },
              ])
            }
            style={styles.whopBtn}>
            <Text style={styles.whopBtnText}>Join on Whop · {crew.premium.price}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.segments}>
        {(['reels', 'coop', 'chat'] as const).map((t) => (
          <Pressable
            key={t}
            testID={`seg-${t}`}
            onPress={() => {
              Haptics.selectionAsync();
              setTab(t);
            }}
            style={[styles.segment, tab === t && { borderColor: crew?.accent ?? colors.yellow }]}>
            <Text style={[styles.segmentText, tab === t && { color: colors.text }]}>{t === 'reels' ? 'Reels' : t === 'coop' ? 'Co-op 🎬' : 'Chat'}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  if (tab === 'chat' && crew) return <Chat crew={crew} header={header} />;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>
        {header}
        {tab === 'reels' ? (
          <View style={styles.wall}>
            {(crew?.wall ?? []).map((r) => (
              <Pressable key={r._id} onPress={() => router.push({ pathname: '/movie/[id]/premiere', params: { id: r._id } })} style={styles.tile}>
                {r.thumbnailUrl ? <Image source={{ uri: r.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                <View style={styles.tileShade} />
                <Text style={styles.tileMeta}>▶ {compact(r.views)}</Text>
                <Text style={styles.tileLikes}>♥ {compact(r.likes)}</Text>
                <Pressable onPress={() => router.push({ pathname: '/movie/[id]/remix', params: { id: r._id } })} style={styles.putMe} hitSlop={6}>
                  <Text style={styles.putMeText}>🎭</Text>
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={{ padding: 16, gap: 14 }}>
            <Pressable
              testID="start-coop"
              onPress={async () => {
                if (!crew || !id) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                const tmpl = crew.slug === 'revyl-riders' ? 'mtb' : crew.slug === 'whop-dojo' ? 'karate' : 'fate';
                const coopId = await startCoop({ crewId: crew._id, userId: id, templateId: tmpl });
                router.push({ pathname: '/coop/[id]', params: { id: coopId } });
              }}
              style={[styles.startCoop, { backgroundColor: crew?.accent ?? colors.yellow }]}>
              <Text style={styles.startCoopText}>＋ Start a co-op reel</Text>
              <Text style={styles.startCoopSub}>Pick roles with your crew, write your own lines, roll camera together</Text>
            </Pressable>
            {(coops ?? []).map((c) => (
              <Pressable key={c._id} onPress={() => router.push({ pathname: '/coop/[id]', params: { id: c._id } })} style={styles.coopCard}>
                <View style={styles.coopThumb}>
                  {c.movie?.thumbnailUrl ? <Image source={{ uri: c.movie.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <Text style={{ fontSize: 34 }}>{c.emoji}</Text>}
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.coopTitle}>{c.title}</Text>
                    <View style={[styles.status, { backgroundColor: c.status === 'lobby' ? colors.pink : c.status === 'rolling' ? colors.yellow : colors.green }]}>
                      <Text style={styles.statusText}>{c.status === 'lobby' ? 'CASTING' : c.status === 'rolling' ? 'RENDERING' : 'DONE'}</Text>
                    </View>
                  </View>
                  <FaceRow faces={c.slots.filter((s) => s.player).map((s) => s.player!)} size={22} extra={`${c.filled}/${c.slots.length} roles`} />
                  <Text style={type.small} numberOfLines={1}>
                    {c.credits || 'Open roles: ' + c.slots.map((s) => s.role).join(', ')}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ends(at: number) {
  const h = Math.max(1, Math.round((at - Date.now()) / 3600000));
  return h >= 24 ? `in ${Math.round(h / 24)}d` : `in ${h}h`;
}

type CrewData = NonNullable<ReturnType<typeof useQuery<typeof api.crews.get>>>;

function Chat({ crew, header }: { crew: CrewData; header: React.ReactNode }) {
  const router = useRouter();
  const id = useMyId();
  const post = useMutation(api.crews.post);
  const sync = useAction(api.crews.syncFromWhop);
  const [text, setText] = useState('');
  const list = useRef<FlatList>(null);
  const crewId = crew._id;
  const onWhop = crew.onWhop;
  useEffect(() => {
    if (!onWhop) return;
    sync({ crewId }).catch(() => {});
    const timer = setInterval(() => sync({ crewId }).catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [crewId, onWhop, sync]);
  const submit = async () => {
    if (!id || !text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const body = text;
    setText('');
    await post({ crewId, userId: id, body });
  };
  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <FlatList
          ref={list}
          data={crew.posts}
          keyExtractor={(m) => m._id}
          ListHeaderComponent={<View style={{ marginHorizontal: -14, marginTop: -14, marginBottom: 6 }}>{header}</View>}
          contentContainerStyle={{ padding: 14, gap: 14 }}
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
          <TextInput testID="crew-input" value={text} onChangeText={setText} placeholder={`Message ${crew.name}…`} placeholderTextColor={colors.faint} style={styles.input} onSubmitEditing={submit} returnKeyType="send" />
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
  cover: { height: 330, justifyContent: 'flex-end', padding: 16, backgroundColor: colors.surface },
  coverShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  back: { position: 'absolute', left: 14, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.text, fontSize: 30, fontWeight: '400', marginTop: -4 },
  name: { color: colors.text, fontSize: 32, fontWeight: '900', letterSpacing: -1, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
  blurb: { color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: '600' },
  whop: { backgroundColor: '#FA4616', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  whopText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  join: { borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 9 },
  joinText: { color: '#000', fontWeight: '900', fontSize: 15 },
  challenge: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 16, marginBottom: 0, padding: 14, borderRadius: radius.md, borderWidth: 1.5, backgroundColor: colors.surface },
  challengeLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  challengeTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  premium: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, marginBottom: 0, padding: 14, borderRadius: radius.md, backgroundColor: '#2A1208', borderWidth: 1, borderColor: '#FA4616' },
  premiumTitle: { color: colors.text, fontWeight: '900', fontSize: 14, marginBottom: 2 },
  whopBtn: { backgroundColor: '#FA4616', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 9 },
  whopBtnText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  segments: { flexDirection: 'row', marginTop: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 3, borderColor: 'transparent' },
  segmentText: { color: colors.muted, fontWeight: '900', fontSize: 15 },
  wall: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, paddingTop: 2 },
  tile: { width: TILE, height: TILE * 1.6, backgroundColor: colors.surfaceHi, justifyContent: 'flex-end', padding: 6 },
  tileShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.15)' },
  tileMeta: { color: colors.text, fontSize: 12, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },
  tileLikes: { color: colors.text, fontSize: 11, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 4 },
  putMe: { position: 'absolute', top: 6, right: 6, backgroundColor: colors.yellow, borderRadius: 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  putMeText: { fontSize: 14 },
  startCoop: { borderRadius: radius.lg, padding: 18, gap: 4 },
  startCoopText: { color: '#000', fontSize: 20, fontWeight: '900' },
  startCoopSub: { color: 'rgba(0,0,0,0.7)', fontSize: 13, fontWeight: '700' },
  coopCard: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  coopThumb: { width: 70, height: 100, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  coopTitle: { color: colors.text, fontWeight: '900', fontSize: 16 },
  status: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  statusText: { color: '#000', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
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
