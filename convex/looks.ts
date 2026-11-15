import { v, type Infer } from "convex/values";
import library from "../shared/assetLibrary.json";

const { hair_styles, facial_hair, glasses, shirt_styles, accessories } = library.looks;

const oneOf = (values: string[]) => v.union(...values.map((value) => v.literal(value)));

export const lookValidator = v.object({
  skin_tone: v.string(),
  hair_color: v.string(),
  hair_style: oneOf(hair_styles),
  facial_hair: oneOf(facial_hair),
  glasses: oneOf(glasses),
  shirt_color: v.string(),
  shirt_style: oneOf(shirt_styles),
  pants_color: v.string(),
  accessory: oneOf(accessories),
  vibe: v.string(),
});

export type Look = Infer<typeof lookValidator>;

const hex = { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" };

export const lookJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "skin_tone",
    "hair_color",
    "hair_style",
    "facial_hair",
    "glasses",
    "shirt_color",
    "shirt_style",
    "pants_color",
    "accessory",
    "vibe",
  ],
  properties: {
    skin_tone: { ...hex, description: "Skin tone as a hex color" },
    hair_color: { ...hex, description: "Hair color as a hex color" },
    hair_style: { type: "string", enum: hair_styles },
    facial_hair: { type: "string", enum: facial_hair },
    glasses: { type: "string", enum: glasses },
    shirt_color: { ...hex, description: "Main top/shirt color as a hex color" },
    shirt_style: { type: "string", enum: shirt_styles },
    pants_color: { ...hex, description: "Pants color as a hex color; guess a fitting color if not visible" },
    accessory: { type: "string", enum: accessories },
    vibe: { type: "string", description: "One playful, kind sentence (max 12 words) describing their personality vibe for a movie role" },
  },
};
