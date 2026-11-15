import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexClient } from "convex/browser";
import { anyApi } from "convex/server";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const file of [".env.local", ".env"]) {
  if (existsSync(join(root, file))) process.loadEnvFile(join(root, file));
}

const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
const SECRET = process.env.WORKER_SECRET;
const BLENDER = process.env.BLENDER_PATH ?? "/Applications/Blender.app/Contents/MacOS/Blender";
const QUALITY = process.env.RENDER_QUALITY ?? "draft";
const LOCAL_ATTEMPTS = 2;
const workerId = `${hostname()}-${process.pid}`;

if (!CONVEX_URL || !SECRET) {
  console.error("Missing EXPO_PUBLIC_CONVEX_URL or WORKER_SECRET. Put them in .env.local at the repo root.");
  process.exit(1);
}
if (!existsSync(BLENDER)) {
  console.error(`Blender not found at ${BLENDER}. Set BLENDER_PATH.`);
  process.exit(1);
}

const api = anyApi;
const client = new ConvexClient(CONVEX_URL);
const log = (...args: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...args);

type Plan = {
  cast?: Array<{ id: string; name: string }>;
  shots?: Array<{ narration?: { audio_url?: string | null; audio_path?: string | null } | null }>;
};
type Progress = { stage?: string; shot?: number; of?: number; pct?: number };

function labelFor(p: Progress, plan: Plan) {
  const lead = plan.cast?.[0]?.name ?? "the star";
  switch (p.stage) {
    case "building_set":
      return "Building the set…";
    case "rigging":
      return `Rigging ${lead}…`;
    case "rendering":
      return p.shot && p.of ? `Rendering shot ${p.shot}/${p.of}…` : "Rendering…";
    case "encoding":
    case "audio":
      return "Mixing the soundtrack…";
    default:
      return "Rolling…";
  }
}

function runBlender(planPath: string, outPath: string, onProgress: (p: Progress) => void) {
  return new Promise<void>((resolvePromise, reject) => {
    const script = join(root, "blender", "render_shot_plan.py");
    const child = spawn(BLENDER, ["-b", "--factory-startup", "-P", script, "--", planPath, outPath, "--quality", QUALITY], { cwd: root });
    let tail = "";
    let buffer = "";
    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-4000);
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const match = line.match(/PROGRESS (\{.*\})/);
        if (!match) continue;
        try {
          onProgress(JSON.parse(match[1]) as Progress);
        } catch {}
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && existsSync(outPath)) resolvePromise();
      else reject(new Error(`Blender exited with code ${code}. Last output:\n${tail.split("\n").slice(-15).join("\n")}`));
    });
  });
}

async function render(movieId: string, plan: Plan) {
  const dir = join(tmpdir(), "cast-renders", movieId);
  await mkdir(dir, { recursive: true });
  const planPath = join(dir, "plan.json");
  const outPath = join(dir, "out.mp4");
  for (const [i, shot] of (plan.shots ?? []).entries()) {
    const url = shot.narration?.audio_url;
    if (!url || !shot.narration) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const audioPath = join(dir, `narration${i + 1}.mp3`);
      await writeFile(audioPath, Buffer.from(await res.arrayBuffer()));
      shot.narration.audio_path = audioPath;
    } catch (error) {
      log(`narration ${i + 1} download failed, rendering without it:`, error instanceof Error ? error.message : error);
    }
  }
  await writeFile(planPath, JSON.stringify(plan, null, 2));

  let lastSent = 0;
  let lastLabel = "";
  const started = Date.now();
  await runBlender(planPath, outPath, (p) => {
    const label = labelFor(p, plan);
    const now = Date.now();
    if (label === lastLabel && now - lastSent < 700) return;
    lastSent = now;
    lastLabel = label;
    void client.mutation(api.worker.progress, { secret: SECRET, movieId, label, pct: Math.min(95, p.pct ?? 0) }).catch(() => {});
  });
  log(`rendered ${movieId} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  await client.mutation(api.worker.progress, { secret: SECRET, movieId, label: "Rolling out the red carpet…", pct: 97 });
  const uploadUrl: string = await client.mutation(api.worker.generateUploadUrl, { secret: SECRET });
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: await readFile(outPath) });
  if (!res.ok) throw new Error(`Upload failed with HTTP ${res.status}`);
  const { storageId } = (await res.json()) as { storageId: string };
  await client.mutation(api.worker.complete, { secret: SECRET, movieId, storageId });
  await rm(dir, { recursive: true, force: true });
}

let busy = false;
let pending: string[] = [];

async function drain() {
  if (busy) return;
  busy = true;
  try {
    while (pending.length) {
      const movieId = pending.shift()!;
      const claim = await client.mutation(api.worker.claim, { secret: SECRET, movieId, workerId });
      if (!claim) continue;
      log(`claimed ${movieId}`);
      let lastError: unknown;
      for (let attempt = 1; attempt <= LOCAL_ATTEMPTS; attempt++) {
        try {
          await render(movieId, claim.plan as Plan);
          log(`done ${movieId}`);
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          log(`attempt ${attempt} failed for ${movieId}:`, error instanceof Error ? error.message : error);
          if (attempt < LOCAL_ATTEMPTS) {
            await client.mutation(api.worker.progress, { secret: SECRET, movieId, label: "Retake! Rolling again…", pct: 0 }).catch(() => {});
          }
        }
      }
      if (lastError) {
        await client.mutation(api.worker.fail, {
          secret: SECRET,
          movieId,
          error: "The render crashed twice. Tap Try again, or tweak the story and roll again.",
        });
      }
    }
  } finally {
    busy = false;
  }
}

log(`Cast render worker ${workerId} watching ${CONVEX_URL} (Blender: ${BLENDER}, quality: ${QUALITY})`);
client.onUpdate(
  api.worker.queue,
  { secret: SECRET },
  (ids: string[]) => {
    pending = ids;
    void drain().then(() => {
      if (pending.length) void drain();
    });
  },
  (error: Error) => {
    console.error("Queue subscription failed:", error.message);
  },
);
