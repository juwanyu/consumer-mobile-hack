import type { Look } from "./looks";
import { fillNames, NPCS, REEL_TEMPLATES, type SlotId } from "./reels";

export type SlotCast = { slot: SlotId; name: string; role: string; look: Look };

export function buildReelPlan(templateId: string, beats: { caption: string; narration: string }[], cast: SlotCast[]) {
  const template = REEL_TEMPLATES[templateId];
  if (!template) throw new Error("Unknown reel template");
  const bySlot = new Map(cast.map((c) => [c.slot, c]));
  const names = Object.fromEntries(cast.map((c) => [c.slot, c.name])) as Partial<Record<SlotId, string>>;
  const saber = NPCS.saber;

  const planCast = [
    ...cast.map((c) => ({ id: c.slot, name: c.name, role: c.role, look: c.look })),
    { id: "npc_saber", name: saber.name, role: saber.role, npc: true, look: saber.look },
  ];

  const shots = template.beats
    .map((beat, i) => {
      const characters = beat.characters
        .filter((ch) => ch.slot === "npc:saber" || bySlot.has(ch.slot as SlotId))
        .map((ch) => ({ cast_id: ch.slot === "npc:saber" ? "npc_saber" : ch.slot, mark: ch.mark, action: ch.action }));
      if (characters.length === 0) return null;
      const edited = beats[i];
      const narration = fillNames(edited?.narration ?? beat.narration, names).trim();
      return {
        location: beat.location,
        duration_s: beat.duration,
        fx: beat.fx,
        camera: beat.camera,
        characters,
        hud: beat.hud,
        caption: fillNames(edited?.caption ?? beat.caption, names).trim(),
        narration: narration ? { text: narration, audio_url: null as string | null, audio_path: null } : null,
        dialogue: null,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return {
    version: 2,
    style: "punchy",
    quality: "draft",
    genre: template.genre,
    title: template.title,
    logline: template.logline,
    voice: { name: template.voice, speed: template.voiceSpeed },
    cast: planCast,
    shots,
  };
}
