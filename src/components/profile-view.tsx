import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { Avatar } from '@/components/avatar';
import { BlockyCharacter } from '@/components/blocky-character';
import { compact } from '@/components/reel-card';
import { GENRE_COLORS } from '@/library';
import { useLocalIds } from '@/local';
import { useMyId, useSwitchAccount } from '@/me';
import { colors, radius, type } from '@/theme';

type Tab = 'reels' | 'saved';

export function ProfileView({ handle, userId, showBack }: { handle?: string; userId?: Id<'users'> | null; showBack?: boolean }) {
  const router = useRouter();
  const me = useMyId();
  const profile = useQuery(api.social.profile, userId || handle ? { handle, userId: userId ?? undefined, viewerId: me ?? undefined } : 'skip');
  const follow = useMutation(api.social.toggleFollow);
  const update = useMutation(api.social.updateProfile);
  const saved = useLocalIds('saved');
  const savedItems = useQuery(api.movies.byIds, { ids: saved.ids });
  const [tab, setTab] = useState<Tab>('reels');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [switching, setSwitching] = useState(false);
  const switchAccount = useSwitchAccount();
  const people = useQuery(api.social.people, switching ? { userId: me ?? undefined } : 'skip');

  if (!profile) {
    return <SafeAreaView style={styles.screen} />;
  }

  const items = tab === 'reels' ? profile.reels : (savedItems ?? []).map((m) => ({ ...m, status: 'done' as const }));

  const header = (
    <View style={{ gap: 14, marginBottom: 12 }}>
      <View style={styles.topRow}>
        {showBack ? (
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        ) : null}
        <Text style={styles.handle}>{profile.handle}</Text>
        <View style={{ flex: 1 }} />
        {profile.isMe ? (
          <>
            <Pressable testID="switch-account" onPress={() => setSwitching(true)} hitSlop={8}>
              <Text style={{ fontSize: 14, color: colors.muted, fontWeight: '800' }}>Switch ⇄</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(tabs)/studio')} hitSlop={8}>
              <Text style={{ fontSize: 26, color: colors.text }}>＋</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      <View style={styles.idRow}>
        <View style={styles.bigAvatar}>
          {profile.look ? <BlockyCharacter look={profile.look} size={92} /> : <Avatar name={profile.name} size={88} />}
        </View>
        <View style={styles.stats}>
          <Stat n={profile.stats.reels} label="reels" />
          <Stat n={profile.stats.followers} label="followers" />
          <Stat n={profile.stats.likes} label="likes" />
        </View>
      </View>
      {profile.earnings.remixes > 0 ? (
        <View style={styles.earn}>
          <Text style={{ fontSize: 26 }}>💸</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.earnTitle}>
              ${Math.round(profile.earnings.dollars).toLocaleString()} remixes
              {profile.earnings.sponsors ? ` · $${Math.round(profile.earnings.sponsors).toLocaleString()} sponsors` : ''}
            </Text>
            <Text style={styles.earnSub}>
              {profile.earnings.remixes.toLocaleString()} paid remixes{profile.earnings.sponsors ? ' + brand placements' : ''} · paid out through Whop
            </Text>
          </View>
        </View>
      ) : null}
      {editing ? (
        <View style={{ gap: 8 }}>
          <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.faint} style={styles.input} />
          <TextInput value={bio} onChangeText={setBio} placeholder="Bio" placeholderTextColor={colors.faint} style={styles.input} />
        </View>
      ) : (
        <View style={{ gap: 2 }}>
          <Text style={styles.name}>{profile.name}</Text>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        </View>
      )}
      <View style={styles.actions}>
        {profile.isMe ? (
          <>
            <Pressable
              testID="edit-profile"
              style={styles.action}
              onPress={async () => {
                if (editing) await update({ userId: profile._id, name, bio });
                else {
                  setName(profile.name);
                  setBio(profile.bio);
                }
                setEditing(!editing);
              }}>
              <Text style={styles.actionText}>{editing ? 'Save' : 'Edit profile'}</Text>
            </Pressable>
            <Pressable style={styles.action} onPress={() => router.push('/cast/consent')}>
              <Text style={styles.actionText}>{profile.look ? 'Recast my character' : 'Cast yourself'}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              testID="follow"
              style={[styles.action, !profile.followedByViewer && { backgroundColor: colors.cyan }]}
              onPress={() => {
                if (!me) return;
                Haptics.selectionAsync();
                follow({ followerId: me, followeeId: profile._id });
              }}>
              <Text style={[styles.actionText, !profile.followedByViewer && { color: '#000' }]}>{profile.followedByViewer ? 'Following' : 'Follow'}</Text>
            </Pressable>
            <Pressable testID="message" style={styles.action} onPress={() => router.push({ pathname: '/inbox/[peer]', params: { peer: profile._id } })}>
              <Text style={styles.actionText}>Message</Text>
            </Pressable>
          </>
        )}
      </View>
      {profile.isMe ? (
        <View style={styles.tabs}>
          {(['reels', 'saved'] as const).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t && { color: colors.text }]}>{t === 'reels' ? '🎬 Reels' : '🔖 Saved'}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  const topLikes = [...(profile?.reels ?? [])].map((r) => r.likes).sort((a, b) => b - a)[1] ?? 0;
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <Modal visible={switching} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSwitching(false)}>
        <View style={styles.sheet}>
          <Text style={[type.heading, { textAlign: 'center' }]}>Switch account</Text>
          <ScrollView contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
            {(people ?? []).map((p) => (
              <Pressable
                key={p._id}
                onPress={async () => {
                  setSwitching(false);
                  await switchAccount(p._id);
                }}
                style={styles.switchRow}>
                <Avatar look={p.look} name={p.name} size={44} />
                <View>
                  <Text style={styles.name}>{p.name}</Text>
                  <Text style={type.small}>@{p.handle}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => setSwitching(false)} style={styles.action}>
            <Text style={styles.actionText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
      <FlatList
        data={items}
        keyExtractor={(m) => m._id}
        numColumns={3}
        columnWrapperStyle={{ gap: 3 }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 32, gap: 3 }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <Text style={[type.small, { textAlign: 'center', marginTop: 30 }]}>
            {tab === 'saved' ? 'Bookmark reels in the feed to keep them here.' : profile.isMe ? 'Your reels show up here. Open the Studio to make one.' : 'No reels yet.'}
          </Text>
        }
        renderItem={({ item }) => {
          const accent = GENRE_COLORS[item.genre] ?? colors.yellow;
          const target =
            item.status === 'done' ? '/movie/[id]/premiere' : item.status === 'draft' ? (item.isReel ? '/movie/[id]/reel' : '/movie/[id]/story') : '/movie/[id]/render';
          return (
            <Pressable onPress={() => router.push({ pathname: target, params: { id: item._id } })} style={[styles.tile, { backgroundColor: accent + '33' }]}>
              {item.thumbnailUrl ? (
                <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : item.cast[0]?.look ? (
                <BlockyCharacter look={item.cast[0].look} size={70} animate={false} />
              ) : null}
              <View style={styles.tileShade} />
              <Text style={styles.tileTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.status === 'done' && item.likes >= 300_000 && item.likes >= topLikes ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.likes >= 1_000_000 ? '🔥 Viral' : '🔥 Trending'}</Text>
                </View>
              ) : null}
              <Text style={styles.tileMeta}>{item.status === 'done' ? `▶ ${compact(item.views)}  ♡ ${compact(item.likes)}` : item.status.toUpperCase()}</Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: colors.text, fontSize: 19, fontWeight: '900' }}>{compact(n)}</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  sheet: { flex: 1, backgroundColor: colors.surface, padding: 18, paddingBottom: 32 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: colors.surfaceHi },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6 },
  back: { color: colors.text, fontSize: 34, fontWeight: '300', marginTop: -4 },
  handle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  bigAvatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surfaceHi, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.pink },
  stats: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  name: { color: colors.text, fontSize: 16, fontWeight: '800' },
  bio: { color: colors.text, fontSize: 14, opacity: 0.85 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, backgroundColor: colors.surfaceHi, borderRadius: radius.sm, paddingVertical: 9, alignItems: 'center' },
  actionText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  input: { color: colors.text, backgroundColor: colors.surfaceHi, borderRadius: radius.sm, padding: 10, fontSize: 15 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  tabActive: { borderBottomWidth: 2, borderColor: colors.text },
  tabText: { color: colors.muted, fontWeight: '800' },
  tile: { flex: 1, maxWidth: '33%', aspectRatio: 0.62, borderRadius: 6, alignItems: 'center', justifyContent: 'flex-end', padding: 6, gap: 4, overflow: 'hidden' },
  tileShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60, backgroundColor: 'rgba(0,0,0,0.45)' },
  tileTitle: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  earn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.green },
  earnTitle: { color: colors.text, fontWeight: '900', fontSize: 16 },
  earnSub: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  badge: { position: 'absolute', top: 6, left: 6, backgroundColor: colors.pink, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  tileMeta: { color: colors.text, fontSize: 11, fontWeight: '700', opacity: 0.85 },
});
