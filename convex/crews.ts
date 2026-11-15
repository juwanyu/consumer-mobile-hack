import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { ownerCard } from "./movies";
import { reelPreview } from "./social";

const WHOP_API = process.env.WHOP_API_BASE ?? "https://api.whop.com/api/v1";

const SEED = [
  { slug: "anime-club", name: "Anime Club", emoji: "⚔️", blurb: "Fate, Ghibli, shonen. Cast yourself into the opening." },
  { slug: "hackathon", name: "Consumer Mobile Hack", emoji: "🛠️", blurb: "Everyone building at YC today. Post your demo reel." },
  { slug: "film-nerds", name: "Film Nerds", emoji: "🎥", blurb: "Heists, westerns, rom-coms. Remix the classics." },
];

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const c of SEED) {
      const existing = await ctx.db
        .query("crews")
        .withIndex("by_slug", (q) => q.eq("slug", c.slug))
        .first();
      if (!existing) await ctx.db.insert("crews", c);
    }
  },
});

export const setWhopChannel = internalMutation({
  args: { slug: v.string(), channelId: v.string() },
  handler: async (ctx, { slug, channelId }) => {
    const crew = await ctx.db
      .query("crews")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!crew) throw new Error("No crew " + slug);
    await ctx.db.patch(crew._id, { whopChannelId: channelId });
  },
});

async function thumb(ctx: QueryCtx, movie: Doc<"movies"> | null) {
  const previews = movie?.previews ?? [];
  const pick = previews[Math.floor(previews.length / 2)];
  return pick ? await ctx.storage.getUrl(pick.storageId) : null;
}

async function crewCard(ctx: QueryCtx, crew: Doc<"crews">, userId?: Id<"users">) {
  const members = await ctx.db
    .query("crewMembers")
    .withIndex("by_crew", (q) => q.eq("crewId", crew._id))
    .collect();
  const faces = (await Promise.all(members.slice(0, 5).map((m) => ownerCard(ctx, m.userId)))).filter((f) => f !== null);
  const live = await ctx.db
    .query("coops")
    .withIndex("by_crew", (q) => q.eq("crewId", crew._id))
    .filter((q) => q.eq(q.field("status"), "lobby"))
    .first();
  return {
    _id: crew._id,
    slug: crew.slug,
    name: crew.name,
    emoji: crew.emoji,
    blurb: crew.blurb,
    accent: crew.accent ?? "#FFD23F",
    onWhop: !!crew.whopChannelId,
    whop: !!crew.whop || !!crew.whopChannelId,
    premium: crew.premium ?? null,
    challenge: crew.challenge ?? null,
    members: members.length + (crew.memberBase ?? 0),
    faces,
    joined: !!userId && members.some((m) => m.userId === userId),
    cover: await thumb(ctx, crew.coverMovieId ? await ctx.db.get(crew.coverMovieId) : null),
    liveCoopId: live?._id ?? null,
    rank: crew.rank ?? 99,
  };
}

export const list = query({
  args: { userId: v.optional(v.id("users")) },
  handler: async (ctx, { userId }) => {
    const crews = await ctx.db.query("crews").collect();
    const cards = await Promise.all(crews.map((crew) => crewCard(ctx, crew, userId)));
    return cards.sort((x, y) => x.rank - y.rank);
  },
});

export const get = query({
  args: { slug: v.string(), userId: v.optional(v.id("users")) },
  handler: async (ctx, { slug, userId }) => {
    const crew = await ctx.db
      .query("crews")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!crew) return null;
    const posts = await ctx.db
      .query("crewPosts")
      .withIndex("by_crew", (q) => q.eq("crewId", crew._id))
      .order("desc")
      .take(120);
    const seen = new Set<string>();
    const wall = [];
    for (const p of posts) {
      if (!p.movieId || seen.has(p.movieId)) continue;
      seen.add(p.movieId);
      const movie = await ctx.db.get(p.movieId);
      if (!movie || movie.status !== "done") continue;
      const thumbnailUrl = await thumb(ctx, movie);
      if (!thumbnailUrl) continue;
      wall.push({ _id: movie._id, title: movie.story.title, likes: movie.likes ?? 0, views: movie.views ?? (movie.likes ?? 0) * 23 + 412, thumbnailUrl });
    }
    return {
      ...(await crewCard(ctx, crew, userId)),
      wall,
      posts: await Promise.all(
        posts
          .slice(0, 80)
          .reverse()
          .map(async (p) => ({
            _id: p._id,
            body: p.body,
            at: p._creationTime,
            source: p.source,
            mine: !!userId && p.userId === userId,
            author: p.userId ? await ownerCard(ctx, p.userId) : null,
            authorName: p.authorName,
            reel: await reelPreview(ctx, p.movieId),
          })),
      ),
    };
  },
});

export const toggleJoin = mutation({
  args: { crewId: v.id("crews"), userId: v.id("users") },
  handler: async (ctx, { crewId, userId }) => {
    const existing = await ctx.db
      .query("crewMembers")
      .withIndex("by_crew", (q) => q.eq("crewId", crewId).eq("userId", userId))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
      return false;
    }
    await ctx.db.insert("crewMembers", { crewId, userId });
    return true;
  },
});

export const post = mutation({
  args: { crewId: v.id("crews"), userId: v.id("users"), body: v.string(), movieId: v.optional(v.id("movies")) },
  handler: async (ctx, { crewId, userId, body, movieId }) => {
    const user = await ctx.db.get(userId);
    const crew = await ctx.db.get(crewId);
    const text = body.trim().slice(0, 500);
    if (!user || !crew || (!text && !movieId)) return;
    const member = await ctx.db
      .query("crewMembers")
      .withIndex("by_crew", (q) => q.eq("crewId", crewId).eq("userId", userId))
      .first();
    if (!member) await ctx.db.insert("crewMembers", { crewId, userId });
    const postId = await ctx.db.insert("crewPosts", { crewId, userId, authorName: user.name, body: text, movieId, source: "cast" });
    if (movieId) {
      const movie = await ctx.db.get(movieId);
      if (movie) await ctx.db.patch(movieId, { shareCount: (movie.shareCount ?? 0) + 1 });
    }
    if (crew.whopChannelId) await ctx.scheduler.runAfter(0, internal.crews.pushToWhop, { postId });
  },
});

export const postForWhop = internalQuery({
  args: { postId: v.id("crewPosts") },
  handler: async (ctx, { postId }) => {
    const p = await ctx.db.get(postId);
    if (!p) return null;
    const crew = await ctx.db.get(p.crewId);
    const movie = p.movieId ? await ctx.db.get(p.movieId) : null;
    const videoUrl = movie?.videoStorageId ? await ctx.storage.getUrl(movie.videoStorageId) : null;
    return { channelId: crew?.whopChannelId ?? null, authorName: p.authorName, body: p.body, title: movie?.story.title ?? null, videoUrl, movieId: p.movieId ?? null };
  },
});

export const markPushed = internalMutation({
  args: { postId: v.id("crewPosts"), whopMessageId: v.string() },
  handler: async (ctx, { postId, whopMessageId }) => {
    await ctx.db.patch(postId, { whopMessageId });
  },
});

function whopHeaders() {
  const key = process.env.WHOP_API_KEY;
  if (!key) return null;
  return { Authorization: "Bearer " + key, "Content-Type": "application/json" };
}

export const pushToWhop = internalAction({
  args: { postId: v.id("crewPosts") },
  handler: async (ctx, { postId }) => {
    const headers = whopHeaders();
    const p = await ctx.runQuery(internal.crews.postForWhop, { postId });
    if (!headers || !p?.channelId) return;
    const lines = ["**" + p.authorName + "** on Cast"];
    if (p.body) lines.push(p.body);
    if (p.title) lines.push("🎬 *" + p.title + "*" + (p.videoUrl ? "\n" + p.videoUrl : ""));
    if (p.movieId) lines.push("Put yourself in it: consumermobilehack://movie/" + p.movieId + "/premiere");
    const res = await fetch(WHOP_API + "/messages", {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": postId },
      body: JSON.stringify({ channel_id: p.channelId, content: lines.join("\n\n") }),
    });
    if (!res.ok) {
      console.error("Whop send failed", res.status, (await res.text()).slice(0, 300));
      return;
    }
    const json = (await res.json()) as { id?: string };
    if (json.id) await ctx.runMutation(internal.crews.markPushed, { postId, whopMessageId: json.id });
  },
});

export const crewChannel = internalQuery({
  args: { crewId: v.id("crews") },
  handler: async (ctx, { crewId }) => (await ctx.db.get(crewId))?.whopChannelId ?? null,
});

export const importWhop = internalMutation({
  args: {
    crewId: v.id("crews"),
    messages: v.array(v.object({ id: v.string(), author: v.string(), content: v.string() })),
  },
  handler: async (ctx, { crewId, messages }) => {
    let added = 0;
    for (const m of messages) {
      const seen = await ctx.db
        .query("crewPosts")
        .withIndex("by_whop_id", (q) => q.eq("whopMessageId", m.id))
        .first();
      if (seen || !m.content.trim()) continue;
      await ctx.db.insert("crewPosts", { crewId, authorName: m.author, body: m.content.slice(0, 500), whopMessageId: m.id, source: "whop" });
      added++;
    }
    await ctx.db.patch(crewId, { syncedAt: Date.now() });
    return added;
  },
});

export const syncFromWhop = action({
  args: { crewId: v.id("crews") },
  handler: async (ctx, { crewId }): Promise<{ ok: boolean; added: number; reason?: string }> => {
    const headers = whopHeaders();
    const channelId: string | null = await ctx.runQuery(internal.crews.crewChannel, { crewId });
    if (!headers) return { ok: false, added: 0, reason: "no_key" };
    if (!channelId) return { ok: false, added: 0, reason: "no_channel" };
    const res = await fetch(WHOP_API + "/messages?channel_id=" + encodeURIComponent(channelId) + "&last=30", { headers });
    if (!res.ok) return { ok: false, added: 0, reason: "http_" + res.status };
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const messages = (json.data ?? []).map((m) => {
      const user = (m.user ?? m.author ?? {}) as Record<string, unknown>;
      return {
        id: String(m.id),
        author: String(user.name ?? user.username ?? "Whop member"),
        content: String(m.content ?? ""),
      };
    });
    const added: number = await ctx.runMutation(internal.crews.importWhop, { crewId, messages });
    return { ok: true, added };
  },
});
