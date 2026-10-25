import { inputs } from "interfaze";
import { z } from "zod";
import { samples, steps, type SampleName, type StepId } from "../../samples";

export const maxDuration = 60;

const body = z.object({
  sample: z.enum(Object.keys(samples) as [SampleName, ...SampleName[]]),
  step: z.enum(steps.map((s) => s.id) as [StepId, ...StepId[]]),
  transport: z.enum(["base64", "url"]),
});

export async function POST(req: Request) {
  const apiKey = process.env.INTERFAZE_API_KEY;
  if (!apiKey) return Response.json({ error: "INTERFAZE_API_KEY is not set" }, { status: 500 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { sample: name, step: stepId, transport } = parsed.data;
  const sample = samples[name];
  const step = steps.find((s) => s.id === stepId)!;

  // Only the bundled sample files can be sent, so the demo can't be used to process arbitrary documents.
  const fileUrl = new URL(sample.path, req.url).toString();
  let src = fileUrl;
  if (transport === "base64") {
    const bytes = Buffer.from(await (await fetch(fileUrl)).arrayBuffer());
    src = `data:${sample.contentType};base64,${bytes.toString("base64")}`;
  }
  const part = sample.contentType.startsWith("image/")
    ? inputs.image(src)
    : inputs.file(src, { filename: sample.path.split("/").pop(), format: sample.contentType });

  const { $schema, ...schema } = z.toJSONSchema(sample.schema) as Record<string, unknown>;
  const started = performance.now();
  // Raw fetch rather than the SDK client, so each step sends exactly the header it names.
  const res = await fetch("https://api.interfaze.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(step.header ? { [step.header]: "true" } : {}),
    },
    body: JSON.stringify({
      model: "interfaze-beta",
      messages: [{ role: "user", content: [{ type: "text", text: "Extract the fields in the schema from this document." }, part] }],
      response_format: { type: "json_schema", json_schema: { name: `${name.replace("-", "_")}_fields`, schema } },
    }),
  });
  const latency_ms = Math.round(performance.now() - started);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) return Response.json({ error: `Interfaze returned ${res.status}` }, { status: 502 });

  let output: unknown = data.choices?.[0]?.message?.content ?? null;
  try {
    output = JSON.parse(output as string);
  } catch {}
  return Response.json({
    vcache: data.vcache ?? null,
    latency_ms,
    prompt_tokens: data.usage?.prompt_tokens ?? null,
    completion_tokens: data.usage?.completion_tokens ?? null,
    output,
  });
}
