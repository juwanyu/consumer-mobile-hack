import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { ownerCard } from "./movies";
import { REEL_TEMPLATES } from "./reels";

export const COOP_ROLES: Record<string, Array<{ id: string; role: string; emoji: string }>> = {
  fate: [
    { id: "master", role: "Saber", emoji: "⚔️" },
    { id: "caster", role: "Master", emoji: "🔮" },
    { id: "rival", role: "Rival", emoji: "😈" },
    { id: "narrator", role: "Narrator", emoji: "🎙️" },
  ],
  mtb: [
    { id: "master", role: "Rider", emoji: "🚵" },
    { id: "rival", role: "Chase rider", emoji: "🏁" },
    { id: "hype", role: "Hype crew", emoji: "📣" },
    { id: "narrator", role: "Narrator", emoji: "🎙️" },
  ],
  karate: [
    { id: "master", role: "Karate Kid", emoji: "🥋" },
    { id: "rival", role: "Rival", emoji: "😈" },
    { id: "sensei", role: "Sensei", emoji: "🧓" },
    { id: "narrator", role: "Narrator", emoji: "🎙️" },
  ],
};

export function coopSlots(templateId: string) {
  const roles = COOP_ROLES[templateId] ?? COOP_ROLES.fate;
  const beats = REEL_TEMPLATES[templateId]?.beats ?? [];
  return roles.map((r, i) => ({ ...r, beats: beats.map((_, b) => b).filter((b) => b % roles.length === i) }));
}

export function coopLines(templateId: string) {
  return (REEL_TEMPLATES[templateId]?.beats ?? []).map((b) => b.narration);
}

async function shape(ctx: QueryCtx, c: Doc<"coops">, viewerId?: Id<"users">) {
  const template = REEL_TEMPLATES[c.templateId];
  const movie = c.movieId ? await ctx.db.get(c.movieId) : null;
  const previews = movie?.previews ?? [];
  const pick = previews[Math.floor(previews.length / 2)];
  const now = Date.now();
  const slots = await Promise.all(
    c.slots.map(async (s) => ({
      id: s.id,
      role: s.role,
      emoji: s.emoji,
      beats: s.beats,
      player: s.userId ? await ownerCard(ctx, s.userId) : null,
      mine: !!viewerId && s.userId === viewerId,
      editing: !!s.editingAt && now - s.editingAt < 8000,
    })),
  );
  const players = slots.filter((s) => s.player).map((s) => s.player!.name.split(" ")[0]);
  const nameFor = (id: string) => {
    const s = slots.find((x) => x.id === id);
    return s?.player?.name ?? s?.role ?? id;
  };
  const fill = (t: string) => t.replace(/\{(\w+)\}/g, (_, id: string) => nameFor(id));
  return {
    _id: c._id,
    crewId: c.crewId,
    title: c.title,
    templateId: c.templateId,
    templateLabel: template?.label ?? c.templateId,
    emoji: template?.emoji ?? "🎬",
    status: c.status,
    slots,
    lines: c.lines.map(fill),
    captions: (template?.beats ?? []).map((b) => fill(b.caption)),
    filled: slots.filter((s) => s.player).length,
    credits: players.length ? "Starring " + (players.length > 1 ? players.slice(0, -1).join(", ") + " & " + players[players.length - 1] : players[0]) : "",
    movie: movie
      ? {
          _id: movie._id,
          status: movie.status,
          progress: movie.progress ?? null,
          likes: movie.likes ?? 0,
          thumbnailUrl: pick ? await ctx.storage.getUrl(pick.storageId) : null,
        }
      : null,
    createdAt: c._creationTime,
  };
}

export const get = query({
  args: { coopId: v.id("coops"), userId: v.optional(v.id("users")) },
  handler: async (ctx, { coopId, userId }) => {
    const c = await ctx.db.get(coopId);
    if (!c) return null;
    const crew = await ctx.db.get(c.crewId);
    return { ...(await shape(ctx, c, userId)), crew: crew ? { slug: crew.slug, name: crew.name, emoji: crew.emoji } : null };
  },
});

export const forCrew = query({
  args: { crewId: v.id("crews"), userId: v.optional(v.id("users")) },
  handler: async (ctx, { crewId, userId }) => {
    const rows = await ctx.db
      .query("coops")
      .withIndex("by_crew", (q) => q.eq("crewId", crewId))
      .order("desc")
      .take(30);
    return await Promise.all(rows.map((c) => shape(ctx, c, userId)));
  },
});

export const live = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("coops")
      .withIndex("by_status", (q) => q.eq("status", "lobby"))
      .take(20);
    return await Promise.all(
      rows.map(async (c) => {
        const crew = await ctx.db.get(c.crewId);
        const host = await ownerCard(ctx, c.createdBy);
        return {
          _id: c._id,
          title: c.title,
          filled: c.slots.filter((s) => s.userId).length,
          total: c.slots.length,
          host,
          crew: crew ? { slug: crew.slug, name: crew.name, emoji: crew.emoji } : null,
        };
      }),
    );
  },
});

export const start = mutation({
  args: { crewId: v.id("crews"), userId: v.id("users"), templateId: v.string() },
  handler: async (ctx, { crewId, userId, templateId }) => {
    const template = REEL_TEMPLATES[templateId];
    if (!template) throw new Error("Unknown template");
    const slots = coopSlots(templateId);
    slots[0] = { ...slots[0] };
    return await ctx.db.insert("coops", {
      crewId,
      templateId,
      title: template.title,
      createdBy: userId,
      status: "lobby",
      slots: slots.map((s, i) => (i === 0 ? { ...s, userId, claimedAt: Date.now() } : s)),
      lines: coopLines(templateId),
    });
  },
});

export const claim = mutation({
  args: { coopId: v.id("coops"), slot: v.string(), userId: v.id("users") },
  handler: async (ctx, { coopId, slot, userId }) => {
    const c = await ctx.db.get(coopId);
    if (!c || c.status !== "lobby") throw new Error("Casting is closed");
    const target = c.slots.find((s) => s.id === slot);
    if (!target) throw new Error("Unknown role");
    if (target.userId && target.userId !== userId) throw new Error("Someone already claimed that role");
    const slots = c.slots.map((s) => {
      if (s.id === slot) return { ...s, userId, claimedAt: Date.now() };
      if (s.userId === userId) return { ...s, userId: undefined, claimedAt: undefined, editingAt: undefined };
      return s;
    });
    await ctx.db.patch(coopId, { slots });
  },
});

export const leave = mutation({
  args: { coopId: v.id("coops"), userId: v.id("users") },
  handler: async (ctx, { coopId, userId }) => {
    const c = await ctx.db.get(coopId);
    if (!c || c.status !== "lobby") return;
    await ctx.db.patch(coopId, { slots: c.slots.map((s) => (s.userId === userId ? { ...s, userId: undefined, claimedAt: undefined, editingAt: undefined } : s)) });
  },
});

export const typing = mutation({
  args: { coopId: v.id("coops"), userId: v.id("users") },
  handler: async (ctx, { coopId, userId }) => {
    const c = await ctx.db.get(coopId);
    if (!c) return;
    await ctx.db.patch(coopId, { slots: c.slots.map((s) => (s.userId === userId ? { ...s, editingAt: Date.now() } : s)) });
  },
});

export const setLine = mutation({
  args: { coopId: v.id("coops"), userId: v.id("users"), beat: v.number(), text: v.string() },
  handler: async (ctx, { coopId, userId, beat, text }) => {
    const c = await ctx.db.get(coopId);
    if (!c || c.status !== "lobby") throw new Error("Casting is closed");
    const owner = c.slots.find((s) => s.beats.includes(beat));
    if (owner?.userId !== userId) throw new Error("That line belongs to another player");
    const lines = [...c.lines];
    lines[beat] = text.slice(0, 160);
    await ctx.db.patch(coopId, { lines, slots: c.slots.map((s) => (s.userId === userId ? { ...s, editingAt: Date.now() } : s)) });
  },
});

export const roll = mutation({
  args: { coopId: v.id("coops"), userId: v.id("users") },
  handler: async (ctx, { coopId, userId }) => {
    const c = await ctx.db.get(coopId);
    if (!c || c.status !== "lobby") return c?.movieId ?? null;
    if (c.slots.some((s) => !s.userId)) throw new Error("Every role needs a player first");
    const template = REEL_TEMPLATES[c.templateId];
    if (!template) throw new Error("Unknown template");
    const cast = [];
    for (const slotDef of template.slots) {
      const player = c.slots.find((s) => s.id === slotDef.id)?.userId;
      const user = player && (await ctx.db.get(player));
      if (!user?.castMemberId) continue;
      cast.push({ castMemberId: user.castMemberId, role: slotDef.role, slot: slotDef.id });
    }
    if (!cast.length) throw new Error("The lead needs a finished character");
    const movieId = await ctx.db.insert("movies", {
      genre: template.genre,
      cast,
      story: { title: c.title, logline: template.logline, shots: [] },
      reel: { templateId: c.templateId, beats: template.beats.map((b, i) => ({ caption: b.caption, narration: c.lines[i] ?? b.narration })) },
      ownerId: c.createdBy,
      status: "draft",
      attempts: 0,
      okToPost: true,
      postedToFeed: true,
    });
    await ctx.db.patch(coopId, { status: "rolling", movieId });
    const roller = await ctx.db.get(userId);
    await ctx.db.insert("crewPosts", {
      crewId: c.crewId,
      userId,
      authorName: roller?.name ?? "Cast",
      body: "🎬 Co-op reel rolling: " + c.title,
      movieId,
      source: "cast",
    });
    await ctx.scheduler.runAfter(0, api.movies.action, { movieId });
    return movieId;
  },
});
