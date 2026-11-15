import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { lookValidator } from "./looks";
import { storyValidator } from "./story";

export default defineSchema({
  consents: defineTable({
    name: v.string(),
    okToPost: v.boolean(),
    policyVersion: v.string(),
    agreedAt: v.number(),
  }),
  castMembers: defineTable({
    name: v.string(),
    consentId: v.id("consents"),
    status: v.union(
      v.literal("awaiting_photo"),
      v.literal("analyzing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    look: v.optional(lookValidator),
    error: v.optional(v.string()),
    photoDeletedAt: v.optional(v.number()),
  }),
  movies: defineTable({
    genre: v.string(),
    cast: v.array(v.object({ castMemberId: v.id("castMembers"), role: v.string() })),
    story: storyValidator,
    status: v.union(
      v.literal("draft"),
      v.literal("queued"),
      v.literal("rendering"),
      v.literal("done"),
      v.literal("failed"),
    ),
    plan: v.optional(v.any()),
    progress: v.optional(v.object({ label: v.string(), pct: v.number() })),
    attempts: v.number(),
    workerId: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    videoStorageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
    okToPost: v.boolean(),
    postedToFeed: v.boolean(),
    recastOf: v.optional(v.id("movies")),
    lockedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  }).index("by_status", ["status"]),
});
