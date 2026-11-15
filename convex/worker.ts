import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

const MAX_ATTEMPTS = 2;

function checkSecret(secret: string) {
  const expected = process.env.WORKER_SECRET;
  if (!expected || secret !== expected) throw new Error("Unauthorized render worker");
}

export const queue = query({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    checkSecret(secret);
    const queued = await ctx.db
      .query("movies")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .order("asc")
      .take(10);
    return queued.map((m) => m._id);
  },
});

export const claim = mutation({
  args: { secret: v.string(), movieId: v.id("movies"), workerId: v.string() },
  handler: async (ctx, { secret, movieId, workerId }) => {
    checkSecret(secret);
    const movie = await ctx.db.get(movieId);
    if (!movie || movie.status !== "queued") return null;
    await ctx.db.patch(movieId, {
      status: "rendering",
      workerId,
      claimedAt: Date.now(),
      attempts: movie.attempts + 1,
      progress: { label: "Building the set…", pct: 2 },
    });
    return { plan: movie.plan, attempt: movie.attempts + 1 };
  },
});

export const progress = mutation({
  args: { secret: v.string(), movieId: v.id("movies"), label: v.string(), pct: v.number() },
  handler: async (ctx, { secret, movieId, label, pct }) => {
    checkSecret(secret);
    const movie = await ctx.db.get(movieId);
    if (!movie || movie.status !== "rendering") return;
    await ctx.db.patch(movieId, { progress: { label, pct: Math.max(0, Math.min(100, pct)) } });
  },
});

export const generateUploadUrl = mutation({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    checkSecret(secret);
    return await ctx.storage.generateUploadUrl();
  },
});

export const complete = mutation({
  args: { secret: v.string(), movieId: v.id("movies"), storageId: v.id("_storage") },
  handler: async (ctx, { secret, movieId, storageId }) => {
    checkSecret(secret);
    const movie = await ctx.db.get(movieId);
    if (!movie) return;
    await ctx.db.patch(movieId, {
      status: "done",
      videoStorageId: storageId,
      progress: { label: "It's a wrap!", pct: 100 },
      finishedAt: Date.now(),
      error: undefined,
    });
  },
});

export const fail = mutation({
  args: { secret: v.string(), movieId: v.id("movies"), error: v.string() },
  handler: async (ctx, { secret, movieId, error }) => {
    checkSecret(secret);
    const movie = await ctx.db.get(movieId);
    if (!movie || movie.status !== "rendering") return;
    if (movie.attempts < MAX_ATTEMPTS) {
      await ctx.db.patch(movieId, { status: "queued", workerId: undefined, progress: { label: "Retake! Rolling again…", pct: 0 } });
      return;
    }
    await ctx.db.patch(movieId, { status: "failed", error: error.slice(0, 300), progress: undefined });
  },
});

export const expireStuck = internalMutation({
  args: { movieId: v.id("movies"), lockedAt: v.number() },
  handler: async (ctx, { movieId, lockedAt }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie || movie.lockedAt !== lockedAt) return;
    if (movie.status !== "queued" && movie.status !== "rendering") return;
    await ctx.db.patch(movieId, {
      status: "failed",
      error: movie.status === "queued" ? "The render worker isn't running. Start it on the Mac, then tap Try again." : "The render took too long. Tap Try again.",
      progress: undefined,
    });
  },
});
