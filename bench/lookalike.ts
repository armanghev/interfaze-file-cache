/**
 * Can the cache return another file's answer? Sends the original receipt, then receipts that
 * differ from it in exactly one field. Each lookalike is sent twice with the cache on and once
 * with it bypassed. A wrong field together with vcache=true, while the bypassed call reads the
 * field correctly, is a stale hit: the cache served the answer for a different file.
 *
 * Usage: npm run bench:lookalike -- [--runs 2]
 */
import { readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { Interfaze, inputs, responseFormat } from "interfaze";
import { z } from "zod";
import { env } from "./lib/env.js";

const { values: args } = parseArgs({
  options: {
    runs: { type: "string", default: "2" },
    model: { type: "string", default: process.env.INTERFAZE_MODEL ?? "interfaze-beta" },
  },
});

const schema = z.object({ merchant: z.string(), date: z.string().describe("YYYY-MM-DD"), total: z.number() });
type Fields = z.infer<typeof schema>;

const original: Fields = { merchant: "SAMPLE MART", date: "2026-10-24", total: 30.53 };
const files: { name: string; path: string; expected: Fields }[] = [
  { name: "original", path: "samples/receipt.png", expected: original },
  { name: "total", path: "samples/lookalikes/receipt-total.png", expected: { ...original, total: 31.61 } },
  { name: "date", path: "samples/lookalikes/receipt-date.png", expected: { ...original, date: "2026-09-17" } },
  { name: "merchant", path: "samples/lookalikes/receipt-merchant.png", expected: { ...original, merchant: "DEMO GROCER" } },
];

const apiKey = env("INTERFAZE_API_KEY");
const cached = new Interfaze({ apiKey });
const bypass = new Interfaze({ apiKey, bypassCache: true });

const { $schema, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
const session = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync("bench/results", { recursive: true });
const outPath = `bench/results/lookalike-${session}.jsonl`;

function wrongFields(got: Partial<Fields> | null, expected: Fields): string[] {
  if (!got) return ["unparsed"];
  return (Object.keys(expected) as (keyof Fields)[]).filter((k) =>
    k === "total" ? Math.abs(Number(got[k]) - expected[k]) > 0.005 : String(got[k]).trim().toUpperCase() !== String(expected[k]).toUpperCase(),
  );
}

async function extract(client: Interfaze, path: string) {
  const dataUri = `data:image/png;base64,${readFileSync(path).toString("base64")}`;
  const started = performance.now();
  const data = await client.chat.completions.create({
    model: args.model,
    messages: [
      { role: "user", content: [{ type: "text", text: "Extract the fields in the schema from this receipt." }, inputs.image(dataUri)] },
    ],
    response_format: responseFormat(jsonSchema, "receipt_a"),
  });
  let got: Partial<Fields> | null = null;
  try {
    got = JSON.parse(data.choices[0]?.message?.content ?? "");
  } catch {}
  return { got, vcache: data.vcache ?? null, latency_ms: Math.round(performance.now() - started), total_tokens: data.usage?.total_tokens ?? null };
}

for (const f of files) {
  const attempts: [string, Interfaze][] = [
    ...Array.from({ length: Number(args.runs) }, (_, i) => [`cached#${i + 1}`, cached] as [string, Interfaze]),
    ["bypass", bypass],
  ];
  for (const [label, client] of attempts) {
    try {
      const r = await extract(client, f.path);
      const wrong = wrongFields(r.got, f.expected);
      // The wrong value equals the original receipt's value: the answer for a different file.
      const matchesOriginal = f.name !== "original" && wrong.length > 0 && wrongFields(r.got, original).length === 0;
      const row = { session, file: f.name, attempt: label, ...r, expected: f.expected, wrong, matchesOriginal, model: args.model };
      appendFileSync(outPath, JSON.stringify(row) + "\n");
      console.log(
        `${f.name.padEnd(9)} ${label.padEnd(9)} vcache=${String(r.vcache).padEnd(5)} ${String(r.latency_ms).padStart(6)}ms  ` +
          `${wrong.length ? `WRONG ${wrong.join(",")}${matchesOriginal ? " (= original receipt's answer)" : ""}` : "correct"}  ${JSON.stringify(r.got)}`,
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      appendFileSync(outPath, JSON.stringify({ session, file: f.name, attempt: label, error }) + "\n");
      console.log(`${f.name.padEnd(9)} ${label.padEnd(9)} ERROR ${error}`);
    }
  }
}
console.log(`\nWrote ${outPath}`);
