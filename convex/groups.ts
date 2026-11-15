import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { ownerCard } from "./movies";
import { reelPreview } from "./social";

export async function myGroups(ctx: QueryCtx, userId: Id<"users">) {
  const all = await ctx.db.query("groups").collect();
  return all.filter((g) => g.memberIds.includes(userId));
}

export async function groupUnread(ctx: QueryCtx, group: Doc<"groups">, userId: Id<"users">) {
  const read = await ctx.db
    .query("groupReads")
    .withIndex("by_group_user", (q) => q.eq("groupId", group._id).eq("userId", userId))
    .first();
  const since = read?.readAt ?? 0;
  const recent = await ctx.db
    .query("groupMessages")
    .withIndex("by_group", (q) => q.eq("groupId", group._id))
    .order("desc")
    .take(100);
  return recent.filter((m) => m._creationTime > since && m.fromId !== userId).length;
}

export async function groupSummary(ctx: QueryCtx, group: Doc<"groups">, userId: Id<"users">) {
  const last = await ctx.db
    .query("groupMessages")
    .withIndex("by_group", (q) => q.eq("groupId", group._id))
    .order("desc")
    .first();
  const members = (await Promise.all(group.memberIds.filter((m) => m !== userId).map((m) => ownerCard(ctx, m)))).filter(
    (m): m is NonNullable<typeof m> => !!m,
  );
  let preview = "New group";
  if (last) {
    const author = last.fromId === userId ? "You" : ((await ctx.db.get(last.fromId))?.name.split(" ")[0] ?? "Someone");
    preview = author + ": " + (last.body || "Sent a reel 🎬");
  }
  return {
    _id: group._id,
    name: group.name,
    members,
    unread: await groupUnread(ctx, group, userId),
    at: last?._creationTime ?? group.lastAt,
    preview,
  };
}

export const create = mutation({
  args: { userId: v.id("users"), name: v.string(), memberIds: v.array(v.id("users")) },
  handler: async (ctx, { userId, name, memberIds }) => {
    const members = [...new Set([userId, ...memberIds])];
    if (members.length < 2) throw new Error("Pick at least one person");
    const groupId = await ctx.db.insert("groups", { name: name.trim().slice(0, 40) || "New group", memberIds: members, createdBy: userId, lastAt: Date.now() });
    await ctx.db.insert("groupReads", { groupId, userId, readAt: Date.now() });
    return groupId;
  },
});

export const list = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }) => {
    if (!userId) return [];
    const groups = await myGroups(ctx, userId);
    return await Promise.all(groups.map((g) => groupSummary(ctx, g, userId)));
  },
});

export const thread = query({
  args: { groupId: v.id("groups"), userId: v.id("users") },
  handler: async (ctx, { groupId, userId }) => {
    const group = await ctx.db.get(groupId);
    if (!group || !group.memberIds.includes(userId)) return null;
    const rows = await ctx.db
      .query("groupMessages")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .order("desc")
      .take(150);
    const cards = new Map<string, Awaited<ReturnType<typeof ownerCard>>>();
    for (const id of group.memberIds) cards.set(id, await ownerCard(ctx, id));
    return {
      _id: group._id,
      name: group.name,
      members: group.memberIds.map((id) => cards.get(id)).filter((m): m is NonNullable<typeof m> => !!m),
      messages: await Promise.all(
        rows.reverse().map(async (m) => ({
          _id: m._id,
          mine: m.fromId === userId,
          body: m.body,
          at: m._creationTime,
          author: cards.get(m.fromId) ?? (await ownerCard(ctx, m.fromId)),
          reel: await reelPreview(ctx, m.movieId),
        })),
      ),
    };
  },
});

export const send = mutation({
  args: { groupId: v.id("groups"), userId: v.id("users"), body: v.string(), movieId: v.optional(v.id("movies")) },
  handler: async (ctx, { groupId, userId, body, movieId }) => {
    const group = await ctx.db.get(groupId);
    const text = body.trim().slice(0, 500);
    if (!group || !group.memberIds.includes(userId) || (!text && !movieId)) return;
    await ctx.db.insert("groupMessages", { groupId, fromId: userId, body: text, movieId });
    await ctx.db.patch(groupId, { lastAt: Date.now() });
    if (movieId) {
      const movie = await ctx.db.get(movieId);
      if (movie) await ctx.db.patch(movieId, { shareCount: (movie.shareCount ?? 0) + 1 });
    }
  },
});

export const markRead = mutation({
  args: { groupId: v.id("groups"), userId: v.id("users") },
  handler: async (ctx, { groupId, userId }) => {
    const read = await ctx.db
      .query("groupReads")
      .withIndex("by_group_user", (q) => q.eq("groupId", groupId).eq("userId", userId))
      .first();
    if (read) await ctx.db.patch(read._id, { readAt: Date.now() });
    else await ctx.db.insert("groupReads", { groupId, userId, readAt: Date.now() });
  },
});
