import { describe, expect, it } from "vitest";
import { sha256Hex, stableFileUrl, type FileStore } from "../src/index.js";

function memoryStore() {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  let puts = 0;
  const store: FileStore = {
    exists: async (key) => objects.has(key),
    put: async (key, bytes, contentType) => {
      puts++;
      objects.set(key, { bytes, contentType });
    },
    url: (key) => `https://files.example.com/${key}`,
  };
  return { store, objects, puts: () => puts };
}

const bytes = (s: string) => new TextEncoder().encode(s);

describe("sha256Hex", () => {
  it("matches a known digest", async () => {
    expect(await sha256Hex(bytes("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("stableFileUrl", () => {
  it("gives identical bytes the same URL and uploads them once", async () => {
    const { store, puts } = memoryStore();
    const a = await stableFileUrl(bytes("receipt"), { store, contentType: "image/png" });
    const b = await stableFileUrl(bytes("receipt"), { store, contentType: "image/png" });
    expect(a.url).toBe(b.url);
    expect(a.uploaded).toBe(true);
    expect(b.uploaded).toBe(false);
    expect(puts()).toBe(1);
  });

  it("gives different bytes different URLs", async () => {
    const { store } = memoryStore();
    const a = await stableFileUrl(bytes("receipt-1"), { store, contentType: "image/png" });
    const b = await stableFileUrl(bytes("receipt-2"), { store, contentType: "image/png" });
    expect(a.url).not.toBe(b.url);
  });

  it("keys on the hash with a prefix and an extension from the content type", async () => {
    const { store, objects } = memoryStore();
    const f = await stableFileUrl(bytes("abc"), { store, contentType: "application/pdf; charset=binary" });
    expect(f.key).toBe("files/ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.pdf");
    expect(f.url).toBe(`https://files.example.com/${f.key}`);
    expect(objects.get(f.key)?.contentType).toBe("application/pdf; charset=binary");
  });

  it("omits the extension for unknown types and honors a custom prefix", async () => {
    const { store } = memoryStore();
    const f = await stableFileUrl(bytes("abc"), { store, contentType: "application/x-unknown", prefix: "uploads/" });
    expect(f.key).toBe("uploads/ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
