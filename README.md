# interfaze-file-cache

Measuring how [Interfaze](https://interfaze.ai)'s cache actually behaves, and two things I'd fix.

**Live demo:** https://interfaze-cache-check.vercel.app shows the bypass bug in four calls.

I started out to prove that Interfaze's cache misses when a file is sent as base64. The benchmark showed I was wrong: base64 is reused about as well as a stable URL. The same runs turned up two other problems, and both are reproducible with the scripts in this repo.

## Findings

### 1. On SDK 1.0.0 through 1.0.2, `bypassCache: true` silently does nothing

The SDK option is the same in every version, but the header it sends changed in 1.0.3. The API only honors the new one:

| SDK version | Header sent for `bypassCache: true` | API behavior (live) |
|---|---|---|
| 1.0.0, 1.0.1, 1.0.2 | `x-bypass-cache` | **ignored**, response still cached |
| 1.0.3 | `x-interfaze-bypass-cache` | honored |

The MoA/MoE router bypass changed the same way (`x-bypass-moe` → `x-interfaze-bypass-moa`). Anyone pinned to an older SDK who turns on bypass, for example to get fresh results while testing, gets cached results and no error. The headers come from intercepting each published version's real request; the live check primes a prompt, then repeats it with each header ([`bench/header-check.ts`](bench/header-check.ts), [results](bench/results/header-check.json)).

### 2. `vcache` doesn't tell you whether the cache was used

- On the **first** call with bytes the API had never seen, `vcache` was usually `true` (receipt and ID card, run 1).
- In a separate run, the original receipt (its pixels had been sent more than 30 times in earlier runs) returned `vcache=false` three times in a row. Lookalike receipts it had never seen returned `vcache=true`.
- A fresh prompt with a random nonce returned `vcache=true` on its very first send.

The usage numbers show caching more clearly than the flag does. For the invoice PDF, the first two calls reported 13,190 prompt tokens and took 8–11 s. From the third call on, the same request reported 10,336 prompt tokens and took about 5 s.

### 3. Base64 vs. stable URL: no meaningful difference (my original hypothesis, disproved)

Each file was sent 5 times in each mode, with the same schema A unless noted. 75 calls on `interfaze-beta`, 0 errors:

| File | Mode | `vcache` true | Run 1 latency | Median latency, runs 2+ | Median tokens |
|---|---|---|---|---|---|
| receipt | base64 | 5/5 | 6,217 ms | 4,398 ms | 8,982 |
| receipt | url | 5/5 | 3,704 ms | 4,118 ms | 8,983 |
| receipt | same bytes, other URL | 5/5 | 4,711 ms | 3,672 ms | 8,982 |
| receipt | url, schema B | 5/5 | 4,228 ms | 4,165 ms | 9,137 |
| receipt | base64, schema B | 5/5 | 4,635 ms | 4,292 ms | 9,114 |
| invoice | base64 | 3/5 | 11,348 ms | 5,376 ms | 10,448 |
| invoice | url | 5/5 | 5,904 ms | 4,524 ms | 10,441 |
| invoice | same bytes, other URL | 5/5 | 5,575 ms | 4,672 ms | 10,441 |
| invoice | url, schema B | 5/5 | 5,065 ms | 4,627 ms | 10,421 |
| invoice | base64, schema B | 5/5 | 5,055 ms | 5,439 ms | 10,432 |
| id-card | base64 | 5/5 | 6,888 ms | 4,865 ms | 8,894 |
| id-card | url | 5/5 | 3,769 ms | 4,383 ms | 8,898 |
| id-card | same bytes, other URL | 5/5 | 5,388 ms | 4,328 ms | 8,897 |
| id-card | url, schema B | 5/5 | 4,476 ms | 4,376 ms | 8,898 |
| id-card | base64, schema B | 5/5 | 4,420 ms | 4,638 ms | 8,898 |

After the first base64 call, every mode ran warm, including the same bytes under a different URL and a different schema. That fits a cache keyed on the content, which is already what I was going to propose. Raw data: [`bench/results/`](bench/results/), full table: [`bench/RESULTS.md`](bench/RESULTS.md).

I also checked whether a content-similarity cache could hand one document's answer to a lookalike. I made receipts that differ from the original in exactly one field (total, date, or merchant). All 12 extractions were correct, with and without the cache ([`bench/lookalike.ts`](bench/lookalike.ts)).

## What I'd change in Interfaze

1. **Reject unknown `x-*bypass*` headers** with a 400 that names the correct header, or accept the old spellings as aliases. Turning on a control that silently does nothing is the worst outcome.
2. **Make `vcache` mean something specific.** For example, return `cache: { hit: boolean, layer: "first_pass" | "response" | null, key: string }`, so developers can tell a reused OCR pass from a reused final answer, and can see when two requests share a key.
3. **Return a `file_id` after ingestion.** The cache already seems to key on content, so a `file_id` would let clients skip re-sending up to 20 MB of base64 for follow-up questions. That cuts upload time even when the compute is already cached.

## Reproduce

```bash
cp .env.example .env.local   # fill in INTERFAZE_API_KEY and R2 credentials
npm install
npm run bench:headers -- --live   # header check (offline part needs no key)
npm run bench                      # 75 calls, about 6 minutes
npm run bench:report               # writes bench/RESULTS.md
npm run bench:lookalike            # 12 calls
```

The sample documents in [`samples/`](samples/) are generated and fictional.

## `stableFileUrl()`: content-addressed file URLs

The benchmark needs stable public URLs, so it comes with a small utility. It hashes the bytes with SHA-256, uploads them to R2 or any S3-compatible bucket only if that key doesn't exist yet, and returns the public URL. The same bytes always get the same URL. Per finding 3, this doesn't improve cache hits. It's useful for keeping large files out of the request body.

```ts
import { r2Store, stableFileUrl } from "interfaze-file-cache";
const store = r2Store({ accountId, bucket, accessKeyId, secretAccessKey, publicBaseUrl });
const { url } = await stableFileUrl(bytes, { store, contentType: "application/pdf" });
```

To use another backend, implement `FileStore`: `exists`, `put`, and `url`. Tests: `npm test`.

## Caveats

One model (`interfaze-beta`), one machine, one evening (2026-10-25), and 5 runs per cell. Before each run, the benchmark appends random bytes after the end of each file, so the API sees new bytes. Image decoders ignore trailing bytes, so the pixels were unchanged. That may explain some of the "first call" hits in finding 2, and it fits a cache keyed on decoded content rather than raw bytes.

## License

MIT
