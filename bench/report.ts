/** Turns a benchmark JSONL file into a markdown table. Usage: npm run bench:report -- [path.jsonl] */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const path =
  process.argv[2] ??
  `bench/results/${readdirSync("bench/results").filter((n) => n.endsWith(".jsonl")).sort().at(-1)}`;
const rows = readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};
const fmt = (x: number | null, unit = "") => (x == null ? "–" : `${x.toLocaleString("en-US")}${unit}`);

const groups = new Map<string, any[]>();
for (const r of rows) {
  const k = `${r.file}\t${r.mode}`;
  groups.set(k, [...(groups.get(k) ?? []), r]);
}

const lines = [
  `Results from \`${path}\` (model: ${rows[0]?.model ?? "?"}, ${rows.length} calls)`,
  "",
  "| File | Mode | Cache hits | Run 1 latency | Median latency, runs 2+ | Median tokens | Errors |",
  "|---|---|---|---|---|---|---|",
];
for (const [k, rs] of groups) {
  const [file, mode] = k.split("\t");
  const ok = rs.filter((r) => !r.error);
  const hits = ok.filter((r) => r.vcache === true).length;
  const first = ok.find((r) => r.run === 1);
  lines.push(
    `| ${file} | ${mode} | ${hits}/${ok.length} | ${fmt(first?.latency_ms ?? null, " ms")} | ${fmt(
      median(ok.filter((r) => r.run > 1).map((r) => r.latency_ms)),
      " ms",
    )} | ${fmt(median(ok.map((r) => r.total_tokens).filter((t) => t != null)))} | ${rs.length - ok.length} |`,
  );
}
const md = lines.join("\n") + "\n";
writeFileSync("bench/RESULTS.md", md);
console.log(md);
