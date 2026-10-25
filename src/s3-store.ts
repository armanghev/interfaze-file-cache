import { AwsClient } from "aws4fetch";
import type { FileStore } from "./stable-file-url.js";

export interface S3StoreOptions {
  /** S3 API endpoint, e.g. https://<account>.r2.cloudflarestorage.com or https://s3.us-east-1.amazonaws.com */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Base URL objects are publicly served from, e.g. https://pub-xxxx.r2.dev */
  publicBaseUrl: string;
}

/** FileStore for any S3-compatible API (AWS S3, Cloudflare R2, MinIO, ...). */
export function s3Store(opts: S3StoreOptions): FileStore {
  const aws = new AwsClient({
    accessKeyId: opts.accessKeyId,
    secretAccessKey: opts.secretAccessKey,
    service: "s3",
    region: opts.region,
  });
  const objectUrl = (key: string) => `${opts.endpoint.replace(/\/$/, "")}/${opts.bucket}/${encodeKey(key)}`;
  const base = opts.publicBaseUrl.replace(/\/$/, "");

  return {
    async exists(key) {
      const res = await aws.fetch(objectUrl(key), { method: "HEAD" });
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`HEAD ${key} failed: ${res.status}`);
      return true;
    },
    async put(key, bytes, contentType) {
      const res = await aws.fetch(objectUrl(key), {
        method: "PUT",
        body: bytes as Uint8Array<ArrayBuffer>,
        headers: { "content-type": contentType },
      });
      if (!res.ok) throw new Error(`PUT ${key} failed: ${res.status} ${await res.text()}`);
    },
    url: (key) => `${base}/${encodeKey(key)}`,
  };
}

export interface R2StoreOptions {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export function r2Store(opts: R2StoreOptions): FileStore {
  return s3Store({
    ...opts,
    endpoint: `https://${opts.accountId}.r2.cloudflarestorage.com`,
    region: "auto",
  });
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}
