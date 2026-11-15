import OpenAI from "openai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { buildReelPlan, type ReelCut, type SlotCast } from "./reelPlan";
import { fillNames, REEL_TEMPLATES, type Beat, type BeatCharacter, type SlotId } from "./reels";
import library from "../shared/assetLibrary.json";

const MODEL = "gpt-5.4-mini";
const LOCATIONS = Object.keys(library.locations);
const FX = library.fx.filter((f) => f !== "none");
const CAMERA_MARKS = library.camera_marks;
const CAMERA_MOVES = library.camera_moves;
const MARKS = library.character_marks;
const ACTIONS = library.actions;
const OUTFITS = library.outfits as Record<string, { label: string }>;
const NPCS = library.npcs as Record<string, { name: string }>;
const MAX_SHOTS = library.render.reel_max_shots;
const DURATION = library.render.reel_shot_seconds;
const FIELDS = ["caption", "narration", "location", "fx", "camera", "duration", "characters"];

export type Change = { beat: number; field: string; before: string | null; after: string | null };
type EditOp = {
  op: "update" | "insert" | "delete";
  beat: number;
  caption: string | null;
  narration: string | null;
  location: string | null;
  fx: string[] | null;
  camera_mark: string | null;
  camera_move: string | null;
  duration: number | null;
  characters: { who: string; mark: string; action: string }[] | null;
};
type Output = { edits: EditOp[]; outfits: { slot: string; outfit: string }[]; reply: string };

export async function latestCut(ctx: QueryCtx, movieId: Id<"movies">): Promise<ReelCut | null> {
  const rows = await ctx.db
    .query("directorMessages")
    .withIndex("by_movie", (q) => q.eq("movieId", movieId))
    .order("desc")
    .take(100);
  return (rows.find((r) => r.cut)?.cut as ReelCut | undefined) ?? null;
}

export const messages = query({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const rows = await ctx.db
      .query("directorMessages")
      .withIndex("by_movie", (q) => q.eq("movieId", movieId))
      .order("desc")
      .take(40);
    return rows.reverse().map((r) => ({ _id: r._id, at: r._creationTime, role: r.role, text: r.text, changes: (r.changes ?? []) as Change[] }));
  },
});

export const context = internalQuery({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie?.reel) throw new Error("This movie isn't a reel");
    const cast: { slot: SlotId; name: string; role: string }[] = [];
    for (const c of movie.cast) {
      const member = await ctx.db.get(c.castMemberId);
      cast.push({ slot: (c.slot ?? "master") as SlotId, name: member?.name ?? "Unknown", role: c.role });
    }
    const history = await ctx.db
      .query("directorMessages")
      .withIndex("by_movie", (q) => q.eq("movieId", movieId))
      .order("desc")
      .take(8);
    return {
      status: movie.status,
      ownerId: movie.ownerId ?? null,
      reel: movie.reel,
      cast,
      cut: await latestCut(ctx, movieId),
      history: history.reverse().map((h) => ({ role: h.role, text: h.text })),
    };
  },
});

export const plan = internalQuery({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie?.reel) throw new Error("This movie isn't a reel");
    const slotCast: SlotCast[] = [];
    for (const { castMemberId, role, slot } of movie.cast) {
      const member = await ctx.db.get(castMemberId);
      if (!member?.look) throw new Error(`${member?.name ?? "A cast member"} doesn't have a look yet`);
      slotCast.push({ slot: (slot ?? "master") as SlotId, name: member.name, role, look: member.look });
    }
    return buildReelPlan(movie.reel.templateId, movie.reel.beats, slotCast, await latestCut(ctx, movieId));
  },
});

export const commit = internalMutation({
  args: {
    movieId: v.id("movies"),
    userId: v.optional(v.id("users")),
    prompt: v.string(),
    reply: v.string(),
    changes: v.array(v.object({ beat: v.number(), field: v.string(), before: v.union(v.string(), v.null()), after: v.union(v.string(), v.null()) })),
    cut: v.optional(v.any()),
  },
  handler: async (ctx, { movieId, userId, prompt, reply, changes, cut }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie?.reel || movie.status !== "draft") throw new Error("The reel is locked once the cameras roll");
    await ctx.db.insert("directorMessages", { movieId, userId, role: "user", text: prompt });
    await ctx.db.insert("directorMessages", { movieId, role: "assistant", text: reply, changes, ...(cut ? { cut } : {}) });
    if (cut) {
      const beats = (cut as ReelCut).beats.map((b) => ({ caption: b.caption, narration: b.narration }));
      await ctx.db.patch(movieId, { reel: { ...movie.reel, beats } });
    }
  },
});

export const reset = internalMutation({
  args: { movieId: v.id("movies") },
  handler: async (ctx, { movieId }) => {
    const movie = await ctx.db.get(movieId);
    if (!movie?.reel || movie.status !== "draft") throw new Error("Only draft reels can be reset");
    const template = REEL_TEMPLATES[movie.reel.templateId];
    const rows = await ctx.db
      .query("directorMessages")
      .withIndex("by_movie", (q) => q.eq("movieId", movieId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.patch(movieId, { reel: { ...movie.reel, beats: template.beats.map((b) => ({ caption: b.caption, narration: b.narration })) } });
    return rows.length;
  },
});

const nullable = (schema: object) => ({ anyOf: [schema, { type: "null" }] });
const enumOf = (values: string[]) => ({ type: "string", enum: values });

function outputSchema(who: string[], slots: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["edits", "outfits", "reply"],
    properties: {
      edits: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["op", "beat", "caption", "narration", "location", "fx", "camera_mark", "camera_move", "duration", "characters"],
          properties: {
            op: enumOf(["update", "insert", "delete"]),
            beat: { type: "integer" },
            caption: nullable({ type: "string" }),
            narration: nullable({ type: "string" }),
            location: nullable(enumOf(LOCATIONS)),
            fx: nullable({ type: "array", items: enumOf(FX) }),
            camera_mark: nullable(enumOf(CAMERA_MARKS)),
            camera_move: nullable(enumOf(CAMERA_MOVES)),
            duration: nullable({ type: "number" }),
            characters: nullable({
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["who", "mark", "action"],
                properties: { who: enumOf(who), mark: enumOf(MARKS), action: enumOf(ACTIONS) },
              },
            }),
          },
        },
      },
      outfits: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["slot", "outfit"],
          properties: { slot: enumOf(slots), outfit: enumOf([...Object.keys(OUTFITS), "none"]) },
        },
      },
      reply: { type: "string" },
    },
  };
}

const INSTRUCTIONS = `You are the Director: a hype, witty film director editing a short vertical "punchy" reel made of numbered shots.
The user asks for changes in plain words; you return precise edits plus a one or two sentence reply in a fun director voice.

Edit ops. Beat numbers always refer to the CURRENT numbering shown to you, starting at 1:
- update: change shot N. Set only the fields you change; every other field must be null.
- insert: add a new shot AFTER shot N (0 = at the very start). Null fields copy shot N (or shot 1). Always give it a caption, narration and characters.
- delete: remove shot N. Set every other field to null.

Rules:
- At most ${MAX_SHOTS} shots and at least 1. When the reel is full, an insert replaces a hidden shot, or else the shot N it follows.
- Shots marked hidden are not rendered: never put new lines there. Shot duration is ${DURATION.min}-${DURATION.max} seconds.
- characters replaces the whole list for that shot: each "who" at most once, each mark at most once.
- In caption and narration keep the {master} and {caster} placeholders instead of writing cast names. Captions up to 60 chars, punchy. Narration up to 140 chars, one or two short spoken sentences.
- There is no speed control. Slow-mo means: duration ${DURATION.max}, a slow camera move (push_in or dolly_in), and no speed_lines.
- Dramatic: low_angle or closeup, shake or push_in, fx like flash, shockwave, embers, magic_circle, excalibur.
- Shorter and punchier: delete the weakest shots, trim durations, tighten text.
- Drawing a sword is the raise_sword action (slash for a swing); the excalibur fx is a glowing sword beam.
- outfits: only when the user asks to change a costume; otherwise an empty list.
- Only use values from the enums. If a request is impossible, make the closest edit and say so briefly in the reply.
- If the request is not about the reel, return no edits and a short friendly reply.`;

function describe(field: string, beat: Beat, names: Partial<Record<SlotId, string>>, who: (slot: string) => string): string {
  const location = (library.locations as Record<string, { label: string }>)[beat.location]?.label ?? beat.location;
  switch (field) {
    case "caption":
      return fillNames(beat.caption, names);
    case "narration":
      return fillNames(beat.narration, names);
    case "location":
      return location;
    case "fx":
      return (Array.isArray(beat.fx) ? beat.fx : [beat.fx]).filter((f) => f && f !== "none").join(" + ") || "none";
    case "camera":
      return `${beat.camera.mark} · ${beat.camera.move}`;
    case "duration":
      return `${beat.duration}s`;
    case "characters":
      return beat.characters.map((c) => `${who(c.slot)} ${c.action} (${c.mark})`).join(", ");
    default:
      return `${location} · ${fillNames(beat.caption, names)}`;
  }
}

function cleanCharacters(raw: EditOp["characters"], allowed: string[]): BeatCharacter[] | null {
  if (!raw) return null;
  const out: BeatCharacter[] = [];
  const used = new Set<string>();
  for (const ch of raw) {
    if (!allowed.includes(ch.who) || out.some((c) => c.slot === ch.who)) continue;
    const mark = MARKS.includes(ch.mark) && !used.has(ch.mark) ? ch.mark : MARKS.find((m) => !used.has(m));
    if (!mark) continue;
    used.add(mark);
    out.push({ slot: ch.who as BeatCharacter["slot"], mark, action: ACTIONS.includes(ch.action) ? ch.action : "idle" });
  }
  return out.length ? out : null;
}

function applyFields(beat: Beat, edit: EditOp, allowed: string[]) {
  const next: Beat = structuredClone(beat);
  const caption = edit.caption?.trim().slice(0, 60);
  if (caption) next.caption = caption;
  const narration = edit.narration?.trim().slice(0, 140);
  if (narration) next.narration = narration;
  if (edit.location && LOCATIONS.includes(edit.location)) next.location = edit.location;
  if (edit.fx) next.fx = [...new Set(edit.fx.filter((f) => FX.includes(f)))].slice(0, 4);
  if (edit.camera_mark && CAMERA_MARKS.includes(edit.camera_mark)) next.camera.mark = edit.camera_mark;
  if (edit.camera_move && CAMERA_MOVES.includes(edit.camera_move)) next.camera.move = edit.camera_move;
  if (typeof edit.duration === "number" && Number.isFinite(edit.duration)) {
    next.duration = Math.round(Math.min(DURATION.max, Math.max(DURATION.min, edit.duration)) * 10) / 10;
  }
  const characters = cleanCharacters(edit.characters, allowed);
  if (characters) next.characters = characters;
  return next;
}

export const edit = action({
  args: { movieId: v.id("movies"), userId: v.optional(v.id("users")), prompt: v.string() },
  handler: async (ctx, { movieId, userId, prompt }): Promise<{ reply: string; changes: Change[] }> => {
    const text = prompt.trim().slice(0, 500);
    if (!text) throw new Error("Tell the Director what to change");
    const state = await ctx.runQuery(internal.director.context, { movieId });
    if (state.status !== "draft") throw new Error("The reel is locked once the cameras roll");
    const template = REEL_TEMPLATES[state.reel.templateId];
    if (!template) throw new Error("Unknown reel template");

    const base = state.cut?.beats.length ? state.cut.beats : template.beats;
    const synced = base.length === state.reel.beats.length;
    const original: Beat[] = base.map((b, i) => ({
      ...structuredClone(b),
      ...(synced ? { caption: state.reel.beats[i].caption, narration: state.reel.beats[i].narration } : {}),
    }));
    const outfits: Partial<Record<SlotId, string | null>> = {
      ...Object.fromEntries(template.slots.map((s) => [s.id, s.outfit ?? null])),
      ...state.cut?.outfits,
    };
    const names = Object.fromEntries(state.cast.map((c) => [c.slot, c.name])) as Partial<Record<SlotId, string>>;
    const npcs = [...new Set(template.beats.flatMap((b) => b.characters.map((c) => c.slot as string)))].filter(
      (s) => s.startsWith("npc:") && NPCS[s.slice(4)],
    );
    const slots = state.cast.map((c) => c.slot as string);
    const allowed = [...slots, ...npcs];
    const renders = (b: Beat) => b.characters.some((c) => allowed.includes(c.slot));
    const who = (slot: string) => (slot.startsWith("npc:") ? (NPCS[slot.slice(4)]?.name ?? slot) : (names[slot as SlotId] ?? slot));

    const brief = {
      title: template.title,
      logline: template.logline,
      shot_limit: MAX_SHOTS,
      cast: [
        ...state.cast.map((c) => ({ who: c.slot, placeholder: `{${c.slot}}`, name: c.name, playing: c.role, outfit: outfits[c.slot] ?? "own clothes" })),
        ...npcs.map((n) => ({ who: n, name: who(n), playing: "NPC" })),
      ],
      shots: original.map((b, i) => ({
        shot: i + 1,
        location: b.location,
        fx: Array.isArray(b.fx) ? b.fx : [b.fx],
        camera_mark: b.camera.mark,
        camera_move: b.camera.move,
        duration: b.duration,
        characters: b.characters.filter((c) => allowed.includes(c.slot)).map((c) => ({ who: c.slot, mark: c.mark, action: c.action })),
        caption: b.caption,
        narration: b.narration,
        ...(renders(b) ? {} : { hidden: "Nobody in this cast appears here, so it is cut from the render. Leave it alone unless you give it characters." }),
      })),
    };

    let output: Output;
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.responses.create({
        model: MODEL,
        instructions: INSTRUCTIONS,
        input: [
          ...state.history.map((h) => ({ role: h.role, content: h.text })),
          { role: "user" as const, content: `Current reel:\n${JSON.stringify(brief)}\n\nRequest: ${text}` },
        ],
        text: { format: { type: "json_schema", name: "director_edits", strict: true, schema: outputSchema(allowed, slots) } },
      });
      if (response.status !== "completed" || !response.output_text) throw new Error("incomplete");
      output = JSON.parse(response.output_text) as Output;
    } catch (error) {
      console.error("director.edit", error);
      if (error instanceof OpenAI.APIError && error.status === 429) throw new Error("The Director is swamped. Try again in a few seconds.");
      if (error instanceof OpenAI.APIError && error.status === 401) throw new Error("The AI key isn't valid. Check OPENAI_API_KEY.");
      throw new Error("The Director lost the script. Try again.");
    }

    const updated = [...original];
    for (const e of output.edits) {
      if (e.op === "update" && e.beat >= 1 && e.beat <= updated.length) updated[e.beat - 1] = applyFields(updated[e.beat - 1], e, allowed);
    }
    const records: { ref: Beat | null; beat: number; field: string; before: string | null; after: string | null }[] = [];
    updated.forEach((after, i) => {
      if (after === original[i]) return;
      for (const field of FIELDS) {
        const before = describe(field, original[i], names, who);
        const now = describe(field, after, names, who);
        if (before !== now) records.push({ ref: after, beat: i + 1, field, before, after: now });
      }
    });

    const working = [...updated];
    const deletes = [...new Set(output.edits.filter((e) => e.op === "delete" && e.beat >= 1 && e.beat <= updated.length).map((e) => e.beat))].slice(
      0,
      updated.length - 1,
    );
    let room = MAX_SHOTS - updated.filter((b, i) => renders(b) && !deletes.includes(i + 1)).length;
    const structural = [
      ...output.edits.filter((e) => e.op === "insert" && e.beat >= 0 && e.beat <= updated.length),
      ...deletes.map((beat) => ({ op: "delete", beat }) as EditOp),
    ].sort((a, b) => b.beat - a.beat || (a.op === "insert" ? -1 : 1));
    for (const e of structural) {
      if (e.op === "delete") {
        const target = updated[e.beat - 1];
        working.splice(working.indexOf(target), 1);
        records.push({ ref: null, beat: e.beat, field: "shot", before: describe("shot", target, names, who), after: null });
        continue;
      }
      const parent = updated[Math.max(0, e.beat - 1)];
      if (!working.includes(parent)) continue;
      let at = e.beat === 0 ? 0 : working.indexOf(parent) + 1;
      if (room <= 0) {
        const bumped = working.find((b) => !renders(b)) ?? (e.beat >= 2 ? parent : working[Math.min(at, working.length - 1)]);
        const index = working.indexOf(bumped);
        working.splice(index, 1);
        if (index < at) at -= 1;
        records.push({ ref: null, beat: updated.indexOf(bumped) + 1, field: "shot", before: describe("shot", bumped, names, who), after: null });
      } else {
        room -= 1;
      }
      const shot = applyFields(parent, e, allowed);
      shot.caption = e.caption?.trim().slice(0, 60) ?? "";
      shot.narration = e.narration?.trim().slice(0, 140) ?? "";
      working.splice(at, 0, shot);
      records.push({ ref: shot, beat: e.beat + 1, field: "shot", before: null, after: describe("shot", shot, names, who) });
      for (const field of ["narration", "camera", "characters"]) {
        records.push({ ref: shot, beat: e.beat + 1, field, before: null, after: describe(field, shot, names, who) });
      }
    }

    const nextOutfits = { ...outfits };
    const outfitLabel = (id: string | null | undefined) => (id ? (OUTFITS[id]?.label ?? id) : "own clothes");
    for (const o of output.outfits) {
      if (!slots.includes(o.slot)) continue;
      const slot = o.slot as SlotId;
      const value = OUTFITS[o.outfit] ? o.outfit : null;
      if ((nextOutfits[slot] ?? null) === value) continue;
      records.push({ ref: null, beat: 0, field: `outfit · ${who(slot)}`, before: outfitLabel(nextOutfits[slot]), after: outfitLabel(value) });
      nextOutfits[slot] = value;
    }

    const changes: Change[] = records
      .map(({ ref, beat, field, before, after }) => ({ beat: (ref && working.indexOf(ref) + 1) || beat, field, before, after }))
      .sort((a, b) => a.beat - b.beat);
    const reply = output.reply.trim().slice(0, 400) || (changes.length ? "Done. That's a wrap." : "Nothing to change there.");
    const cut: ReelCut | undefined = changes.length ? { beats: working, outfits: nextOutfits } : undefined;
    await ctx.runMutation(internal.director.commit, { movieId, userId, prompt: text, reply, changes, cut });
    return { reply, changes };
  },
});
