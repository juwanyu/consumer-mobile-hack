import library from "../shared/assetLibrary.json";

export type SlotId = "master" | "caster";
export type BeatCharacter = { slot: SlotId | "npc:saber"; mark: string; action: string };
export type Beat = {
  location: string;
  fx: string;
  camera: { mark: string; move: string };
  duration: number;
  characters: BeatCharacter[];
  hud: { label: string; value: string }[];
  caption: string;
  narration: string;
};
export type ReelTemplate = {
  id: string;
  label: string;
  emoji: string;
  genre: string;
  title: string;
  logline: string;
  voice: string;
  voiceSpeed: number;
  slots: { id: SlotId; role: string; required: boolean }[];
  beats: Beat[];
};

export const REEL_TEMPLATES: Record<string, ReelTemplate> = {
  fate: {
    id: "fate",
    label: "Fate/Ship Night",
    emoji: "⚔️",
    genre: "fate",
    title: "FATE/SHIP NIGHT",
    logline: "Unlimited Build Works · powered by Capy",
    voice: "onyx",
    voiceSpeed: 1.25,
    slots: [
      { id: "master", role: "Master", required: true },
      { id: "caster", role: "Caster", required: false },
    ],
    beats: [
      {
        location: "summoning_room",
        fx: "magic_circle",
        camera: { mark: "wide", move: "push_in" },
        duration: 2.8,
        characters: [{ slot: "master", mark: "center", action: "summon" }],
        hud: [{ label: "COMMAND SEALS", value: "3" }],
        caption: "The Holy Grail War starts at six.",
        narration: "The Grail War starts at six. {master} opens Capy.",
      },
      {
        location: "summoning_room",
        fx: "flash",
        camera: { mark: "low_angle", move: "dolly_in" },
        duration: 3,
        characters: [
          { slot: "npc:saber", mark: "center", action: "jump" },
          { slot: "master", mark: "left", action: "scared" },
        ],
        hud: [{ label: "COMMAND SEALS", value: "3" }],
        caption: "“I ask of you… are you my Master?”",
        narration: "A blade. A light. I ask of you... are you my Master?",
      },
      {
        location: "rooftop",
        fx: "sparkles",
        camera: { mark: "medium", move: "orbit" },
        duration: 2.6,
        characters: [{ slot: "caster", mark: "center", action: "film" }],
        hud: [{ label: "SERVANTS", value: "2" }],
        caption: "{caster}. Caster class.",
        narration: "{caster}. Caster class. His Noble Phantasm? A camera.",
      },
      {
        location: "main_street",
        fx: "speed_lines",
        camera: { mark: "closeup", move: "push_in" },
        duration: 2.4,
        characters: [{ slot: "master", mark: "center", action: "point" }],
        hud: [
          { label: "COMMAND SEALS", value: "2" },
          { label: "CAPY AGENTS", value: "1" },
        ],
        caption: "First seal: ship it by six.",
        narration: "First Command Seal. Ship it by six.",
      },
      {
        location: "casino",
        fx: "speed_lines",
        camera: { mark: "wide", move: "pan" },
        duration: 2.6,
        characters: [
          { slot: "npc:saber", mark: "left", action: "slash" },
          { slot: "caster", mark: "right", action: "film" },
          { slot: "master", mark: "center", action: "run" },
        ],
        hud: [
          { label: "COMMAND SEALS", value: "1" },
          { label: "CAPY AGENTS", value: "8" },
        ],
        caption: "Capy codes. Revyl proves. Convex holds.",
        narration: "Capy writes the code. Revyl proves it. Convex holds the line.",
      },
      {
        location: "rooftop",
        fx: "excalibur",
        camera: { mark: "low_angle", move: "shake" },
        duration: 3,
        characters: [
          { slot: "npc:saber", mark: "center", action: "slash" },
          { slot: "master", mark: "left", action: "celebrate" },
          { slot: "caster", mark: "right", action: "film" },
        ],
        hud: [
          { label: "COMMAND SEALS", value: "0" },
          { label: "SHIPPED", value: "1" },
          { label: "CAPY AGENTS", value: "8" },
        ],
        caption: "EXCALIBUR!",
        narration: "Last seal. Saber... EXCALIBUR!",
      },
    ],
  },
};

export const NPCS = library.npcs;

export function fillNames(text: string, names: Partial<Record<SlotId, string>>) {
  return text.replace(/\{(master|caster)\}/g, (_, slot: SlotId) => names[slot] ?? "");
}
