import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface ObjectStorage {
  readonly kind: "s3" | "local";
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** URL temporal para descargar o reproducir; `null` si hay que servirlo vía la API. */
  signedUrl(key: string, expiresInSecs?: number): Promise<string | null>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

export type S3Config = {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
};

export class S3Storage implements ObjectStorage {
  readonly kind = "s3" as const;
  private readonly client: S3Client;
  constructor(private readonly cfg: S3Config) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle ?? false,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async signedUrl(key: string, expiresInSecs = 300) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }), {
      expiresIn: expiresInSecs,
    });
  }

  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    if (!res.Body) return null;
    return new Uint8Array(await res.Body.transformToByteArray());
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
}

/** Disco local, solo para desarrollo. */
export class LocalStorage implements ObjectStorage {
  readonly kind = "local" as const;
  constructor(private readonly root: string) {}

  private file(key: string) {
    const safe = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, "");
    return path.join(this.root, safe);
  }

  async put(key: string, body: Uint8Array) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }

  async signedUrl() {
    return null;
  }

  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.file(key)));
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.file(key), { force: true });
  }
}
