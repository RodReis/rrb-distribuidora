import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentUser } = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/rbac", () => ({ getCurrentUser }));

import { GET as getStatus } from "@/app/api/finance/status/route";
import { GET as getTitles } from "@/app/api/finance/titles/route";
import { POST as importTitles } from "@/app/api/finance/import/route";
import {
  GET as getCredit,
  POST as configureCredit,
} from "@/app/api/finance/credit/[customerId]/route";

describe("rotas financeiras inativas", () => {
  beforeEach(() => {
    getCurrentUser.mockReset();
  });

  it("exige sessão até para status", async () => {
    getCurrentUser.mockRejectedValue(new Error("UNAUTHORIZED"));
    expect((await getStatus()).status).toBe(401);
    expect((await getTitles()).status).toBe(401);
    expect((await importTitles()).status).toBe(401);
    expect((await getCredit()).status).toBe(401);
  });

  it("mostra indisponibilidade sem fonte ou valor", async () => {
    getCurrentUser.mockResolvedValue({ role: "admin", tenantId: "tenant-a" });
    const response = await getStatus();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      available: false,
      source: null,
      updatedAt: null,
    });
  });

  it("nega leitura e escrita mesmo para admin enquanto regras não existem", async () => {
    getCurrentUser.mockResolvedValue({ role: "admin", tenantId: "tenant-a" });
    expect((await getTitles()).status).toBe(403);
    expect((await importTitles()).status).toBe(403);
    expect((await getCredit()).status).toBe(403);
    expect((await configureCredit()).status).toBe(403);
  });
});
