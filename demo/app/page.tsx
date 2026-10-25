"use client";

import { useState } from "react";
import { samples, steps, type SampleName, type StepId } from "./samples";

type Result = {
  vcache?: boolean | null;
  latency_ms?: number;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  output?: unknown;
  error?: string;
};

export default function Page() {
  const [sample, setSample] = useState<SampleName>("receipt");
  const [transport, setTransport] = useState<"base64" | "url">("base64");
  const [results, setResults] = useState<Partial<Record<StepId, Result | "running">>>({});
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setResults({});
    for (const step of steps) {
      setResults((r) => ({ ...r, [step.id]: "running" }));
      let result: Result;
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sample, step: step.id, transport }),
        });
        result = await res.json();
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      setResults((r) => ({ ...r, [step.id]: result }));
    }
    setRunning(false);
  }

  const done = (id: StepId) => {
    const r = results[id];
    return r && r !== "running" && !r.error ? r : null;
  };
  const oldBypass = done("old");
  const newBypass = done("new");

  return (
    <main>
      <h1>Interfaze cache check</h1>
      <p className="lede">
        This page sends the same extraction four times: twice normally, then once with each spelling of the bypass-cache
        header. Watch what <code>vcache</code>, latency, and tokens do.{" "}
        <a href="https://github.com/armanghev/interfaze-file-cache">Benchmark and write-up</a>
      </p>

      <div className="controls">
        <label>
          Sample document
          <select value={sample} onChange={(e) => setSample(e.target.value as SampleName)} disabled={running}>
            {Object.entries(samples).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Send file as
          <select value={transport} onChange={(e) => setTransport(e.target.value as "base64" | "url")} disabled={running}>
            <option value="base64">base64 data URI</option>
            <option value="url">public URL</option>
          </select>
        </label>
        <button onClick={run} disabled={running}>
          {running ? "Running…" : "Run 4 calls"}
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Call</th>
              <th>vcache</th>
              <th>Latency</th>
              <th>Tokens (prompt + completion)</th>
              <th>Output</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => {
              const r = results[step.id];
              return (
                <tr key={step.id}>
                  <td>
                    {step.label}
                    <span className="sub">{step.header ? <code>{step.header}: true</code> : step.note}</span>
                  </td>
                  {r === undefined && <td colSpan={4} className="sub">–</td>}
                  {r === "running" && <td colSpan={4} className="sub">Waiting for Interfaze…</td>}
                  {r && r !== "running" && r.error && (
                    <td colSpan={4}>
                      <span className="badge bad">{r.error}</span>
                    </td>
                  )}
                  {r && r !== "running" && !r.error && (
                    <>
                      <td>
                        <span className={`badge ${r.vcache ? "hit" : "miss"}`}>{String(r.vcache)}</span>
                      </td>
                      <td className="num">{r.latency_ms?.toLocaleString()} ms</td>
                      <td className="num">
                        {r.prompt_tokens?.toLocaleString()} + {r.completion_tokens?.toLocaleString()}
                      </td>
                      <td>
                        <pre>
                          <code>{JSON.stringify(r.output, null, 1)}</code>
                        </pre>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {newBypass && oldBypass && (
        <div className="verdict">
          <p>
            <strong>Current header</strong> <code>x-interfaze-bypass-cache</code>:{" "}
            {newBypass.vcache ? "still reported a cache hit." : "honored, vcache=false."}
          </p>
          <p>
            <strong>Old header</strong> <code>x-bypass-cache</code> (sent by SDK 1.0.0 to 1.0.2):{" "}
            {oldBypass.vcache
              ? "ignored. The API still served from cache, so bypassCache: true silently did nothing."
              : "honored this time, vcache=false."}
          </p>
        </div>
      )}

      <footer>
        Sample documents are generated and fictional. Uploads are disabled so this demo only ever sends these three files.
      </footer>
    </main>
  );
}
