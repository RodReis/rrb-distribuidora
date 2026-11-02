import { describe, expect, it } from "vitest";
import {
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  parseTheme,
  readAppliedTheme,
  themeColor,
} from "./theme";

describe("parseTheme", () => {
  it("só reconhece light; qualquer outra coisa vira o padrão escuro", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("claro")).toBe("dark");
    expect(parseTheme("")).toBe("dark");
    expect(parseTheme(null)).toBe("dark");
    expect(parseTheme(undefined)).toBe("dark");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("lê a mesma chave que o alternador grava e troca as classes do <html>", () => {
    expect(THEME_INIT_SCRIPT).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
    expect(THEME_INIT_SCRIPT).toContain('classList.remove("dark")');
    expect(THEME_INIT_SCRIPT).toContain('classList.add("light")');
  });

  it("é tolerante a armazenamento bloqueado (try/catch)", () => {
    expect(THEME_INIT_SCRIPT).toMatch(/try\{.*\}catch\(e\)\{\}/);
  });

  it("aplica o tema salvo e ignora o ausente (executado como no navegador)", () => {
    const run = (stored: string | null) => {
      const classes = new Set(["dark"]);
      const documentElement = {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
        },
      };
      const localStorage = { getItem: () => stored };
      new Function("localStorage", "document", THEME_INIT_SCRIPT)(localStorage, {
        documentElement,
      });
      return [...classes];
    };
    expect(run("light")).toEqual(["light"]);
    expect(run(null)).toEqual(["dark"]);
    expect(run("dark")).toEqual(["dark"]);
  });
});

describe("fora do navegador", () => {
  it("readAppliedTheme devolve o padrão escuro no servidor", () => {
    expect(readAppliedTheme()).toBe("dark");
  });

  it("themeColor devolve um valor seguro no servidor", () => {
    expect(themeColor("ice-white")).toBe("rgb(0, 0, 0)");
  });
});
