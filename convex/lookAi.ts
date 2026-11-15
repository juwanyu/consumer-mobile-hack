"use node";

import OpenAI from "openai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { lookJsonSchema, type Look } from "./looks";

export const MODEL = "gpt-5.4-mini";

const INSTRUCTIONS = `You turn a photo of a real person into a blocky Roblox R6-style toy character for a fun movie app.
Describe only visible styling: skin tone, hair color and style, facial hair, glasses, top color and style, pants color, one accessory.
Pick the closest preset for every enum. Use saturated, toy-like hex colors that still match the person.
Never guess or mention age, ethnicity, health, or other sensitive traits. The vibe line must be kind and playful.`;

function friendlyError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) return "The AI key isn't valid. Ask the director to check OPENAI_API_KEY.";
    if (error.status === 429) return "The AI is busy right now. Try again in a few seconds.";
    return "The AI couldn't read that photo. Try another one.";
  }
  return error instanceof Error ? error.message : "Something went wrong reading that photo.";
}

export const extractLook = internalAction({
  args: { castMemberId: v.id("castMembers"), storageId: v.id("_storage") },
  handler: async (ctx, { castMemberId, storageId }) => {
    try {
      const blob = await ctx.storage.get(storageId);
      if (!blob) throw new Error("The photo upload went missing. Try again.");
      const mime = blob.type || "image/jpeg";
      const dataUrl = `data:${mime};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;

      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.responses.create({
        model: MODEL,
        instructions: INSTRUCTIONS,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: "Make this person's blocky character look." },
              { type: "input_image", image_url: dataUrl, detail: "low" },
            ],
          },
        ],
        text: { format: { type: "json_schema", name: "look", strict: true, schema: lookJsonSchema } },
      });

      const refusal = response.output
        .flatMap((item) => (item.type === "message" ? item.content : []))
        .find((part) => part.type === "refusal");
      if (refusal) throw new Error("The AI wouldn't style this photo. Try a clear, front-facing photo of one person.");
      if (response.status !== "completed" || !response.output_text) {
        throw new Error("The AI didn't finish the look. Try again.");
      }

      const look = JSON.parse(response.output_text) as Look;
      await ctx.runMutation(internal.casting.setLook, { castMemberId, look });
    } catch (error) {
      await ctx.runMutation(internal.casting.setFailed, { castMemberId, error: friendlyError(error) });
    } finally {
      await ctx.storage.delete(storageId);
      await ctx.runMutation(internal.casting.markPhotoDeleted, { castMemberId });
    }
  },
});
