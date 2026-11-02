/**
 * Armazenamento de arquivos (Cloudflare R2 / S3) — MVP-03.
 *
 * Em produção, usa R2 via API S3-compatible. Em desenvolvimento sem credenciais,
 * grava em `.data/quotes` para permitir testar o fluxo completo localmente.
 */

import { mkdir, readFile as readFileFromDisk, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const LOCAL_DIR = path.join(process.cwd(), ".data", "quotes");

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function isR2Configured(): boolean {
  return !!(
    env("R2_ACCOUNT_ID") &&
    env("R2_ACCESS_KEY_ID") &&
    env("R2_SECRET_ACCESS_KEY") &&
    env("R2_BUCKET")
  );
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env("R2_ACCESS_KEY_ID")!,
      secretAccessKey: env("R2_SECRET_ACCESS_KEY")!,
    },
  });
  return client;
}

export interface StoredFile {
  key: string;
  /** URL pública (quando configurada) ou rota interna de download. */
  url: string;
  storage: "r2" | "local";
}

function safeKey(key: string): string {
  const normalized = path.posix.normalize(key.replace(/\\/g, "/")).replace(/^\/+/, "");
  return normalized === ".." || normalized.startsWith("../") ? "" : normalized;
}

/** Garante que o caminho resolvido continua dentro da pasta local. */
function localPath(key: string): string | null {
  const root = path.resolve(LOCAL_DIR);
  const target = path.resolve(root, key);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string
): Promise<StoredFile> {
  const normalized = safeKey(key);
  if (!normalized) throw new Error("Chave de arquivo inválida.");

  if (isR2Configured()) {
    await getClient().send(
      new PutObjectCommand({
        Bucket: env("R2_BUCKET")!,
        Key: normalized,
        Body: body,
        ContentType: contentType,
      })
    );

    const publicBase = env("R2_PUBLIC_BASE_URL");
    return {
      key: normalized,
      url: publicBase
        ? `${publicBase.replace(/\/+$/, "")}/${normalized}`
        : `/api/files/download?key=${encodeURIComponent(normalized)}`,
      storage: "r2",
    };
  }

  const target = localPath(normalized);
  if (!target) throw new Error("Chave de arquivo inválida.");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);

  return {
    key: normalized,
    url: `/api/files/download?key=${encodeURIComponent(normalized)}`,
    storage: "local",
  };
}

export async function readFile(key: string): Promise<Buffer | null> {
  const normalized = safeKey(key);
  if (!normalized) return null;

  if (isR2Configured()) {
    try {
      const response = await getClient().send(
        new GetObjectCommand({ Bucket: env("R2_BUCKET")!, Key: normalized })
      );
      const bytes = await response.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch {
      return null;
    }
  }

  try {
    const target = localPath(normalized);
    if (!target) return null;
    return await readFileFromDisk(target);
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  const normalized = safeKey(key);
  if (!normalized) return;

  if (isR2Configured()) {
    await getClient().send(new DeleteObjectCommand({ Bucket: env("R2_BUCKET")!, Key: normalized }));
    return;
  }

  const { rm } = await import("node:fs/promises");
  const target = localPath(normalized);
  if (!target) return;
  await rm(target, { force: true });
}

export function contentTypeForKey(key: string): string {
  if (key.endsWith(".pdf")) return "application/pdf";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}
