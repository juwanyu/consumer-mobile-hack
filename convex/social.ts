import { earningsFor } from "./remix";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { groupSummary, groupUnread, myGroups } from "./groups";
import { feedItem, ownerCard } from "./movies";

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16) || "director";
}

async function freeHandle(ctx: MutationCtx, base: string, self?: Id<"users">) {
  for (let i = 0; i < 50; i++) {
    const handle = i === 0 ? base : base + Math.floor(Math.random() * 900 + 100);
    const taken = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .first();
    if (!taken || taken._id === self) return handle;
  }
  return base + (Date.now() % 100000);
}

async function lookFor(ctx: QueryCtx, user: Doc<"users">) {
  const member = user.castMemberId && (await ctx.db.get(user.castMemberId));
  return member ? (member.look ?? null) : null;
}

export const ensureUser = mutation({
  args: { deviceKey: v.string() },
  handler: async (ctx, { deviceKey }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_device", (q) => q.eq("deviceKey", deviceKey))
      .first();
    if (existing) return existing._id;
    const handle = await freeHandle(ctx, "director");
    const id = await ctx.db.insert("users", { deviceKey, handle, name: "New director" });
    await ctx.scheduler.runAfter(0, internal.seed.starterInbox, { meId: id });
    return id;
  },
});

export const byDevice = query({
  args: { deviceKey: v.string() },
  handler: async (ctx, { deviceKey }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_device", (q) => q.eq("deviceKey", deviceKey))
      .first();
    return user?._id ?? null;
  },
});

export const me = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }) => {
    const user = userId && (await ctx.db.get(userId));
    if (!user) return null;
    const { deviceKey: _d, ...rest } = user;
    return { ...rest, look: await lookFor(ctx, user) };
  },
});

export const updateProfile = mutation({
  args: { userId: v.id("users"), name: v.optional(v.string()), handle: v.optional(v.string()), bio: v.optional(v.string()) },
  handler: async (ctx, { userId, name, handle, bio }) => {
    const patch: Partial<Doc<"users">> = {};
    if (name?.trim()) patch.name = name.trim().slice(0, 40);
    if (handle?.trim()) patch.handle = await freeHandle(ctx, slugify(handle), userId);
    if (bio !== undefined) patch.bio = bio.slice(0, 120);
    await ctx.db.patch(userId, patch);
  },
});

export const linkCharacter = mutation({
  args: { userId: v.id("users"), castMemberId: v.id("castMembers") },
  handler: async (ctx, { userId, castMemberId }) => {
    const user = await ctx.db.get(userId);
    const member = await ctx.db.get(castMemberId);
    if (!user || !member || user.castMemberId) return;
    const patch: Partial<Doc<"users">> = { castMemberId };
    if (user.name === "New director") {
      patch.name = member.name;
      patch.handle = await freeHandle(ctx, slugify(member.name), userId);
    }
    await ctx.db.patch(userId, patch);
  },
});

export const switchable = query({
  args: { handles: v.array(v.string()) },
  handler: async (ctx, { handles }) => {
    const out = [];
    for (const handle of handles) {
      const u = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handle", handle))
        .first();
      if (u) out.push({ _id: u._id, handle: u.handle, name: u.name, look: await lookFor(ctx, u) });
    }
    return out;
  },
});

export const people = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }) => {
    const users = await ctx.db.query("users").order("desc").take(60);
    const out = [];
    for (const u of users) {
      if (u._id === userId || u.name === "New director") continue;
      out.push({ _id: u._id, handle: u.handle, name: u.name, look: await lookFor(ctx, u) });
    }
    return out;
  },
});

export const profile = query({
  args: { handle: v.optional(v.string()), userId: v.optional(v.id("users")), viewerId: v.optional(v.id("users")) },
  handler: async (ctx, { handle, userId, viewerId }) => {
    const user = userId
      ? await ctx.db.get(userId)
      : handle
        ? await ctx.db
            .query("users")
            .withIndex("by_handle", (q) => q.eq("handle", handle))
            .first()
        : null;
    if (!user) return null;
    const movies = await ctx.db
      .query("movies")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .order("desc")
      .take(60);
    const isMe = viewerId === user._id;
    const visible = (isMe ? movies : movies.filter((m) => m.status === "done" && m.postedToFeed)).sort(
      (a, b) => Number(b.status === "done") - Number(a.status === "done") || (b.likes ?? 0) - (a.likes ?? 0),
    );
    const reels = await Promise.all(visible.map(async (m) => ({ ...(await feedItem(ctx, m)), status: m.status })));
    const followers = await ctx.db
      .query("follows")
      .withIndex("by_followee", (q) => q.eq("followeeId", user._id))
      .collect();
    const following = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", user._id))
      .collect();
    const likes = movies.reduce((sum, m) => sum + (m.likes ?? 0), 0);
    return {
      _id: user._id,
      handle: user.handle,
      name: user.name,
      bio: user.bio ?? "",
      look: await lookFor(ctx, user),
      castMemberId: user.castMemberId ?? null,
      reels,
      earnings: await earningsFor(ctx, user._id),
      stats: { reels: visible.length, followers: followers.length + (user.followersOffset ?? 0), following: following.length, likes },
      followedByViewer: !!viewerId && followers.some((f) => f.followerId === viewerId),
      isMe,
    };
  },
});

export const toggleFollow = mutation({
  args: { followerId: v.id("users"), followeeId: v.id("users") },
  handler: async (ctx, { followerId, followeeId }) => {
    if (followerId === followeeId) return false;
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", followerId).eq("followeeId", followeeId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return false;
    }
    await ctx.db.insert("follows", { followerId, followeeId });
    return true;
  },
});

export const sendMessage = mutation({
  args: { fromId: v.id("users"), toId: v.id("users"), body: v.string(), movieId: v.optional(v.id("movies")) },
  handler: async (ctx, { fromId, toId, body, movieId }) => {
    const text = body.trim().slice(0, 500);
    if (!text && !movieId) return;
    await ctx.db.insert("messages", { fromId, toId, body: text, movieId });
    if (movieId) {
      const movie = await ctx.db.get(movieId);
      if (movie) await ctx.db.patch(movieId, { shareCount: (movie.shareCount ?? 0) + 1 });
    }
  },
});

export const countShare = mutation({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const movie = await ctx.db.get(movieId);
    if (movie) await ctx.db.patch(movieId, { shareCount: (movie.shareCount ?? 0) + 1 });
  },
});

export async function reelPreview(ctx: QueryCtx, movieId: Id<"movies"> | undefined) {
  const movie = movieId && (await ctx.db.get(movieId));
  if (!movie) return null;
  const item = await feedItem(ctx, movie);
  return { _id: item._id, title: item.title, style: item.style, videoUrl: item.videoUrl, thumbnailUrl: item.thumbnailUrl, cast: item.cast, status: movie.status };
}

export const inbox = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const incoming = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("toId", userId))
      .order("desc")
      .take(200);
    const outgoing = await ctx.db
      .query("messages")
      .withIndex("by_from", (q) => q.eq("fromId", userId))
      .order("desc")
      .take(200);
    const threads = new Map<Id<"users">, { last: Doc<"messages">; unread: number }>();
    for (const m of [...incoming, ...outgoing].sort((a, b) => b._creationTime - a._creationTime)) {
      const peer = m.fromId === userId ? m.toId : m.fromId;
      const t = threads.get(peer) ?? { last: m, unread: 0 };
      if (m.toId === userId && !m.readAt) t.unread++;
      threads.set(peer, t);
    }
    const me = await ctx.db.get(userId);
    const pinned = me?.pinnedPeers ?? [];
    const out = [];
    for (const [peerId, t] of threads) {
      if (peerId === userId) continue;
      const peer = await ownerCard(ctx, peerId);
      if (!peer) continue;
      const body = t.last.body || "Sent a reel 🎬";
      out.push({ kind: "dm" as const, key: peerId as string, peer, group: null, unread: t.unread, at: t.last._creationTime, pinned: pinned.includes(peerId), preview: (t.last.fromId === userId ? "You: " : "") + body });
    }
    for (const g of await myGroups(ctx, userId)) {
      const s = await groupSummary(ctx, g, userId);
      out.push({ kind: "group" as const, key: g._id as string, peer: null, group: { _id: s._id, name: s.name, members: s.members }, unread: s.unread, at: s.at, pinned: false, preview: s.preview });
    }
    out.sort((a, b) => b.at - a.at);
    return out.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.pinned && b.pinned ? pinned.indexOf(a.peer!._id) - pinned.indexOf(b.peer!._id) : 0));
  },
});

export const unreadCount = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }) => {
    if (!userId) return 0;
    const incoming = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("toId", userId))
      .order("desc")
      .take(300);
    let total = incoming.filter((m) => !m.readAt).length;
    for (const g of await myGroups(ctx, userId)) total += await groupUnread(ctx, g, userId);
    return total;
  },
});

export const thread = query({
  args: { userId: v.id("users"), peerId: v.id("users") },
  handler: async (ctx, { userId, peerId }) => {
    const mine = await ctx.db
      .query("messages")
      .withIndex("by_from", (q) => q.eq("fromId", userId))
      .order("desc")
      .take(200);
    const theirs = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("toId", userId))
      .order("desc")
      .take(200);
    const rows = [...mine.filter((m) => m.toId === peerId), ...theirs.filter((m) => m.fromId === peerId)].sort(
      (a, b) => a._creationTime - b._creationTime,
    );
    return {
      peer: await ownerCard(ctx, peerId),
      messages: await Promise.all(
        rows.map(async (m) => ({ _id: m._id, mine: m.fromId === userId, body: m.body, at: m._creationTime, reel: await reelPreview(ctx, m.movieId) })),
      ),
    };
  },
});

export const markRead = mutation({
  args: { userId: v.id("users"), peerId: v.id("users") },
  handler: async (ctx, { userId, peerId }) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("toId", userId))
      .order("desc")
      .take(200);
    const now = Date.now();
    for (const m of rows) if (m.fromId === peerId && !m.readAt) await ctx.db.patch(m._id, { readAt: now });
  },
});

export const followingIds = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }) => {
    if (!userId) return [];
    const rows = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", userId))
      .collect();
    return rows.map((r) => r.followeeId);
  },
});

export const newAccount = mutation({
  args: { deviceKey: v.string() },
  handler: async (ctx, { deviceKey }) => {
    const current = await ctx.db
      .query("users")
      .withIndex("by_device", (q) => q.eq("deviceKey", deviceKey))
      .collect();
    for (const u of current) await ctx.db.patch(u._id, { deviceKey: "parked:" + u._id });
    const handle = await freeHandle(ctx, "director");
    const id = await ctx.db.insert("users", { deviceKey, handle, name: "New director" });
    await ctx.scheduler.runAfter(0, internal.seed.starterInbox, { meId: id });
    return id;
  },
});

export const switchAccount = mutation({
  args: { deviceKey: v.string(), toUserId: v.id("users") },
  handler: async (ctx, { deviceKey, toUserId }) => {
    const target = await ctx.db.get(toUserId);
    if (!target) throw new Error("No such account");
    if (target.deviceKey.startsWith("dev_") && target.deviceKey !== deviceKey) throw new Error("That account is signed in on another phone");
    const current = await ctx.db
      .query("users")
      .withIndex("by_device", (q) => q.eq("deviceKey", deviceKey))
      .collect();
    for (const u of current) if (u._id !== toUserId) await ctx.db.patch(u._id, { deviceKey: "parked:" + u._id });
    await ctx.db.patch(toUserId, { deviceKey });
    return toUserId;
  },
});
