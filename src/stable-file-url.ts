/** Where content-addressed files live. Implement this to plug in any object store. */
export interface FileStore {
  exists(key: string): Promise<boolean>;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Public URL Interfaze can fetch the object from. */
  url(key: string): string;
}

export interface StableFileUrlOptions {
  store: FileStore;
  contentType: string;
  /** Key prefix inside the bucket. Default: "files/". */
  prefix?: string;
}

export interface StableFile {
  url: string;
  key: string;
  sha256: string;
  /** False when an object with the same hash was already there. */
  uploaded: boolean;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/csv": "csv",
  "text/plain": "txt",
  "application/json": "json",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload bytes under their SHA-256 and return a stable public URL.
 * Identical bytes always map to the same URL, so Interfaze sees the same file every time.
 */
export async function stableFileUrl(bytes: Uint8Array, opts: StableFileUrlOptions): Promise<StableFile> {
  const sha256 = await sha256Hex(bytes);
  const ext = EXTENSIONS[opts.contentType.split(";")[0].trim()];
  const key = `${opts.prefix ?? "files/"}${sha256}${ext ? `.${ext}` : ""}`;
  let uploaded = false;
  if (!(await opts.store.exists(key))) {
    await opts.store.put(key, bytes, opts.contentType);
    uploaded = true;
  }
  return { url: opts.store.url(key), key, sha256, uploaded };
}
