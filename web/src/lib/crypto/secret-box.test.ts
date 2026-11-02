import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, isEncryptionConfigured, maskSecret } from "./secret-box";

const KEY = "a".repeat(64); // 32 bytes em hex

describe("secret box (AES-256-GCM)", () => {
  it("criptografa e descriptografa a chave de API", () => {
    process.env.APP_ENCRYPTION_KEY = KEY;
    const secret = "sk-proj-abcdef1234567890";
    const payload = encryptSecret(secret);
    expect(payload).not.toContain(secret);
    expect(decryptSecret(payload)).toBe(secret);
  });

  it("cada cifragem sai diferente (iv aleatório) e descriptografa igual", () => {
    process.env.APP_ENCRYPTION_KEY = KEY;
    const a = encryptSecret("mesma-chave");
    const b = encryptSecret("mesma-chave");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it("payload adulterado é rejeitado (tag de autenticação)", () => {
    process.env.APP_ENCRYPTION_KEY = KEY;
    const payload = encryptSecret("sk-123");
    const tampered = payload.slice(0, -4) + (payload.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("gravado com outra chave de app não abre", () => {
    process.env.APP_ENCRYPTION_KEY = KEY;
    const payload = encryptSecret("sk-123");
    process.env.APP_ENCRYPTION_KEY = "b".repeat(64);
    expect(() => decryptSecret(payload)).toThrow();
    process.env.APP_ENCRYPTION_KEY = KEY;
  });

  it("sem APP_ENCRYPTION_KEY, nada criptografa nem descriptografa", () => {
    delete process.env.APP_ENCRYPTION_KEY;
    expect(isEncryptionConfigured()).toBe(false);
    expect(() => encryptSecret("x")).toThrow(/APP_ENCRYPTION_KEY/);
  });

  it("máscara mostra só o final", () => {
    expect(maskSecret("sk-proj-abcd")).toBe("•••••abcd");
    expect(maskSecret("abcd")).toBe("••••");
  });
});
