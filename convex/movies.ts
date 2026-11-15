import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import { buildReelPlan, type SlotCast } from "./reelPlan";
import { latestCut } from "./director";
import { REEL_TEMPLATES, type SlotId } from "./reels";
import library from "../shared/assetLibrary.json";
import { buildShotPlan, cleanStory, isGenre, storyValidator, templateStory, type PlanCast } from "./story";

export async function castWithLooks(ctx: QueryCtx, movie: Doc<"movies">) {
  return await Promise.all(
    movie.cast.map(async ({ castMemberId, role, slot }) => {
      const member = await ctx.db.get(castMemberId);
      return { castMemberId, role, slot: slot ?? null, name: member?.name ?? "Unknown", look: member?.look ?? null };
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
  args: { castMemberId: v.id("castMembers"), genre: v.string(), ownerId: v.optional(v.id("users")) },
  handler: async (ctx, { castMemberId, genre, ownerId }) => {
    if (!isGenre(genre)) throw new Error("Unknown genre");
    const member = await ctx.db.get(castMemberId);
    if (!member || member.status !== "ready") throw new Error("This cast member isn't ready yet");
    return await ctx.db.insert("movies", {
      genre,
      cast: [{ castMemberId, role: library.genres[genre].roles[0] }],
      story: templateStory(genre),
      ownerId,
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
    const template = movie.reel ? REEL_TEMPLATES[movie.reel.templateId] : undefined;
    return {
      ...rest,
      castDetails: await castWithLooks(ctx, movie),
      owner: await ownerCard(ctx, movie.ownerId),
      previewUrls: (await Promise.all((movie.previews ?? []).map(async (p) => ({ shot: p.shot, url: await ctx.storage.getUrl(p.storageId) })))).filter(
        (p): p is { shot: number; url: string } => !!p.url,
      ),
      shotCount: Array.isArray(movie.plan?.shots) ? movie.plan.shots.length : movie.reel?.beats.length ?? movie.story.shots.length,
      videoUrl,
      template: template ? { id: template.id, label: template.label, slots: template.slots, beatCount: template.beats.length } : null,
    };
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

export const createReel = mutation({
  args: { templateId: v.string(), master: v.id("castMembers"), caster: v.optional(v.id("castMembers")), ownerId: v.optional(v.id("users")) },
  handler: async (ctx, { templateId, master, caster, ownerId }) => {
    const template = REEL_TEMPLATES[templateId];
    if (!template) throw new Error("Unknown reel");
    const picks: Array<[SlotId, Id<"castMembers"> | undefined]> = [
      ["master", master],
      ["caster", caster],
    ];
    const cast = [];
    for (const [slot, id] of picks) {
      if (!id) continue;
      const member = await ctx.db.get(id);
      if (!member || member.status !== "ready") throw new Error("Every cast member needs a finished character first");
      cast.push({ castMemberId: id, role: template.slots.find((s) => s.id === slot)!.role, slot });
    }
    return await ctx.db.insert("movies", {
      genre: template.genre,
      cast,
      story: { title: template.title, logline: template.logline, shots: [] },
      reel: { templateId, beats: template.beats.map((b) => ({ caption: b.caption, narration: b.narration })) },
      ownerId,
      status: "draft",
      attempts: 0,
      okToPost: await okToPostFor(ctx, cast.map((c) => c.castMemberId)),
      postedToFeed: false,
    });
  },
});

export const updateReel = mutation({
  args: { movieId: v.id("movies"), beats: v.array(v.object({ caption: v.string(), narration: v.string() })) },
  handler: async (ctx, { movieId, beats }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie?.reel || movie.status !== "draft") throw new Error("The reel is locked once the cameras roll");
    await ctx.db.patch(movieId, {
      reel: {
        ...movie.reel,
        beats: beats.map((b) => ({ caption: b.caption.trim().slice(0, 60), narration: b.narration.trim().slice(0, 140) })),
      },
    });
  },
});

export const queueVoiced = internalMutation({
  args: { movieId: v.id("movies"), plan: v.any(), voiced: v.number() },
  handler: async (ctx, { movieId, plan }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie || movie.status !== "voicing") return;
    const lockedAt = Date.now();
    await ctx.db.patch(movieId, {
      status: "queued",
      plan,
      lockedAt,
      progress: { label: "Waiting for the render stage…", pct: 5 },
    });
    await ctx.scheduler.runAfter(10 * 60 * 1000, internal.worker.expireStuck, { movieId, lockedAt });
  },
});

export const action = mutation({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie) throw new Error("Movie not found");
    if (movie.status !== "draft") return;
    if (movie.reel) {
      const slotCast: SlotCast[] = [];
      for (const { castMemberId, role, slot } of movie.cast) {
        const member = await ctx.db.get(castMemberId);
        if (!member?.look) throw new Error(`${member?.name ?? "A cast member"} doesn't have a look yet`);
        slotCast.push({ slot: (slot ?? "master") as SlotId, name: member.name, role, look: member.look });
      }
      const plan = { ...buildReelPlan(movie.reel.templateId, movie.reel.beats, slotCast, await latestCut(ctx, movieId)), art_style: movie.artStyle ?? "blocky" };
      await ctx.db.patch(movieId, {
        status: "voicing",
        plan,
        progress: { label: "Recording the narrator…", pct: 2 },
        lockedAt: Date.now(),
        error: undefined,
      });
      await ctx.scheduler.runAfter(0, internal.narration.voice, { movieId, plan });
      return;
    }
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

export async function ownerCard(ctx: QueryCtx, ownerId: Id<"users"> | undefined) {
  const owner = ownerId && (await ctx.db.get(ownerId));
  if (!owner) return null;
  const member = owner.castMemberId && (await ctx.db.get(owner.castMemberId));
  return { _id: owner._id, handle: owner.handle, name: owner.name, look: member ? (member.look ?? null) : null };
}

async function thumbnailUrl(ctx: QueryCtx, m: Doc<"movies">) {
  const previews = m.previews ?? [];
  if (m.status !== "done" || previews.length === 0) return null;
  const pick = previews[Math.min(previews.length - 1, Math.floor(previews.length / 2))];
  return await ctx.storage.getUrl(pick.storageId);
}

export async function feedItem(ctx: QueryCtx, m: Doc<"movies">) {
  const template = m.reel ? REEL_TEMPLATES[m.reel.templateId] : undefined;
  return {
    owner: await ownerCard(ctx, m.ownerId),
    thumbnailUrl: await thumbnailUrl(ctx, m),
    commentCount: m.commentCount ?? 0,
    shareCount: m.shareCount ?? 0,
    views: m.views ?? (m.likes ?? 0) * 23 + 412,
    remixCount: m.remixCount ?? 0,
    _id: m._id,
    genre: m.genre,
    title: m.story.title,
    logline: m.story.logline,
    finishedAt: m.finishedAt,
    likes: m.likes ?? 0,
    postedToFeed: m.postedToFeed,
    style: template ? template.label : "Cinematic",
    isReel: !!m.reel,
    remixOf: m.remixOf ?? m.recastOf ?? null,
    videoUrl: m.videoStorageId ? await ctx.storage.getUrl(m.videoStorageId) : null,
    cast: await castWithLooks(ctx, m),
  };
}

export const feed = query({
  args: {},
  handler: async (ctx) => {
    const done = await ctx.db
      .query("movies")
      .withIndex("by_status", (q) => q.eq("status", "done"))
      .order("desc")
      .take(100);
    const posted = done.filter((m) => m.postedToFeed).sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
    return await Promise.all(posted.map((m) => feedItem(ctx, m)));
  },
});

export const byIds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }) => {
    const items = [];
    for (const raw of ids.slice(0, 100)) {
      const id = ctx.db.normalizeId("movies", raw);
      const movie = id && (await ctx.db.get(id));
      if (!movie) continue;
      items.push({ ...(await feedItem(ctx, movie)), status: movie.status });
    }
    return items;
  },
});

export const like = mutation({
  args: { movieId: v.id("movies"), delta: v.union(v.literal(1), v.literal(-1)) },
  handler: async (ctx, { movieId, delta }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie) return;
    await ctx.db.patch(movieId, { likes: Math.max(0, (movie.likes ?? 0) + delta) });
  },
});

export const setSlot = mutation({
  args: { movieId: v.id("movies"), slot: v.string(), castMemberId: v.optional(v.id("castMembers")) },
  handler: async (ctx, { movieId, slot, castMemberId }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie?.reel || movie.status !== "draft") throw new Error("The cast is locked once the cameras roll");
    const template = REEL_TEMPLATES[movie.reel.templateId];
    const slotDef = template?.slots.find((s) => s.id === slot);
    if (!slotDef) throw new Error("Unknown role");
    if (castMemberId) {
      const member = await ctx.db.get(castMemberId);
      if (!member || member.status !== "ready") throw new Error("That cast member isn't ready yet");
    } else if (slotDef.required) {
      throw new Error(`${slotDef.role} is required`);
    }
    const others = movie.cast.filter((c) => c.slot !== slot);
    const cast = castMemberId ? [...others, { castMemberId, role: slotDef.role, slot }] : others;
    await ctx.db.patch(movieId, { cast, okToPost: await okToPostFor(ctx, cast.map((c) => c.castMemberId)) });
  },
});

export const remix = mutation({
  args: { movieId: v.id("movies"), castMemberId: v.id("castMembers"), ownerId: v.optional(v.id("users")), slot: v.optional(v.string()) },
  handler: async (ctx, { movieId, castMemberId, ownerId, slot }) => {
    const original = await ctx.db.get(movieId);
    if (!original) throw new Error("Movie not found");
    const member = await ctx.db.get(castMemberId);
    if (!member || member.status !== "ready") throw new Error("Finish your character first");
    await ctx.db.patch(movieId, { remixCount: (original.remixCount ?? 0) + 1 });
    if (ownerId && original.ownerId && original.ownerId !== ownerId) {
      await ctx.db.insert("messages", {
        fromId: ownerId,
        toId: original.ownerId,
        body: `is putting themselves into "${original.story.title}" 🎬`,
        movieId,
      });
    }
    const lead =
      (slot && original.cast.find((c) => c.slot === slot)) ||
      original.cast.find((c) => (c.slot ?? "master") === "master") ||
      original.cast[0];
    const cast = [
      { castMemberId, role: lead?.role ?? "Star", ...(original.reel ? { slot: lead?.slot ?? "master" } : {}) },
      ...original.cast.filter((c) => c !== lead && c.castMemberId !== castMemberId),
    ];
    return await ctx.db.insert("movies", {
      genre: original.genre,
      cast,
      story: original.story,
      ...(original.reel ? { reel: original.reel } : {}),
      status: "draft",
      attempts: 0,
      okToPost: await okToPostFor(ctx, cast.map((c) => c.castMemberId)),
      postedToFeed: false,
      ownerId,
      remixOf: original._id,
    });
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

export const feature = internalMutation({
  args: { movieId: v.id("movies"), posted: v.boolean() },
  handler: async (ctx, { movieId, posted }) => {
    await ctx.db.patch(movieId, { postedToFeed: posted });
  },
});

export const ART_STYLES = ["blocky", "anime2d", "pixel", "clay", "comic"] as const;

export const setArtStyle = mutation({
  args: { movieId: v.id("movies"), artStyle: v.string() },
  handler: async (ctx, { movieId, artStyle }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie || movie.status !== "draft") throw new Error("The look is locked once the cameras roll");
    if (!(ART_STYLES as readonly string[]).includes(artStyle)) throw new Error("Unknown art style");
    await ctx.db.patch(movieId, { artStyle });
  },
});
