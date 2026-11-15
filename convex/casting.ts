import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { lookValidator } from "./looks";

export const POLICY_VERSION = "2026-11-15";

export const giveConsent = mutation({
  args: { name: v.string(), okToPost: v.boolean() },
  handler: async (ctx, { name, okToPost }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name is required");
    const consentId = await ctx.db.insert("consents", {
      name: trimmed,
      okToPost,
      policyVersion: POLICY_VERSION,
      agreedAt: Date.now(),
    });
    return await ctx.db.insert("castMembers", {
      name: trimmed,
      consentId,
      status: "awaiting_photo",
    });
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const submitPhoto = mutation({
  args: { castMemberId: v.id("castMembers"), storageId: v.id("_storage") },
  handler: async (ctx, { castMemberId, storageId }) => {
    const member = await ctx.db.get(castMemberId);
    if (!member) {
      await ctx.storage.delete(storageId);
      throw new Error("Cast member not found");
    }
    await ctx.db.patch(castMemberId, { status: "analyzing", error: undefined });
    await ctx.scheduler.runAfter(0, internal.lookAi.extractLook, { castMemberId, storageId });
  },
});

export const get = query({
  args: { castMemberId: v.id("castMembers") },
  handler: async (ctx, { castMemberId }) => {
    const member = await ctx.db.get(castMemberId);
    if (!member) return null;
    const consent = await ctx.db.get(member.consentId);
    return { ...member, okToPost: consent?.okToPost ?? false };
  },
});

export const listReady = query({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db.query("castMembers").order("desc").take(50);
    return members.filter((m) => m.status === "ready");
  },
});

export const setLook = internalMutation({
  args: { castMemberId: v.id("castMembers"), look: lookValidator },
  handler: async (ctx, { castMemberId, look }) => {
    await ctx.db.patch(castMemberId, { status: "ready", look, error: undefined });
  },
});

export const setFailed = internalMutation({
  args: { castMemberId: v.id("castMembers"), error: v.string() },
  handler: async (ctx, { castMemberId, error }) => {
    await ctx.db.patch(castMemberId, { status: "failed", error });
  },
});

export const markPhotoDeleted = internalMutation({
  args: { castMemberId: v.id("castMembers") },
  handler: async (ctx, { castMemberId }) => {
    await ctx.db.patch(castMemberId, { photoDeletedAt: Date.now() });
  },
});
