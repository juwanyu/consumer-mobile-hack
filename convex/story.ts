import { v, type Infer } from "convex/values";
import library from "../shared/assetLibrary.json";
import type { Look } from "./looks";

export const shotValidator = v.object({
  location: v.string(),
  action: v.string(),
  cameraMark: v.string(),
  cameraMove: v.string(),
  dialogue: v.string(),
});

export const storyValidator = v.object({
  title: v.string(),
  logline: v.string(),
  shots: v.array(shotValidator),
});

export type Story = Infer<typeof storyValidator>;
export type Shot = Infer<typeof shotValidator>;
export type GenreId = keyof typeof library.genres;

const pick = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

export const LOCATIONS = Object.keys(library.locations);
export const MAX_SHOTS = library.render.max_shots;

export function isGenre(genre: string): genre is GenreId {
  return genre in library.genres;
}

const TEMPLATE_ACTIONS = ["sneak", "point", "celebrate"];
const TEMPLATE_CAMERAS: Array<[string, string]> = [
  ["wide", "dolly_in"],
  ["closeup", "push_in"],
  ["low_angle", "orbit"],
];

export function templateStory(genre: GenreId): Story {
  const g = library.genres[genre];
  return {
    title: `Untitled ${g.label}`,
    logline: "The director sets the story.",
    shots: g.default_locations.slice(0, MAX_SHOTS).map((location, i) => ({
      location,
      action: TEMPLATE_ACTIONS[i] ?? "idle",
      cameraMark: TEMPLATE_CAMERAS[i]?.[0] ?? "wide",
      cameraMove: TEMPLATE_CAMERAS[i]?.[1] ?? "static",
      dialogue: "",
    })),
  };
}

export function cleanStory(story: Story): Story {
  return {
    title: story.title.trim().slice(0, 60) || "Untitled",
    logline: story.logline.trim().slice(0, 140),
    shots: story.shots.slice(0, MAX_SHOTS).map((shot) => ({
      location: pick(shot.location, LOCATIONS, "main_street"),
      action: pick(shot.action, library.actions, "idle"),
      cameraMark: pick(shot.cameraMark, library.camera_marks, "medium"),
      cameraMove: pick(shot.cameraMove, library.camera_moves, "static"),
      dialogue: shot.dialogue.trim().slice(0, 90),
    })),
  };
}

export type PlanCast = { id: string; name: string; role: string; look: Look };

export function buildShotPlan(genre: string, story: Story, cast: PlanCast[]) {
  const clean = cleanStory(story);
  const lead = cast[0];
  const marks = library.character_marks;
  return {
    version: 1,
    quality: "draft" as const,
    genre,
    title: clean.title,
    logline: clean.logline,
    cast,
    shots: clean.shots.map((shot) => ({
      location: shot.location,
      camera: { mark: shot.cameraMark, move: shot.cameraMove },
      characters: cast.map((member, i) => ({
        cast_id: member.id,
        mark: cast.length === 1 ? "center" : marks[i % marks.length],
        action: i === 0 ? shot.action : "idle",
      })),
      dialogue: shot.dialogue && lead ? { speaker_cast_id: lead.id, text: shot.dialogue } : null,
    })),
  };
}
