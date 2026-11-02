import { describe, expect, it } from "vitest";
import { contentTypeForKey, readFile } from "./r2";

describe("armazenamento de propostas", () => {
  it("não lê arquivos fora da pasta de armazenamento", async () => {
    expect(await readFile("package.json")).toBeNull();
    expect(await readFile("../../package.json")).toBeNull();
    expect(await readFile("quotes/../../package.json")).toBeNull();
    expect(await readFile("")).toBeNull();
  });

  it("devolve nulo para chave inexistente", async () => {
    expect(await readFile("quotes/tenant-inexistente/999-proposta.pdf")).toBeNull();
  });

  it("define o content-type pela extensão", () => {
    expect(contentTypeForKey("quotes/t/1-proposta.pdf")).toBe("application/pdf");
    expect(contentTypeForKey("catalogo.json")).toBe("application/json");
    expect(contentTypeForKey("binario")).toBe("application/octet-stream");
  });
});
