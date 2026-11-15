import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";

export const PRICES = [0, 1, 3, 5];

function whop() {
  const key = process.env.WHOP_API_KEY;
  if (!key || process.env.WHOP_LIVE !== "1") return null;
  const base = process.env.WHOP_ENV === "production" ? "https://api.whop.com/api/v1" : "https://sandbox-api.whop.com/api/v1";
  return {
    base,
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
  };
}

export const access = query({
  args: { movieId: v.id("movies"), userId: v.optional(v.id("users")) },
  handler: async (ctx, { movieId, userId }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie) return null;
    const price = movie.remixPrice ?? 0;
    const owner = !!userId && movie.ownerId === userId;
    const license =
      userId &&
      (await ctx.db
        .query("remixLicenses")
        .withIndex("by_movie_user", (q) => q.eq("movieId", movieId).eq("userId", userId))
        .first());
    return { price, owner, unlocked: price === 0 || owner || !!license, live: !!process.env.WHOP_API_KEY && process.env.WHOP_LIVE === "1" };
  },
});

export const setPrice = mutation({
  args: { movieId: v.id("movies"), userId: v.id("users"), price: v.number() },
  handler: async (ctx, { movieId, userId, price }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie || movie.ownerId !== userId) throw new Error("Only the creator can price remixes");
    if (!PRICES.includes(price)) throw new Error("Pick Free, $1, $3 or $5");
    await ctx.db.patch(movieId, { remixPrice: price, whopPlanId: undefined });
    if (price > 0) await ctx.scheduler.runAfter(0, internal.remix.createPlan, { movieId });
  },
});

export const planInfo = internalQuery({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const m = await ctx.db.get(movieId);
    return m ? { price: m.remixPrice ?? 0, planId: m.whopPlanId ?? null, title: m.story.title } : null;
  },
});

export const savePlan = internalMutation({
  args: { movieId: v.id("movies"), planId: v.string() },
  handler: async (ctx, { movieId, planId }) => {
    await ctx.db.patch(movieId, { whopPlanId: planId });
  },
});

async function createCheckout(api: NonNullable<ReturnType<typeof whop>>, body: Record<string, unknown>) {
  const res = await fetch(api.base + "/checkout_configurations", { method: "POST", headers: api.headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error("Whop " + res.status + ": " + text.slice(0, 300));
  return JSON.parse(text) as { id: string; purchase_url: string; variant?: { id: string } | null };
}

function variantFor(title: string, price: number) {
  return {
    title: ("Remix · " + title).slice(0, 30),
    description: "Put yourself in this Cast reel.",
    billing_type: "one_time",
    initial_price: price,
    currency: "usd",
    unlimited_stock: true,
    ...(process.env.WHOP_PRODUCT_ID ? { product_id: process.env.WHOP_PRODUCT_ID } : {}),
    ...(process.env.WHOP_ACCOUNT_ID ? { account_id: process.env.WHOP_ACCOUNT_ID } : {}),
  };
}

export const createPlan = internalAction({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }): Promise<{ ok: boolean; planId?: string; reason?: string }> => {
    const api = whop();
    if (!api) return { ok: false, reason: "no_key" };
    const info = await ctx.runQuery(internal.remix.planInfo, { movieId });
    if (!info || info.price <= 0) return { ok: false, reason: "free" };
    const config = await createCheckout(api, { mode: "payment", variant: { ...variantFor(info.title, info.price), force_create_new_plan: true } });
    const planId = config.variant?.id;
    if (!planId) return { ok: false, reason: "no_variant" };
    await ctx.runMutation(internal.remix.savePlan, { movieId, planId });
    return { ok: true, planId };
  },
});

export const checkout = action({
  args: { movieId: v.id("movies"), userId: v.id("users") },
  handler: async (ctx, { movieId, userId }): Promise<{ url: string | null; demo: boolean; reason?: string }> => {
    const api = whop();
    const info = await ctx.runQuery(internal.remix.planInfo, { movieId });
    if (!info || info.price <= 0) return { url: null, demo: false, reason: "free" };
    if (!api) return { url: null, demo: true, reason: "no_key" };
    try {
      const metadata = { cast_movie_id: movieId, cast_user_id: userId };
      const redirect_url = process.env.CONVEX_SITE_URL + "/whop/return?movie=" + movieId + "&user=" + userId;
      const body = info.planId
        ? { mode: "payment", variant_id: info.planId, metadata, redirect_url }
        : { mode: "payment", variant: variantFor(info.title, info.price), metadata, redirect_url };
      const config = await createCheckout(api, body);
      if (!info.planId && config.variant?.id) await ctx.runMutation(internal.remix.savePlan, { movieId, planId: config.variant.id });
      return { url: config.purchase_url, demo: false };
    } catch (e) {
      console.error("Whop checkout failed", e instanceof Error ? e.message : e);
      return { url: null, demo: true, reason: "whop_error" };
    }
  },
});

type WhopPayment = {
  id: string;
  status: string;
  metadata?: Record<string, string> | null;
  total?: { amount: string } | number | null;
  usd_total?: { amount: string } | number | null;
};

function dollars(m: WhopPayment["total"]) {
  if (m == null) return 0;
  return typeof m === "number" ? m : Number(m.amount) || 0;
}

export const verify = action({
  args: { movieId: v.string(), userId: v.string() },
  handler: async (ctx, { movieId, userId }): Promise<{ unlocked: boolean; paymentId?: string; reason?: string }> => {
    const api = whop();
    if (!api) return { unlocked: false, reason: "no_key" };
    const mid = await ctx.runQuery(internal.remix.planIdFor, { movieId });
    if (!mid?.planId) return { unlocked: false, reason: "no_plan" };
    const url = api.base + "/payments?status=paid&first=50&variant_id=" + encodeURIComponent(mid.planId);
    const res = await fetch(url, { headers: api.headers });
    const text = await res.text();
    if (!res.ok) {
      console.error("Whop payments lookup failed", res.status, text.slice(0, 300));
      return { unlocked: false, reason: "whop_" + res.status };
    }
    const list = (JSON.parse(text) as { data: WhopPayment[] }).data ?? [];
    const hit = list.find((p) => p.metadata?.cast_movie_id === movieId && p.metadata?.cast_user_id === userId);
    if (!hit) return { unlocked: false, reason: "not_paid" };
    await ctx.runMutation(internal.remix.recordPayment, { movieId, userId, paymentId: hit.id, amount: dollars(hit.usd_total ?? hit.total) });
    return { unlocked: true, paymentId: hit.id };
  },
});

export const planIdFor = internalQuery({
  args: { movieId: v.string() },
  handler: async (ctx, { movieId }) => {
    const id = ctx.db.normalizeId("movies", movieId);
    const m = id && (await ctx.db.get(id));
    return m ? { planId: m.whopPlanId ?? null } : null;
  },
});

export const demoUnlock = mutation({
  args: { movieId: v.id("movies"), userId: v.id("users") },
  handler: async (ctx, { movieId, userId }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie) return;
    const has = await ctx.db
      .query("remixLicenses")
      .withIndex("by_movie_user", (q) => q.eq("movieId", movieId).eq("userId", userId))
      .first();
    if (!has) await ctx.db.insert("remixLicenses", { movieId, userId, source: "demo", amount: movie.remixPrice ?? 0 });
  },
});

export const recordPayment = internalMutation({
  args: { movieId: v.string(), userId: v.string(), paymentId: v.string(), amount: v.number() },
  handler: async (ctx, { movieId, userId, paymentId, amount }) => {
    const mid = ctx.db.normalizeId("movies", movieId);
    const uid = ctx.db.normalizeId("users", userId);
    if (!mid || !uid) return false;
    const seen = await ctx.db
      .query("remixLicenses")
      .withIndex("by_payment", (q) => q.eq("paymentId", paymentId))
      .first();
    if (seen) return true;
    await ctx.db.insert("remixLicenses", { movieId: mid, userId: uid, source: "whop", paymentId, amount });
    return true;
  },
});

export async function earningsFor(ctx: { db: import("./_generated/server").QueryCtx["db"] }, ownerId: Id<"users">) {
  const movies = await ctx.db
    .query("movies")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .collect();
  let dollars = 0;
  let remixes = 0;
  let sponsors = 0;
  for (const m of movies) {
    const price = m.remixPrice ?? 0;
    const real = await ctx.db
      .query("remixLicenses")
      .withIndex("by_movie_user", (q) => q.eq("movieId", m._id))
      .collect();
    sponsors += m.sponsorDollars ?? 0;
    remixes += (m.paidRemixes ?? 0) + real.length;
    dollars += (m.paidRemixes ?? 0) * price + real.reduce((s, r) => s + r.amount, 0);
  }
  return { dollars, remixes, sponsors };
}
