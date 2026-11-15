import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { ownerCard } from "./movies";

export const list = query({
  args: { movieId: v.id("movies"), userId: v.optional(v.id("users")), sort: v.union(v.literal("top"), v.literal("newest")) },
  handler: async (ctx, { movieId, userId, sort }) => {
    const movie = await ctx.db.get(movieId);
    const rows = await ctx.db
      .query("comments")
      .withIndex("by_movie", (q) => q.eq("movieId", movieId))
      .collect();
    const cards = new Map<string, Awaited<ReturnType<typeof ownerCard>>>();
    const shape = async (c: Doc<"comments">) => {
      if (!cards.has(c.userId)) cards.set(c.userId, await ownerCard(ctx, c.userId));
      const liked =
        !!userId &&
        !!(await ctx.db
          .query("commentLikes")
          .withIndex("by_comment_user", (q) => q.eq("commentId", c._id).eq("userId", userId))
          .first());
      return {
        _id: c._id,
        body: c.body,
        at: c._creationTime,
        likes: c.likes ?? 0,
        liked,
        pinned: !!c.pinned,
        mine: !!userId && c.userId === userId,
        isCreator: !!movie?.ownerId && c.userId === movie.ownerId,
        author: cards.get(c.userId) ?? null,
      };
    };
    const top = rows.filter((c) => !c.parentId);
    const ordered =
      sort === "top"
        ? top.sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
        : top.sort((a, b) => b._creationTime - a._creationTime);
    const pinnedFirst = [...ordered.filter((c) => c.pinned), ...ordered.filter((c) => !c.pinned)];
    const items = [];
    for (const c of pinnedFirst) {
      const replies = rows.filter((r) => r.parentId === c._id).sort((a, b) => a._creationTime - b._creationTime);
      items.push({ ...(await shape(c)), replies: await Promise.all(replies.map(shape)) });
    }
    return { total: Math.max(rows.length, movie?.commentCount ?? 0), isOwner: !!userId && movie?.ownerId === userId, items };
  },
});

export const add = mutation({
  args: { movieId: v.id("movies"), userId: v.id("users"), body: v.string(), parentId: v.optional(v.id("comments")) },
  handler: async (ctx, { movieId, userId, body, parentId }) => {
    const text = body.trim().slice(0, 300);
    const movie = await ctx.db.get(movieId);
    if (!text || !movie) return null;
    const parent = parentId ? await ctx.db.get(parentId) : null;
    const id = await ctx.db.insert("comments", { movieId, userId, body: text, likes: 0, ...(parent ? { parentId: parent.parentId ?? parent._id } : {}) });
    await ctx.db.patch(movieId, { commentCount: (movie.commentCount ?? 0) + 1 });
    if (movie.ownerId && movie.ownerId !== userId) {
      await ctx.db.insert("messages", { fromId: userId, toId: movie.ownerId, body: 'commented: "' + text.slice(0, 80) + '"', movieId });
    }
    return id;
  },
});

export const toggleLike = mutation({
  args: { commentId: v.id("comments"), userId: v.id("users") },
  handler: async (ctx, { commentId, userId }) => {
    const c = await ctx.db.get(commentId);
    if (!c) return false;
    const existing = await ctx.db
      .query("commentLikes")
      .withIndex("by_comment_user", (q) => q.eq("commentId", commentId).eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(commentId, { likes: Math.max(0, (c.likes ?? 0) - 1) });
      return false;
    }
    await ctx.db.insert("commentLikes", { commentId, userId });
    await ctx.db.patch(commentId, { likes: (c.likes ?? 0) + 1 });
    return true;
  },
});

export const pin = mutation({
  args: { commentId: v.id("comments"), userId: v.id("users") },
  handler: async (ctx, { commentId, userId }) => {
    const c = await ctx.db.get(commentId);
    const movie = c && (await ctx.db.get(c.movieId));
    if (!c || !movie || movie.ownerId !== userId) throw new Error("Only the creator can pin");
    const all = await ctx.db
      .query("comments")
      .withIndex("by_movie", (q) => q.eq("movieId", c.movieId))
      .collect();
    for (const other of all) if (other.pinned && other._id !== commentId) await ctx.db.patch(other._id, { pinned: false });
    await ctx.db.patch(commentId, { pinned: !c.pinned });
  },
});

export const remove = mutation({
  args: { commentId: v.id("comments"), userId: v.id("users") },
  handler: async (ctx, { commentId, userId }) => {
    const c = await ctx.db.get(commentId);
    if (!c || c.userId !== userId) return;
    const replies = (
      await ctx.db
        .query("comments")
        .withIndex("by_movie", (q) => q.eq("movieId", c.movieId))
        .collect()
    ).filter((r) => r.parentId === commentId);
    for (const r of replies) await ctx.db.delete(r._id);
    await ctx.db.delete(commentId);
    const movie = await ctx.db.get(c.movieId);
    if (movie) await ctx.db.patch(movie._id, { commentCount: Math.max(0, (movie.commentCount ?? 0) - 1 - replies.length) });
  },
});
