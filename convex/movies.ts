import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import library from "../shared/assetLibrary.json";
import { buildShotPlan, cleanStory, isGenre, storyValidator, templateStory, type PlanCast } from "./story";

async function castWithLooks(ctx: QueryCtx, movie: Doc<"movies">) {
  return await Promise.all(
    movie.cast.map(async ({ castMemberId, role }) => {
      const member = await ctx.db.get(castMemberId);
      return { castMemberId, role, name: member?.name ?? "Unknown", look: member?.look ?? null };
    }),
  );
}

async function okToPostFor(ctx: QueryCtx, castMemberIds: Id<"castMembers">[]) {
  for (const id of castMemberIds) {
    const member = await ctx.db.get(id);
    const consent = member && (await ctx.db.get(member.consentId));
    if (!consent?.okToPost) return false;
  }
  return true;
}

export const create = mutation({
  args: { castMemberId: v.id("castMembers"), genre: v.string() },
  handler: async (ctx, { castMemberId, genre }) => {
    if (!isGenre(genre)) throw new Error("Unknown genre");
    const member = await ctx.db.get(castMemberId);
    if (!member || member.status !== "ready") throw new Error("This cast member isn't ready yet");
    return await ctx.db.insert("movies", {
      genre,
      cast: [{ castMemberId, role: library.genres[genre].roles[0] }],
      story: templateStory(genre),
      status: "draft",
      attempts: 0,
      okToPost: await okToPostFor(ctx, [castMemberId]),
      postedToFeed: false,
    });
  },
});

export const get = query({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie) return null;
    const videoUrl = movie.videoStorageId ? await ctx.storage.getUrl(movie.videoStorageId) : null;
    const { plan: _plan, ...rest } = movie;
    return { ...rest, castDetails: await castWithLooks(ctx, movie), videoUrl };
  },
});

export const updateStory = mutation({
  args: { movieId: v.id("movies"), story: storyValidator },
  handler: async (ctx, { movieId, story }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie) throw new Error("Movie not found");
    if (movie.status !== "draft") throw new Error("The story is locked once the cameras roll");
    await ctx.db.patch(movieId, { story: cleanStory(story) });
  },
});

export const setRole = mutation({
  args: { movieId: v.id("movies"), castMemberId: v.id("castMembers"), role: v.string() },
  handler: async (ctx, { movieId, castMemberId, role }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie || movie.status !== "draft") throw new Error("The cast is locked once the cameras roll");
    await ctx.db.patch(movieId, {
      cast: movie.cast.map((c) => (c.castMemberId === castMemberId ? { ...c, role: role.trim().slice(0, 30) || c.role } : c)),
    });
  },
});

export const action = mutation({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie) throw new Error("Movie not found");
    if (movie.status !== "draft") return;
    const cast: PlanCast[] = [];
    for (const [i, { castMemberId, role }] of movie.cast.entries()) {
      const member = await ctx.db.get(castMemberId);
      if (!member?.look) throw new Error(`${member?.name ?? "A cast member"} doesn't have a look yet`);
      cast.push({ id: `c${i + 1}`, name: member.name, role, look: member.look });
    }
    const lockedAt = Date.now();
    await ctx.db.patch(movieId, {
      status: "queued",
      plan: buildShotPlan(movie.genre, movie.story, cast),
      progress: { label: "Waiting for the render stage…", pct: 0 },
      lockedAt,
      error: undefined,
    });
    await ctx.scheduler.runAfter(10 * 60 * 1000, internal.worker.expireStuck, { movieId, lockedAt });
  },
});

export const retry = mutation({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie || movie.status !== "failed") return;
    const lockedAt = Date.now();
    await ctx.db.patch(movieId, {
      status: "queued",
      attempts: 0,
      error: undefined,
      workerId: undefined,
      lockedAt,
      progress: { label: "Waiting for the render stage…", pct: 0 },
    });
    await ctx.scheduler.runAfter(10 * 60 * 1000, internal.worker.expireStuck, { movieId, lockedAt });
  },
});

export const postToFeed = mutation({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie || movie.status !== "done") throw new Error("The movie isn't finished yet");
    if (!movie.okToPost) throw new Error("This star didn't OK posting to the feed");
    await ctx.db.patch(movieId, { postedToFeed: true });
  },
});

export const feed = query({
  args: {},
  handler: async (ctx) => {
    const done = await ctx.db
      .query("movies")
      .withIndex("by_status", (q) => q.eq("status", "done"))
      .order("desc")
      .take(50);
    return await Promise.all(
      done
        .filter((m) => m.postedToFeed)
        .map(async (m) => ({
          _id: m._id,
          genre: m.genre,
          title: m.story.title,
          logline: m.story.logline,
          finishedAt: m.finishedAt,
          cast: await castWithLooks(ctx, m),
        })),
    );
  },
});

export const recast = mutation({
  args: { movieId: v.id("movies"), castMemberId: v.id("castMembers") },
  handler: async (ctx, { movieId, castMemberId }) => {
    const original = await ctx.db.get(movieId);
    if (!original) throw new Error("Movie not found");
    const member = await ctx.db.get(castMemberId);
    if (!member || member.status !== "ready") throw new Error("This cast member isn't ready yet");
    const role = original.cast[0]?.role ?? library.genres[original.genre as keyof typeof library.genres]?.roles[0] ?? "Star";
    return await ctx.db.insert("movies", {
      genre: original.genre,
      cast: [{ castMemberId, role }],
      story: original.story,
      status: "draft",
      attempts: 0,
      okToPost: await okToPostFor(ctx, [castMemberId]),
      postedToFeed: false,
      recastOf: original._id,
    });
  },
});
