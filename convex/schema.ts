import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { lookValidator } from "./looks";

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
});
