# Hackathon log

- **Project:** Cast
- **Event:** The Consumer Mobile Hackathon
- **What it does:** Turns a judge into a blocky Roblox-style 3D character from one photo and stars them in a short Blender-rendered movie reel.
- **Live app:** not deployed
- **Repo:** private
- **Frontend:** not deployed
- **Convex deployment:** https://steady-sturgeon-344.convex.cloud
- **Components:** none
- **Convex features:** schema, queries, mutations, Node actions, scheduler, file storage, real-time subscriptions
- **Auth:** none
- **AI models:** gpt-5.4-mini
- **Started:** 2026-11-15T20:07:13Z
- **Last updated:** 2026-11-15T20:25:00Z

## Log

### 2026-11-15 - 6b3544a
Created the Expo Router + TypeScript app at the repo root and connected it to Convex with a small items list to prove reads and writes from a cloud iPhone. Added the Revyl project config with a `preview` simulator build profile and turned on Revyl Proof of Changes for pull requests. Convex features: schema, query, mutation (`convex/schema.ts`, `src/app/_layout.tsx`, `.revyl/config.yaml`).

### 2026-11-15 - stage 1 (casting)
Replaced the starter screens with the Cast casting flow: a consent screen that stores the judge's name, an "OK to post" choice, and a timestamped consent record; a camera screen with an "Upload photo" fallback for cloud phones; and an animated blocky character reveal. Photos upload to Convex file storage, a scheduled Node action sends them to gpt-5.4-mini with JSON-schema structured output to get a "look" (colors, hair preset, facial hair, glasses, outfit, accessory, vibe line), handles refusals, and deletes the photo right after. The reveal screen updates in real time from the cast member's status. Convex features: schema, mutations, queries, scheduler, Node action, file storage (`convex/casting.ts`, `convex/lookAi.ts`, `convex/looks.ts`, `src/app/cast/`).
