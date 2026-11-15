import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

function b64(bytes: ArrayBuffer) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

async function sign(secret: Uint8Array, content: string) {
  const key = await crypto.subtle.importKey("raw", secret as Uint8Array<ArrayBuffer>, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(content)));
}

function secretCandidates(raw: string) {
  const out: Uint8Array[] = [new TextEncoder().encode(raw)];
  const stripped = raw.startsWith("whsec_") ? raw.slice(6) : raw;
  try {
    out.unshift(Uint8Array.from(atob(stripped), (c) => c.charCodeAt(0)));
  } catch {
    // not base64
  }
  return out;
}

http.route({
  path: "/whop/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = process.env.WHOP_WEBHOOK_SECRET;
    const id = req.headers.get("webhook-id");
    const ts = req.headers.get("webhook-timestamp");
    const sigs = (req.headers.get("webhook-signature") ?? "").split(" ").map((s) => s.split(",")[1]).filter(Boolean);
    const body = await req.text();
    if (!secret || !id || !ts || !sigs.length) return new Response("unauthorized", { status: 401 });
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 600) return new Response("stale", { status: 401 });
    let ok = false;
    for (const key of secretCandidates(secret)) if (sigs.includes(await sign(key, id + "." + ts + "." + body))) ok = true;
    if (!ok) return new Response("bad signature", { status: 401 });
    const event = JSON.parse(body) as { type?: string; data?: { id?: string; metadata?: Record<string, string> | null; total?: number; subtotal?: number; final_amount?: number } };
    if (event.type === "payment.succeeded") {
      const meta = event.data?.metadata ?? {};
      if (meta.cast_movie_id && meta.cast_user_id && event.data?.id) {
        await ctx.runMutation(internal.remix.recordPayment, {
          movieId: meta.cast_movie_id,
          userId: meta.cast_user_id,
          paymentId: event.data.id,
          amount: Number(event.data.final_amount ?? event.data.total ?? event.data.subtotal ?? 0),
        });
      }
    }
    return new Response("ok");
  }),
});

export default http;
