import { afterEach, describe, expect, it, vi } from "vitest";
import { r2Store } from "../src/index.js";

const opts = {
  accountId: "acct",
  bucket: "bucket",
  accessKeyId: "AKID",
  secretAccessKey: "secret",
  publicBaseUrl: "https://pub.example.r2.dev/",
};

function mockFetch(status: number) {
  const calls: Request[] = [];
  vi.stubGlobal("fetch", async (input: Request) => {
    calls.push(input);
    return new Response(null, { status });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("r2Store", () => {
  it("HEADs the object on the account's S3 endpoint with a signed request", async () => {
    const calls = mockFetch(200);
    expect(await r2Store(opts).exists("files/a b.png")).toBe(true);
    expect(calls[0].method).toBe("HEAD");
    expect(calls[0].url).toBe("https://acct.r2.cloudflarestorage.com/bucket/files/a%20b.png");
    expect(calls[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\//);
  });

  it("treats 404 as missing and other errors as failures", async () => {
    mockFetch(404);
    expect(await r2Store(opts).exists("k")).toBe(false);
    mockFetch(403);
    await expect(r2Store(opts).exists("k")).rejects.toThrow("HEAD k failed: 403");
  });

  it("PUTs with the content type", async () => {
    const calls = mockFetch(200);
    await r2Store(opts).put("files/x.pdf", new Uint8Array([1, 2, 3]), "application/pdf");
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].headers.get("content-type")).toBe("application/pdf");
  });

  it("builds public URLs from the base URL without a double slash", () => {
    expect(r2Store(opts).url("files/x.pdf")).toBe("https://pub.example.r2.dev/files/x.pdf");
  });
});
