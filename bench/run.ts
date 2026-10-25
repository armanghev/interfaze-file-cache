/**
 * Does Interfaze's cache hit when the same file is sent as base64, vs. as a stable URL?
 *
 * For each sample file, runs the same extraction N times in each mode, in this order:
 *   base64          data: URI, schema A
 *   url             content-addressed public URL, schema A
 *   url-alt         same bytes at a different URL, schema A (is the cache keyed on URL or content?)
 *   url-schemaB     same URL, different schema (is the first pass reused?)
 *   base64-schemaB  data: URI, different schema
 *
 * Usage: npm run bench -- [--runs 5] [--files receipt,invoice] [--no-salt]
 * Writes one JSON line per call to bench/results/<timestamp>.jsonl.
 */
import { readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { Interfaze, inputs, responseFormat } from "interfaze";
import { z } from "zod";
import { env } from "./lib/env.js";
import { fixtures, type Fixture } from "./fixtures.js";
import { r2Store, stableFileUrl } from "../src/index.js";

const { values: args } = parseArgs({
  options: {
    runs: { type: "string", default: "5" },
    files: { type: "string" },
    "no-salt": { type: "boolean", default: false },
    model: { type: "string", default: process.env.INTERFAZE_MODEL ?? "interfaze-beta" },
  },
});
const runs = Number(args.runs);

const client = new Interfaze({ apiKey: env("INTERFAZE_API_KEY") });
const store = r2Store({
  accountId: env("R2_ACCOUNT_ID"),
  bucket: env("R2_BUCKET"),
  accessKeyId: env("R2_ACCESS_KEY_ID"),
  secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
  publicBaseUrl: env("R2_PUBLIC_URL"),
});

const session = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync("bench/results", { recursive: true });
const outPath = `bench/results/${session}.jsonl`;

type Mode = "base64" | "url" | "url-alt" | "url-schemaB" | "base64-schemaB";

/**
 * Appends a few random bytes after the end of the file (after PNG IEND / PDF %%EOF),
 * so every benchmark session starts with bytes Interfaze has never seen. Otherwise
 * run 1 could be a hit left over from an earlier session.
 */
function salted(bytes: Buffer, salt: string): Buffer {
  return args["no-salt"] ? bytes : Buffer.concat([bytes, Buffer.from(`\n%salt:${salt}\n`)]);
}

function part(src: string, f: Fixture) {
  return f.contentType.startsWith("image/") ? inputs.image(src) : inputs.file(src, { filename: f.path.split("/").pop() });
}

function jsonSchema(schema: z.ZodObject): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

async function call(f: Fixture, mode: Mode, run: number, src: string, schema: z.ZodObject, sha256: string) {
  const started = performance.now();
  const base = { session, file: f.name, mode, run, sha256: sha256.slice(0, 12), model: args.model };
  try {
    const { data, response } = await client.chat.completions
      .create({
        model: args.model,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "Extract the fields in the schema from this document." }, part(src, f)],
          },
        ],
        response_format: responseFormat(jsonSchema(schema), `${f.name}_${mode.includes("schemaB") ? "b" : "a"}`),
      })
      .withResponse();
    const latency_ms = Math.round(performance.now() - started);
    const content = data.choices[0]?.message?.content ?? "";
    let valid = false;
    try {
      valid = schema.safeParse(JSON.parse(content)).success;
    } catch {}
    const cacheHeaders = Object.fromEntries([...response.headers].filter(([k]) => /cache|interfaze/i.test(k)));
    const row = {
      ...base,
      vcache: data.vcache ?? null,
      latency_ms,
      prompt_tokens: data.usage?.prompt_tokens ?? null,
      completion_tokens: data.usage?.completion_tokens ?? null,
      total_tokens: data.usage?.total_tokens ?? null,
      valid,
      cacheHeaders,
    };
    appendFileSync(outPath, JSON.stringify(row) + "\n");
    console.log(`${f.name.padEnd(8)} ${mode.padEnd(15)} #${run}  vcache=${String(row.vcache).padEnd(5)} ${String(latency_ms).padStart(6)}ms  tokens=${row.total_tokens}`);
  } catch (err) {
    const row = { ...base, error: err instanceof Error ? err.message : String(err), latency_ms: Math.round(performance.now() - started) };
    appendFileSync(outPath, JSON.stringify(row) + "\n");
    console.log(`${f.name.padEnd(8)} ${mode.padEnd(15)} #${run}  ERROR ${row.error}`);
  }
}

const wanted = args.files?.split(",");
for (const f of fixtures.filter((f) => !wanted || wanted.includes(f.name))) {
  const bytes = salted(readFileSync(f.path), randomBytes(8).toString("hex"));
  const dataUri = `data:${f.contentType};base64,${bytes.toString("base64")}`;
  const stable = await stableFileUrl(bytes, { store, contentType: f.contentType });
  // Same bytes under a second key, to see whether the cache follows the URL or the content.
  const alt = await stableFileUrl(bytes, { store, contentType: f.contentType, prefix: "alt/" });

  const plan: [Mode, string, z.ZodObject][] = [
    ["base64", dataUri, f.schemaA],
    ["url", stable.url, f.schemaA],
    ["url-alt", alt.url, f.schemaA],
    ["url-schemaB", stable.url, f.schemaB],
    ["base64-schemaB", dataUri, f.schemaB],
  ];
  for (const [mode, src, schema] of plan) {
    for (let run = 1; run <= runs; run++) await call(f, mode, run, src, schema, stable.sha256);
  }
}
console.log(`\nWrote ${outPath}. Next: npm run bench:report`);
