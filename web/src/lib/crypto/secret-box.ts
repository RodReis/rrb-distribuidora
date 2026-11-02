/**
 * Guarda de segredos em banco (chaves de API por tenant): AES-256-GCM.
 *
 * A chave vem de APP_ENCRYPTION_KEY (hex de 64 caracteres = 32 bytes). Sem ela, nada é gravado
 * nem lido — a tela de configuração avisa. A chave de app vive só no servidor (env), nunca no
 * banco e nunca no repositório.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_LENGTH = 32;
const IV_LENGTH = 12;

function loadKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "APP_ENCRYPTION_KEY não configurada (64 caracteres hex, 32 bytes). Gere com: openssl rand -hex 32"
    );
  }
  const key = Buffer.from(raw, "hex");
  if (key.length !== KEY_LENGTH) {
    throw new Error("APP_ENCRYPTION_KEY inválida: são 64 caracteres hex (32 bytes).");
  }
  return key;
}

export function isEncryptionConfigured(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/** iv (12 bytes) + tag (16) + texto cifrado, tudo em base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", loadKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

/** Lança se o payload foi gravado com outra chave ou foi alterado. */
export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length <= IV_LENGTH + 16) throw new Error("Segredo gravado em formato inválido.");
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = raw.subarray(IV_LENGTH + 16);
  const decipher = createDecipheriv("aes-256-gcm", loadKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/** Exibição segura: só os 4 últimos caracteres. */
export function maskSecret(plain: string): string {
  return plain.length <= 4 ? "••••" : `•••••${plain.slice(-4)}`;
}
