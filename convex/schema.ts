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
    cast: v.array(v.object({ castMemberId: v.id("castMembers"), role: v.string(), slot: v.optional(v.string()) })),
    story: storyValidator,
    reel: v.optional(
      v.object({
        templateId: v.string(),
        beats: v.array(v.object({ caption: v.string(), narration: v.string() })),
      }),
    ),
    status: v.union(
      v.literal("draft"),
      v.literal("voicing"),
      v.literal("queued"),
      v.literal("rendering"),
      v.literal("done"),
      v.literal("failed"),
    ),
    plan: v.optional(v.any()),
    progress: v.optional(v.object({ label: v.string(), pct: v.number() })),
    stages: v.optional(v.array(v.string())),
    previews: v.optional(v.array(v.object({ shot: v.number(), storageId: v.id("_storage") }))),
    ownerId: v.optional(v.id("users")),
    commentCount: v.optional(v.number()),
    shareCount: v.optional(v.number()),
    views: v.optional(v.number()),
    artStyle: v.optional(v.string()),
    remixPrice: v.optional(v.number()),
    whopPlanId: v.optional(v.string()),
    paidRemixes: v.optional(v.number()),
    remixCount: v.optional(v.number()),
    pinnedAt: v.optional(v.number()),
    attempts: v.number(),
    workerId: v.optional(v.string()),
    claimedAt: v.optional(v.number()),
    videoStorageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
    okToPost: v.boolean(),
    postedToFeed: v.boolean(),
    likes: v.optional(v.number()),
    remixOf: v.optional(v.id("movies")),
    recastOf: v.optional(v.id("movies")),
    lockedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_owner", ["ownerId"]),
  users: defineTable({
    deviceKey: v.string(),
    handle: v.string(),
    name: v.string(),
    bio: v.optional(v.string()),
    castMemberId: v.optional(v.id("castMembers")),
    whopUserId: v.optional(v.string()),
    followersOffset: v.optional(v.number()),
    pinnedPeers: v.optional(v.array(v.id("users"))),
  })
    .index("by_device", ["deviceKey"])
    .index("by_handle", ["handle"]),
  follows: defineTable({ followerId: v.id("users"), followeeId: v.id("users") })
    .index("by_follower", ["followerId", "followeeId"])
    .index("by_followee", ["followeeId"]),
  comments: defineTable({
    movieId: v.id("movies"),
    userId: v.id("users"),
    body: v.string(),
    parentId: v.optional(v.id("comments")),
    likes: v.optional(v.number()),
    pinned: v.optional(v.boolean()),
    at: v.optional(v.number()),
  }).index("by_movie", ["movieId"]),
  commentLikes: defineTable({ commentId: v.id("comments"), userId: v.id("users") }).index("by_comment_user", ["commentId", "userId"]),
  messages: defineTable({
    fromId: v.id("users"),
    toId: v.id("users"),
    body: v.string(),
    movieId: v.optional(v.id("movies")),
    readAt: v.optional(v.number()),
  })
    .index("by_to", ["toId"])
    .index("by_from", ["fromId"]),
  groups: defineTable({
    name: v.string(),
    memberIds: v.array(v.id("users")),
    createdBy: v.id("users"),
    lastAt: v.number(),
  }),
  groupMessages: defineTable({
    groupId: v.id("groups"),
    fromId: v.id("users"),
    body: v.string(),
    movieId: v.optional(v.id("movies")),
  }).index("by_group", ["groupId"]),
  groupReads: defineTable({ groupId: v.id("groups"), userId: v.id("users"), readAt: v.number() }).index("by_group_user", ["groupId", "userId"]),
  crews: defineTable({
    slug: v.string(),
    name: v.string(),
    emoji: v.string(),
    blurb: v.string(),
    whopChannelId: v.optional(v.string()),
    syncedAt: v.optional(v.number()),
    memberBase: v.optional(v.number()),
    accent: v.optional(v.string()),
    coverMovieId: v.optional(v.id("movies")),
    challenge: v.optional(v.object({ title: v.string(), prize: v.string(), endsAt: v.number() })),
    whop: v.optional(v.boolean()),
    premium: v.optional(v.object({ label: v.string(), price: v.string(), url: v.string() })),
    rank: v.optional(v.number()),
  }).index("by_slug", ["slug"]),
  remixLicenses: defineTable({
    movieId: v.id("movies"),
    userId: v.id("users"),
    source: v.union(v.literal("whop"), v.literal("demo")),
    paymentId: v.optional(v.string()),
    amount: v.number(),
  })
    .index("by_movie_user", ["movieId", "userId"])
    .index("by_payment", ["paymentId"]),
  presence: defineTable({ movieId: v.id("movies"), userId: v.id("users"), beat: v.number(), at: v.number() }).index("by_movie_user", ["movieId", "userId"]),
  coops: defineTable({
    crewId: v.id("crews"),
    templateId: v.string(),
    title: v.string(),
    createdBy: v.id("users"),
    status: v.union(v.literal("lobby"), v.literal("rolling"), v.literal("done")),
    movieId: v.optional(v.id("movies")),
    slots: v.array(
      v.object({
        id: v.string(),
        role: v.string(),
        emoji: v.string(),
        userId: v.optional(v.id("users")),
        claimedAt: v.optional(v.number()),
        editingAt: v.optional(v.number()),
        beats: v.array(v.number()),
      }),
    ),
    lines: v.array(v.string()),
    draftId: v.optional(v.id("movies")),
  })
    .index("by_crew", ["crewId"])
    .index("by_status", ["status"]),
  crewMembers: defineTable({ crewId: v.id("crews"), userId: v.id("users") })
    .index("by_crew", ["crewId", "userId"])
    .index("by_user", ["userId"]),
  crewPosts: defineTable({
    crewId: v.id("crews"),
    userId: v.optional(v.id("users")),
    authorName: v.string(),
    body: v.string(),
    movieId: v.optional(v.id("movies")),
    whopMessageId: v.optional(v.string()),
    source: v.union(v.literal("cast"), v.literal("whop")),
  })
    .index("by_crew", ["crewId"])
    .index("by_whop_id", ["whopMessageId"]),
  directorMessages: defineTable({
    movieId: v.id("movies"),
    userId: v.optional(v.id("users")),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    changes: v.optional(v.any()),
    cut: v.optional(v.any()),
  }).index("by_movie", ["movieId"]),
});
