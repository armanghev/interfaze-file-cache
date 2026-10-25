/**
 * Which header does each SDK version send for "bypass cache", and does the API honor it?
 *
 * Offline (default): builds a client from every published SDK version with all bypass
 * options on, intercepts fetch, and records the outgoing headers. No API key needed.
 *
 * --live: also sends a prompt twice per header variant (prime, then repeat with the
 * header). If the repeat still reports vcache=true, the API ignored that header.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: { live: { type: "boolean", default: false } } });

const versions = ["interfaze-1.0.0", "interfaze-1.0.1", "interfaze-1.0.2", "interfaze"] as const;

const fakeCompletion = {
  id: "chatcmpl-test",
  object: "chat.completion",
  created: 0,
  model: "interfaze-beta",
  choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  vcache: false,
};

const offline: Record<string, Record<string, string>> = {};
for (const pkg of versions) {
  const { version } = (await import(`${pkg}/package.json`, { with: { type: "json" } })).default;
  const { Interfaze } = await import(pkg);
  let sent: Record<string, string> = {};
  const client = new Interfaze({
    apiKey: "sk-offline-check",
    // Every spelling any version has used; each version only reads the one it knows.
    bypassCache: true,
    bypassMoA: true,
    bypassMoe: true,
    fetch: async (_url: string, init: RequestInit) => {
      sent = Object.fromEntries(new Headers(init.headers));
      return new Response(JSON.stringify(fakeCompletion), { headers: { "content-type": "application/json" } });
    },
  } as any);
  await client.chat.completions.create({ messages: [{ role: "user", content: "hi" }] });
  offline[version] = Object.fromEntries(Object.entries(sent).filter(([k]) => /bypass|interfaze/i.test(k)));
}

console.log("Bypass headers sent by each SDK version (bypassCache + bypassMoA/bypassMoe set):\n");
for (const [v, h] of Object.entries(offline)) console.log(`  ${v.padEnd(6)} ${Object.keys(h).join(", ") || "(none)"}`);

const result: Record<string, unknown> = { checked_at: new Date().toISOString(), offline };

if (args.live) {
  const { env } = await import("./lib/env.js");
  const apiKey = env("INTERFAZE_API_KEY");
  const variants = { none: {}, "x-interfaze-bypass-cache": { "x-interfaze-bypass-cache": "true" }, "x-bypass-cache": { "x-bypass-cache": "true" } };
  const live: Record<string, unknown> = {};
  const ask = async (prompt: string, headers: Record<string, string>) => {
    const res = await fetch("https://api.interfaze.ai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...headers },
      body: JSON.stringify({ model: process.env.INTERFAZE_MODEL ?? "interfaze-beta", messages: [{ role: "user", content: prompt }] }),
    });
    const body: any = await res.json();
    if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body)}`);
    return body.vcache as boolean;
  };
  console.log("\nLive: prime with a fresh prompt, then repeat it with each header.\n");
  for (const [name, headers] of Object.entries(variants)) {
    const prompt = `Reply with the single word "ok". (${randomBytes(6).toString("hex")})`;
    const prime = await ask(prompt, {});
    const repeat = await ask(prompt, headers);
    const verdict = name === "none" ? (repeat ? "cache works" : "no hit on repeat?") : repeat ? "IGNORED" : "honored";
    live[name] = { prime_vcache: prime, repeat_vcache: repeat, verdict };
    console.log(`  ${name.padEnd(26)} prime=${prime}  repeat=${repeat}  → ${verdict}`);
  }
  result.live = live;
}

mkdirSync("bench/results", { recursive: true });
writeFileSync("bench/results/header-check.json", JSON.stringify(result, null, 2) + "\n");
console.log("\nWrote bench/results/header-check.json");
