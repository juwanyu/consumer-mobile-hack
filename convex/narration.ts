"use node";

import OpenAI from "openai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

type Plan = {
  genre?: string;
  voice?: { name: string; speed?: number };
  shots: Array<{ narration: { text: string; audio_url: string | null } | null }>;
};

const NBA_STYLE =
  "You are a loud, electric NBA play-by-play announcer calling a game-winning moment live. Real human energy, fast pace, rising excitement, crowd-pumping. Yell the big moments. Stretch out HEYYYY like a hype man. Never sound flat or robotic.";
const TRAILER_STYLE =
  "You are a hyped-up, natural hype-man narrator calling an epic moment for your friends. Real human energy, fast pace, big emphasis, excitement building every line. Shout the big beats. Never sound flat or robotic.";

export const voice = internalAction({
  args: { movieId: v.id("movies"), plan: v.any() },
  handler: async (ctx, { movieId, plan }) => {
    const typed = plan as Plan;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    let voiced = 0;
    await Promise.all(
      typed.shots.map(async (shot, i) => {
        if (!shot.narration?.text) return;
        try {
          const text = shot.narration.text;
          const speech = await client.audio.speech
            .create({
              model: "gpt-4o-mini-tts",
              voice: "ash",
              input: text,
              instructions: typed.genre === "nba" ? NBA_STYLE : TRAILER_STYLE,
              response_format: "mp3",
            })
            .catch(() =>
              client.audio.speech.create({
                model: "tts-1-hd",
                voice: (typed.voice?.name ?? "onyx") as "onyx",
                input: text,
                speed: typed.voice?.speed ?? 1.25,
                response_format: "mp3",
              }),
            );
          const storageId = await ctx.storage.store(new Blob([await speech.arrayBuffer()], { type: "audio/mpeg" }));
          shot.narration.audio_url = await ctx.storage.getUrl(storageId);
          voiced++;
        } catch (error) {
          console.error(`Narration for shot ${i + 1} failed`, error);
        }
      }),
    );
    await ctx.runMutation(internal.movies.queueVoiced, { movieId, plan: typed, voiced });
  },
});
