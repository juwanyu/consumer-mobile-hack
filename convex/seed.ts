import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Look } from "./looks";

export const person = internalMutation({
  args: { handle: v.string(), name: v.string(), bio: v.optional(v.string()), castMemberId: v.optional(v.id("castMembers")) },
  handler: async (ctx, { handle, name, bio, castMemberId }) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { name, bio, castMemberId });
      return existing._id;
    }
    return await ctx.db.insert("users", { deviceKey: "seed:" + handle, handle, name, bio, castMemberId });
  },
});

export const ownMovie = internalMutation({
  args: { movieId: v.id("movies"), handle: v.string(), likes: v.optional(v.number()) },
  handler: async (ctx, { movieId, handle, likes }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .first();
    if (!user) throw new Error("No user " + handle);
    await ctx.db.patch(movieId, { ownerId: user._id, ...(likes !== undefined ? { likes } : {}) });
  },
});

const L = (o: Partial<Look> & { vibe: string }): Look => ({
  skin_tone: "#E8B98F",
  hair_color: "#1A1A1A",
  hair_style: "short",
  facial_hair: "none",
  glasses: "none",
  shirt_color: "#2B2B2B",
  shirt_style: "tshirt",
  pants_color: "#1D2433",
  accessory: "none",
  ...o,
});

const PARTNERS: Array<{ handle: string; name: string; bio: string; look: Look }> = [
  { handle: "garrytan", name: "Garry Tan", bio: "President & CEO, Y Combinator", look: L({ skin_tone: "#E5B48A", hair_style: "short", shirt_color: "#1E3A5F", shirt_style: "jacket", vibe: "Hypes every founder like it's Demo Day." }) },
  { handle: "jaredfriedman", name: "Jared Friedman", bio: "Group Partner, YC", look: L({ skin_tone: "#F0C8A0", hair_style: "short", hair_color: "#4A3222", glasses: "square", shirt_color: "#3B6EA5", vibe: "Ships code faster than you pitch." }) },
  { handle: "harjtaggar", name: "Harj Taggar", bio: "Managing Partner, YC", look: L({ skin_tone: "#B9825A", hair_style: "short", facial_hair: "stubble", shirt_color: "#222222", vibe: "Calm, sharp, always closing." }) },
  { handle: "michaelseibel", name: "Michael Seibel", bio: "Managing Director, YC", look: L({ skin_tone: "#6B4430", hair_style: "bald", facial_hair: "beard", shirt_color: "#111111", shirt_style: "hoodie", vibe: "Talk to users. Then talk to more users." }) },
  { handle: "daltoncaldwell", name: "Dalton Caldwell", bio: "Managing Director, YC", look: L({ hair_style: "buzz", hair_color: "#6B5440", facial_hair: "beard", glasses: "round", shirt_color: "#556B2F", vibe: "Brutally honest office hours." }) },
  { handle: "dianahu", name: "Diana Hu", bio: "Group Partner, YC", look: L({ skin_tone: "#F1CBA5", hair_style: "long", shirt_color: "#7A1F3D", vibe: "AR wizard who reads every deck." }) },
  { handle: "gustaf", name: "Gustaf Alströmer", bio: "Group Partner, YC", look: L({ skin_tone: "#F4D3B5", hair_style: "short", hair_color: "#C9A46A", shirt_color: "#2E4A62", vibe: "Growth, but make it Swedish." }) },
  { handle: "tomblomfield", name: "Tom Blomfield", bio: "Group Partner, YC", look: L({ skin_tone: "#F3D0B0", hair_style: "short", hair_color: "#5A4030", facial_hair: "stubble", shirt_color: "#E5E5E5", vibe: "Built a bank, now builds founders." }) },
  { handle: "petekoomen", name: "Pete Koomen", bio: "Group Partner, YC", look: L({ skin_tone: "#F0C9A6", hair_style: "short", hair_color: "#3D2B1F", shirt_color: "#4B5563", vibe: "Ships experiments before breakfast." }) },
  { handle: "aaronepstein", name: "Aaron Epstein", bio: "Group Partner, YC", look: L({ skin_tone: "#EDC29C", hair_style: "curly", hair_color: "#2F2015", shirt_color: "#0F766E", vibe: "Creative Market energy, YC focus." }) },
];

const COMMENTS: Record<string, string[]> = {
  garrytan: ["This is the most YC thing I've ever seen 🔥", "Demo this at 6. Not asking."],
  michaelseibel: ["Talk to users. Then let them star in it. 👏"],
  daltoncaldwell: ["Ok the Excalibur beam got me 😂"],
  jaredfriedman: ["The render pipeline on a Mac?? Clean."],
  harjtaggar: ["Retention play is obvious here. Remixes = loops."],
  dianahu: ["Blocky anime me when 😍"],
  justinsun: ["Capy shipped this in a day ⚔️", "Put yourself in it, I dare you"],
  harris: ["Rolling 🎥", "Squire reporting for duty"],
  tomblomfield: ["Sent to my whole batch"],
  gustaf: ["Growth loop: watch → remix → send. 🚀"],
};

async function personWithLook(ctx: MutationCtx, p: { handle: string; name: string; bio: string; look: Look }) {
  let user = await ctx.db
    .query("users")
    .withIndex("by_handle", (q) => q.eq("handle", p.handle))
    .first();
  if (user?.castMemberId) return user._id;
  const consentId = await ctx.db.insert("consents", { name: p.name, okToPost: true, policyVersion: "seed", agreedAt: Date.now() });
  const castMemberId = await ctx.db.insert("castMembers", { name: p.name, consentId, status: "ready", look: p.look });
  if (user) {
    await ctx.db.patch(user._id, { castMemberId, name: p.name, bio: p.bio });
    return user._id;
  }
  return await ctx.db.insert("users", { deviceKey: "seed:" + p.handle, handle: p.handle, name: p.name, bio: p.bio, castMemberId });
}

export const demo = internalMutation({
  args: { meId: v.id("users"), movieIds: v.array(v.id("movies")) },
  handler: async (ctx, { meId, movieIds }) => {
    const me = await ctx.db.get(meId);
    if (!me) throw new Error("no user");
    let castMemberId = me.castMemberId;
    if (!castMemberId) {
      const consentId = await ctx.db.insert("consents", { name: "Justin Yu", okToPost: true, policyVersion: "seed", agreedAt: Date.now() });
      castMemberId = await ctx.db.insert("castMembers", {
        name: "Justin Yu",
        consentId,
        status: "ready",
        look: L({ skin_tone: "#E9BC94", hair_style: "short", hair_color: "#121212", glasses: "square", shirt_color: "#141414", shirt_style: "hoodie", pants_color: "#22252B", vibe: "Black sweater, big ideas, ships at midnight." }),
      });
    }
    const taken = await ctx.db
      .query("users")
      .withIndex("by_handle", (q) => q.eq("handle", "justinyu"))
      .first();
    if (taken && taken._id !== meId) await ctx.db.patch(taken._id, { handle: "justinyu_old" });
    await ctx.db.patch(meId, { name: "Justin Yu", handle: "justinyu", bio: "Building Cast 🎬 Turn yourself into a movie star. Consumer Mobile Hack @ YC", castMemberId });

    const ids: Record<string, Id<"users">> = {};
    for (const p of PARTNERS) ids[p.handle] = await personWithLook(ctx, p);
    for (const h of ["justinsun", "harris"]) {
      const u = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handle", h))
        .first();
      if (u) ids[h] = u._id;
    }
    for (const [handle, id] of Object.entries(ids)) {
      for (const [a, b] of [[id, meId], [meId, id]] as const) {
        if (handle !== "garrytan" && handle !== "justinsun" && handle !== "harris" && a === meId) continue;
        const exists = await ctx.db
          .query("follows")
          .withIndex("by_follower", (q) => q.eq("followerId", a).eq("followeeId", b))
          .first();
        if (!exists) await ctx.db.insert("follows", { followerId: a, followeeId: b });
      }
    }

    const handles = Object.keys(COMMENTS);
    for (const [mi, movieId] of movieIds.entries()) {
      const movie = await ctx.db.get(movieId);
      if (!movie) continue;
      const existing = await ctx.db
        .query("comments")
        .withIndex("by_movie", (q) => q.eq("movieId", movieId))
        .collect();
      let added = 0;
      if (existing.length === 0) {
        for (let k = 0; k < 6; k++) {
          const handle = handles[(mi * 3 + k) % handles.length];
          const userId = ids[handle];
          if (!userId) continue;
          const lines = COMMENTS[handle];
          await ctx.db.insert("comments", { movieId, userId, body: lines[(mi + k) % lines.length] });
          added++;
        }
      }
      await ctx.db.patch(movieId, {
        commentCount: existing.length + added,
        likes: Math.max(movie.likes ?? 0, 180 + mi * 97),
        shareCount: Math.max(movie.shareCount ?? 0, 24 + mi * 11),
        remixCount: Math.max(movie.remixCount ?? 0, 6 + mi * 3),
      });
    }

    const inbox = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("toId", meId))
      .collect();
    if (inbox.length === 0) {
      const featured = movieIds[0];
      if (ids.garrytan) await ctx.db.insert("messages", { fromId: ids.garrytan, toId: meId, body: "Saw Cast in the feed. Can you demo it at 6? 🔥" });
      if (ids.justinsun && featured) await ctx.db.insert("messages", { fromId: ids.justinsun, toId: meId, body: "Put yourself in this one 👀", movieId: featured });
      if (ids.harris) await ctx.db.insert("messages", { fromId: ids.harris, toId: meId, body: "Rendering the castle cut now 🎥" });
    }
    return ids;
  },
});

export const renameCast = internalMutation({
  args: { castMemberId: v.id("castMembers"), name: v.string() },
  handler: async (ctx, { castMemberId, name }) => {
    await ctx.db.patch(castMemberId, { name });
  },
});

export const fixLook = internalMutation({
  args: { castMemberId: v.id("castMembers"), accessory: v.string() },
  handler: async (ctx, { castMemberId, accessory }) => {
    const m = await ctx.db.get(castMemberId);
    if (!m?.look) return;
    await ctx.db.patch(castMemberId, { look: { ...m.look, accessory: accessory as Look["accessory"] } });
  },
});

export const pin = internalMutation({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    await ctx.db.patch(movieId, { pinnedAt: Date.now(), postedToFeed: true });
  },
});

const FANS: Array<[string, string, Partial<Look>]> = [
  ["mayachen", "Maya Chen", { hair_style: "long", shirt_color: "#E4572E", skin_tone: "#F1CBA5" }],
  ["devpatel_", "Dev Patel", { hair_style: "short", skin_tone: "#A86F4C", shirt_color: "#1F7A8C" }],
  ["sofia.r", "Sofia Ramirez", { hair_style: "ponytail", hair_color: "#3B2416", skin_tone: "#D9A47A", shirt_color: "#8E44AD" }],
  ["kenji", "Kenji Watanabe", { hair_style: "spiky", skin_tone: "#EBC8A4", shirt_color: "#222222", shirt_style: "hoodie" }],
  ["amaraobi", "Amara Obi", { hair_style: "afro", skin_tone: "#6B4430", shirt_color: "#F2C14E" }],
  ["noahkim", "Noah Kim", { hair_style: "buzz", skin_tone: "#EBC5A0", glasses: "round", shirt_color: "#2D3047" }],
  ["lena.builds", "Lena Fischer", { hair_style: "bun", hair_color: "#C9A46A", skin_tone: "#F6D9BF", shirt_color: "#3A86FF" }],
  ["omar", "Omar Haddad", { hair_style: "short", facial_hair: "beard", skin_tone: "#C58F64", shirt_color: "#6A994E" }],
  ["priya", "Priya Nair", { hair_style: "long", skin_tone: "#B5835A", shirt_color: "#D62246" }],
  ["tylerships", "Tyler Brooks", { hair_style: "curly", hair_color: "#7B4B2A", skin_tone: "#F1CFAE", accessory: "cap", shirt_color: "#FF7F11" }],
  ["zoe", "Zoe Martin", { hair_style: "ponytail", hair_color: "#E2B13C", skin_tone: "#F7DCC4", shirt_color: "#2EC4B6" }],
  ["marcus.dev", "Marcus Lee", { hair_style: "short", skin_tone: "#8D5B3E", glasses: "square", shirt_color: "#111111" }],
];

const LINES = [
  "yo this reel is insane 🔥",
  "how did you make the castle??",
  "put me in the next one pls",
  "sending this to my whole group chat",
  "the excalibur shot 😭😭",
  "can I remix this with my cofounder",
  "this is going viral",
  "wait the blocky version of you is so accurate",
  "demo at 6? I'll be there",
  "bro the YC army 💀",
  "how long did the render take?",
  "I need this app on TestFlight",
  "Cast is the most fun thing at the hackathon",
  "what's the music track?",
  "do one with my startup next 🙏",
];

export const busy = internalMutation({
  args: { meId: v.id("users"), followers: v.number(), unread: v.number() },
  handler: async (ctx, { meId, followers, unread }) => {
    const handle = async (h: string) =>
      (await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handle", h))
        .first())?._id;
    const garry = await handle("garrytan");
    const jsun = await handle("justinsun");
    const realFollowers = await ctx.db
      .query("follows")
      .withIndex("by_followee", (q) => q.eq("followeeId", meId))
      .collect();
    await ctx.db.patch(meId, {
      followersOffset: Math.max(0, followers - realFollowers.length),
      pinnedPeers: [garry, jsun].filter((x): x is Id<"users"> => !!x),
    });

    const fanIds: Id<"users">[] = [];
    for (const [h, name, look] of FANS) {
      const id = await personWithLook(ctx, { handle: h, name, bio: "", look: L({ ...look, vibe: "Here for the reels." }) });
      fanIds.push(id);
    }

    const incoming = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("toId", meId))
      .collect();
    for (const m of incoming) if (m.readAt) await ctx.db.patch(m._id, { readAt: undefined });
    let count = incoming.length;
    let k = 0;
    while (count < unread) {
      const from = fanIds[k % fanIds.length];
      await ctx.db.insert("messages", { fromId: from, toId: meId, body: LINES[(k * 7) % LINES.length] });
      count++;
      k++;
    }
    if (garry) await ctx.db.insert("messages", { fromId: garry, toId: meId, body: "You're up 3rd at Demo Day. Bring the castle reel ⚔️" });
    if (jsun) await ctx.db.insert("messages", { fromId: jsun, toId: meId, body: "Rendering the castle cut now, Excalibur looks sick 🔥" });

    const movies = await ctx.db
      .query("movies")
      .withIndex("by_status", (q) => q.eq("status", "done"))
      .collect();
    let i = 0;
    for (const m of movies.filter((x) => x.postedToFeed)) {
      const likes = [2847, 1312, 964, 1786, 642, 2210, 517, 1430][i % 8] + ((i * 37) % 90);
      await ctx.db.patch(m._id, { likes, shareCount: Math.round(likes / 9), commentCount: Math.max(m.commentCount ?? 0, 6) });
      i++;
    }
    return { followers, unread: count };
  },
});

export const groupsDemo = internalMutation({
  args: { meId: v.id("users"), fateId: v.id("movies"), otherIds: v.array(v.id("movies")) },
  handler: async (ctx, { meId, fateId, otherIds }) => {
    const u = async (h: string) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_handle", (q) => q.eq("handle", h))
        .first();
      if (!user) throw new Error("missing " + h);
      return user._id;
    };
    const plans: Array<{ name: string; members: string[]; msgs: Array<[string, string, Id<"movies">?]> }> = [
      {
        name: "YC Demo Day",
        members: ["garrytan", "michaelseibel", "dianahu", "jaredfriedman"],
        msgs: [
          ["garrytan", "Order for tonight is up. Cast is 3rd 🎬"],
          ["michaelseibel", "Talk to users. Then let them star in it."],
          ["garrytan", "This is the reel to open with", fateId],
          ["dianahu", "the blocky me better be in the sequel 😂"],
        ],
      },
      {
        name: "Cast crew 🎬",
        members: ["justinsun", "harris"],
        msgs: [
          ["justinsun", "New castle cut is rendering", fateId],
          ["harris", "Squire reporting for duty. Banner is up 🎥"],
          ["justinsun", "Excalibur beam is SICK now ⚔️"],
        ],
      },
      {
        name: "Revyl x Cast",
        members: ["landseer", "justinsun"],
        msgs: [
          ["landseer", "Revyl ran every screen on a real iPhone. All green 🤘"],
          ["landseer", "when's my MTB reel dropping", otherIds[0]],
        ],
      },
      {
        name: "Whop dojo 🥋",
        members: ["lam", "harris"],
        msgs: [
          ["lam", "wax on, wax off 🥋"],
          ["lam", "crew is ready for the karate reel, sending to the Whop community", otherIds[1]],
        ],
      },
    ];
    const made = [];
    for (const p of plans) {
      const existing = (await ctx.db.query("groups").collect()).find((g) => g.name === p.name && g.memberIds.includes(meId));
      if (existing) continue;
      const memberIds = [meId, ...(await Promise.all(p.members.map(u)))];
      const groupId = await ctx.db.insert("groups", { name: p.name, memberIds, createdBy: memberIds[1], lastAt: Date.now() });
      await ctx.db.insert("groupReads", { groupId, userId: meId, readAt: 0 });
      for (const [h, body, movieId] of p.msgs) {
        await ctx.db.insert("groupMessages", { groupId, fromId: await u(h), body, ...(movieId ? { movieId } : {}) });
      }
      made.push(p.name);
    }
    return made;
  },
});

export const requeue = internalMutation({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const m = await ctx.db.get(movieId);
    if (!m?.plan) return;
    await ctx.db.patch(movieId, { status: "queued", attempts: 0, workerId: undefined, previews: [], stages: [], progress: { label: "Queued for a remaster…", pct: 0 } });
  },
});

const GENERIC = [
  "this is so clean 🔥", "how is this rendered on a laptop??", "the blocky version is SO accurate 😂", "need this on the App Store yesterday",
  "ok I'm putting myself in this", "the music goes crazy", "who made the script, this is fire", "remixing this with my cofounder rn",
  "10/10 would watch the sequel", "the camera work 👏", "this app is going to eat", "sending to the group chat", "W reel", "I watched this 6 times",
  "the captions hit so hard", "Cast > every other app at this hackathon", "teach me 🙏", "the timing on the cuts 😮‍💨", "lol the HUD counter",
  "can I be the villain next time", "rendered in Blender?? on a Mac?? in 40s??", "bro this is a movie", "commenting so the algorithm pushes this",
];
const BY_GENRE: Record<string, string[]> = {
  fate: ["EXCALIBUR 😭😭😭", "the YC army storming the castle is diabolical 💀", "Justin as Saber is canon now", "1000 → 0 founders is crazy", "Harris holding the banner like a real squire",
    "the beam sweep 🔥🔥", "Capy castle stays standing", "Grail War but make it Demo Day"],
  mtb: ["tested on a real iPhone via Revyl 🤘", "SEND IT", "the slow-mo air 😮", "stuck the landing", "Revyl riders where you at 🚵"],
  karate: ["wax on wax off 🥋", "the crane kick!!!", "Lam the new karate kid fr", "Whop dojo stand up", "HI-YAH"],
  heist: ["the vault scene 🕶️", "heist society reporting in", "smooth criminal energy"],
  space: ["launch sequence was clean 🚀", "space mission > every sci-fi trailer"],
  kaiju: ["the kaiju stomp 🦖", "city destroyed in 9 seconds lmao"],
};
const CAMEOS: Record<string, Array<[string, string]>> = {
  fate: [["garrytan", "This is the most YC thing I've ever seen 🔥"], ["harris", "Squire reporting for duty 🎥"], ["landseer", "every frame tested on a real iPhone via Revyl 🤘"], ["lam", "Whop dojo approves ⚔️"]],
  mtb: [["landseer", "tested on a real iPhone via Revyl 🤘"], ["garrytan", "Revyl sends it"], ["justinsun", "Capy wrote the trail 😂"]],
  karate: [["lam", "wax on, wax off 🥋 presented by Whop"], ["harris", "the crane kick angle 🎥"], ["garrytan", "Whop with the sponsor W"]],
};

export const commentsDemo = internalMutation({
  args: { movieIds: v.array(v.id("movies")) },
  handler: async (ctx, { movieIds }) => {
    const users = (await ctx.db.query("users").collect()).filter((u) => u.castMemberId && u.name !== "New director");
    const byHandle = new Map(users.map((u) => [u.handle, u._id]));
    let seed = 7;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const out: Record<string, number> = {};
    for (const movieId of movieIds) {
      const movie = await ctx.db.get(movieId);
      if (!movie) continue;
      const old = await ctx.db
        .query("comments")
        .withIndex("by_movie", (q) => q.eq("movieId", movieId))
        .collect();
      for (const c of old) await ctx.db.delete(c._id);
      const genre = movie.reel?.templateId ?? movie.genre;
      const pool = [...(BY_GENRE[genre] ?? []), ...GENERIC];
      const n = 22 + Math.floor(rand() * 16);
      const top: Id<"comments">[] = [];
      let count = 0;
      for (const [h, body] of CAMEOS[genre] ?? [["garrytan", "Demo this at 6 🔥"]]) {
        const userId = byHandle.get(h);
        if (!userId) continue;
        top.push(await ctx.db.insert("comments", { movieId, userId, body, likes: 400 + Math.floor(rand() * 2600) }));
        count++;
      }
      for (let i = 0; count < n; i++) {
        const userId = users[Math.floor(rand() * users.length)]._id;
        const r = rand();
        const likes = r > 0.9 ? 800 + Math.floor(rand() * 2400) : r > 0.6 ? 40 + Math.floor(rand() * 400) : Math.floor(rand() * 30);
        const isReply = top.length > 2 && rand() < 0.3;
        const body = pool[(i * 5 + Math.floor(rand() * pool.length)) % pool.length];
        const id = await ctx.db.insert("comments", {
          movieId,
          userId,
          body,
          likes: isReply ? Math.floor(likes / 4) : likes,
          ...(isReply ? { parentId: top[Math.floor(rand() * Math.min(top.length, 6))] } : {}),
        });
        if (!isReply) top.push(id);
        count++;
      }
      if (movie.ownerId) {
        const pinnedId = await ctx.db.insert("comments", {
          movieId,
          userId: movie.ownerId,
          body: genre === "fate" ? "Made this in a day with Capy. Hit remix and put yourself in the castle ⚔️" : "Hit 🔁 remix and put yourself in this one 🎬",
          likes: 1200 + Math.floor(rand() * 1500),
          pinned: true,
        });
        count++;
        void pinnedId;
      }
      await ctx.db.patch(movieId, { commentCount: count });
      out[movieId] = count;
    }
    return out;
  },
});

export const stats = internalMutation({
  args: {
    movieId: v.id("movies"),
    views: v.optional(v.number()),
    likes: v.optional(v.number()),
    shareCount: v.optional(v.number()),
    commentCount: v.optional(v.number()),
    remixCount: v.optional(v.number()),
  },
  handler: async (ctx, { movieId, ...patch }) => {
    await ctx.db.patch(movieId, patch);
  },
});
