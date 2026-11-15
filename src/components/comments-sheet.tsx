import { useMutation, useQuery } from 'convex/react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type ComponentRef, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Animated, FlatList, KeyboardAvoidingView, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { Look } from '../../convex/looks';
import { Avatar } from '@/components/avatar';
import { compact } from '@/components/reel-card';
import { ago } from '@/components/sheets';
import { useMe } from '@/me';
import { colors, radius, type } from '@/theme';

type Author = { _id: Id<'users'>; handle: string; name: string; look: Look | null } | null;
type Row = {
  _id: Id<'comments'> | string;
  body: string;
  at: number;
  likes: number;
  liked: boolean;
  pinned: boolean;
  mine: boolean;
  isCreator: boolean;
  author: Author;
};
type Item = Row & { replies: Row[] };

const EMOJI = ['🔥', '😂', '😍', '👏', '🎬', '🥋'];

function LikeButton({ liked, likes, onPress }: { liked: boolean; likes: number; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scale.setValue(0.6);
    Animated.spring(scale, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true }).start();
    onPress();
  };
  return (
    <Pressable testID="comment-like" onPress={press} hitSlop={10} style={styles.like}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <SymbolView name={liked ? 'heart.fill' : 'heart'} size={17} tintColor={liked ? colors.red : colors.muted} />
      </Animated.View>
      <Text style={[styles.likeCount, liked && { color: colors.red }]}>{likes > 0 ? compact(likes) : ''}</Text>
    </Pressable>
  );
}

function CommentRow({
  row,
  small,
  onLike,
  onReply,
  onLongPress,
}: {
  row: Row;
  small?: boolean;
  onLike: () => void;
  onReply: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350} style={[styles.row, small && { marginLeft: 46 }]}>
      <Avatar look={row.author?.look} name={row.author?.name} size={small ? 26 : 36} />
      <View style={{ flex: 1, gap: 3 }}>
        {row.pinned ? <Text style={styles.pinned}>📌 Pinned by creator</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.handle}>{row.author?.handle ?? 'someone'}</Text>
          {row.isCreator ? (
            <View style={styles.creator}>
              <Text style={styles.creatorText}>Creator</Text>
            </View>
          ) : null}
          <Text style={styles.time}>{ago(row.at)}</Text>
        </View>
        <Text style={styles.body}>{row.body}</Text>
        <Pressable onPress={onReply} hitSlop={8}>
          <Text style={styles.reply}>Reply</Text>
        </Pressable>
      </View>
      <LikeButton liked={row.liked} likes={row.likes} onPress={onLike} />
    </Pressable>
  );
}

export function CommentsSheet({ movieId, onClose }: { movieId: Id<'movies'> | null; onClose: () => void }) {
  const { id, me } = useMe();
  const [sort, setSort] = useState<'top' | 'newest'>('top');
  const data = useQuery(api.comments.list, movieId ? { movieId, userId: id ?? undefined, sort } : 'skip');
  const add = useMutation(api.comments.add);
  const toggleLike = useMutation(api.comments.toggleLike);
  const pin = useMutation(api.comments.pin);
  const remove = useMutation(api.comments.remove);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: Id<'comments'>; handle: string } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Item[]>([]);
  const [likeOverride, setLikeOverride] = useState<Record<string, { liked: boolean; likes: number }>>({});
  const input = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (!movieId) {
      setReplyTo(null);
      setText('');
      setPending([]);
      setLikeOverride({});
    }
  }, [movieId]);

  const withLike = (r: Row): Row => (likeOverride[r._id as string] ? { ...r, ...likeOverride[r._id as string] } : r);

  const like = (r: Row) => {
    if (!id || typeof r._id !== 'string' || r._id.startsWith('pending')) return;
    const cur = withLike(r);
    setLikeOverride((o) => ({ ...o, [r._id as string]: { liked: !cur.liked, likes: cur.likes + (cur.liked ? -1 : 1) } }));
    toggleLike({ commentId: r._id as Id<'comments'>, userId: id });
  };

  const send = async () => {
    const body = text.trim();
    if (!movieId || !id || !body) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const temp: Item = {
      _id: `pending-${Date.now()}`,
      body,
      at: Date.now(),
      likes: 0,
      liked: false,
      pinned: false,
      mine: true,
      isCreator: !!data?.isOwner,
      author: me ? { _id: me._id, handle: me.handle, name: me.name, look: me.look } : null,
      replies: [],
    };
    const parent = replyTo;
    if (!parent) setPending((p) => [temp, ...p]);
    setText('');
    setReplyTo(null);
    if (parent) setOpen((s) => new Set(s).add(parent.id));
    await add({ movieId, userId: id, body, parentId: parent?.id });
    setPending((p) => p.filter((x) => x._id !== temp._id));
  };

  const startReply = (r: Row, parentId: Id<'comments'>) => {
    setReplyTo({ id: parentId, handle: r.author?.handle ?? '' });
    setText(r.author?.handle ? `@${r.author.handle} ` : '');
    input.current?.focus();
  };

  const menu = (r: Row, parentId: Id<'comments'>, topLevel: boolean) => {
    if (typeof r._id !== 'string' || r._id.startsWith('pending')) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const options = ['Copy', 'Reply'];
    if (data?.isOwner && topLevel) options.push(r.pinned ? 'Unpin' : 'Pin to top');
    if (r.mine) options.push('Delete');
    options.push('Cancel');
    ActionSheetIOS.showActionSheetWithOptions(
      { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: r.mine ? options.indexOf('Delete') : undefined },
      (i) => {
        const choice = options[i];
        if (choice === 'Copy') Clipboard.setStringAsync(r.body);
        if (choice === 'Reply') startReply(r, parentId);
        if ((choice === 'Pin to top' || choice === 'Unpin') && id) pin({ commentId: r._id as Id<'comments'>, userId: id });
        if (choice === 'Delete' && id) remove({ commentId: r._id as Id<'comments'>, userId: id });
      },
    );
  };

  const items: Item[] = [...pending, ...((data?.items ?? []) as Item[])];
  const total = (data?.total ?? 0) + pending.length;

  return (
    <Modal visible={!!movieId} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Text style={styles.title}>{total.toLocaleString()} comments</Text>
          <View style={styles.sortRow}>
            {(['top', 'newest'] as const).map((s) => (
              <Pressable key={s} testID={`sort-${s}`} onPress={() => setSort(s)} style={[styles.sort, sort === s && styles.sortOn]}>
                <Text style={[styles.sortText, sort === s && { color: colors.text }]}>{s === 'top' ? 'Top' : 'Newest'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <FlatList
          style={{ flex: 1 }}
          data={items}
          keyExtractor={(c) => c._id as string}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 16, paddingVertical: 12 }}
          ListEmptyComponent={data ? <Text style={[type.small, { textAlign: 'center', marginTop: 40 }]}>No comments yet. Start the conversation.</Text> : undefined}
          renderItem={({ item }) => {
            const parentId = item._id as Id<'comments'>;
            const expanded = open.has(item._id as string);
            return (
              <View style={{ gap: 12 }}>
                <CommentRow row={withLike(item)} onLike={() => like(item)} onReply={() => startReply(item, parentId)} onLongPress={() => menu(item, parentId, true)} />
                {item.replies.length > 0 && !expanded ? (
                  <Pressable onPress={() => setOpen((s) => new Set(s).add(item._id as string))} style={styles.viewReplies} hitSlop={6}>
                    <View style={styles.rule} />
                    <Text style={styles.viewRepliesText}>
                      View {item.replies.length} {item.replies.length === 1 ? 'reply' : 'replies'}
                    </Text>
                  </Pressable>
                ) : null}
                {expanded
                  ? item.replies.map((r) => (
                      <CommentRow key={r._id as string} small row={withLike(r)} onLike={() => like(r)} onReply={() => startReply(r, parentId)} onLongPress={() => menu(r, parentId, false)} />
                    ))
                  : null}
              </View>
            );
          }}
        />
        <View style={styles.quick}>
          {EMOJI.map((e) => (
            <Pressable key={e} onPress={() => setText((t) => t + e)} hitSlop={6}>
              <Text style={{ fontSize: 26 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        {replyTo ? (
          <View style={styles.replying}>
            <Text style={type.small}>Replying to @{replyTo.handle}</Text>
            <Pressable
              onPress={() => {
                setReplyTo(null);
                setText('');
              }}
              hitSlop={8}>
              <Text style={{ color: colors.muted, fontWeight: '900' }}>✕</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.composer}>
          <Avatar look={me?.look} name={me?.name} size={34} />
          <TextInput
            ref={input}
            testID="comment-input"
            value={text}
            onChangeText={setText}
            placeholder="Add a comment…"
            placeholderTextColor={colors.faint}
            style={styles.input}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable testID="comment-post" onPress={send} disabled={!text.trim()} hitSlop={8}>
            <Text style={[styles.post, { opacity: text.trim() ? 1 : 0.4 }]}>Post</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: 16, paddingBottom: 24 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginTop: 8 },
  header: { alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sortRow: { flexDirection: 'row', gap: 6, backgroundColor: colors.surfaceHi, borderRadius: radius.pill, padding: 3 },
  sort: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.pill },
  sortOn: { backgroundColor: colors.border },
  sortText: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  pinned: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  handle: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  creator: { backgroundColor: colors.pink, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  creatorText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  time: { color: colors.faint, fontSize: 12 },
  body: { color: colors.text, fontSize: 15, lineHeight: 20 },
  reply: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 2 },
  like: { alignItems: 'center', width: 36, gap: 2, paddingTop: 4 },
  likeCount: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  viewReplies: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 46 },
  rule: { width: 24, height: StyleSheet.hairlineWidth, backgroundColor: colors.muted },
  viewRepliesText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  quick: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  replying: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6 },
  input: { flex: 1, color: colors.text, backgroundColor: colors.surfaceHi, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15 },
  post: { color: colors.cyan, fontSize: 16, fontWeight: '800' },
});
