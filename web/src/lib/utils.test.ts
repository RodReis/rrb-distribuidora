import { describe, it, expect } from "vitest";
import {
  formatCurrencyInput,
  parseCurrencyInput,
  sanitizeCurrencyInput,
  toCurrencyInputText,
} from "./utils";

describe("máscara de moeda pt-BR", () => {
  describe("sanitizeCurrencyInput", () => {
    it("mantém apenas dígitos e uma vírgula", () => {
      expect(sanitizeCurrencyInput("R$ 1.234,56")).toBe("1234,56");
      expect(sanitizeCurrencyInput("abc")).toBe("");
      expect(sanitizeCurrencyInput("12a3b4")).toBe("1234");
    });

    it("descarta as vírgulas extras mantendo a primeira como decimal", () => {
      expect(sanitizeCurrencyInput("1,2,3")).toBe("1,23");
      expect(sanitizeCurrencyInput(",,5")).toBe(",5");
    });

    it("corta o excesso de casas decimais", () => {
      expect(sanitizeCurrencyInput("1,23456")).toBe("1,23");
      expect(sanitizeCurrencyInput("1,23456", 4)).toBe("1,2345");
    });

    it("preserva a vírgula sem decimais para o usuário continuar digitando", () => {
      expect(sanitizeCurrencyInput("1234,")).toBe("1234,");
    });
  });

  describe("formatCurrencyInput", () => {
    it("agrupa milhar com ponto", () => {
      expect(formatCurrencyInput("1234")).toBe("1.234");
      expect(formatCurrencyInput("1234567")).toBe("1.234.567");
      expect(formatCurrencyInput("999")).toBe("999");
    });

    it("não mexe na parte decimal digitada", () => {
      expect(formatCurrencyInput("1234,5")).toBe("1.234,5");
      expect(formatCurrencyInput("1234567,89")).toBe("1.234.567,89");
      expect(formatCurrencyInput("1234,")).toBe("1.234,");
    });

    it("remove zeros à esquerda e mantém o zero solitário", () => {
      expect(formatCurrencyInput("007")).toBe("7");
      expect(formatCurrencyInput("0")).toBe("0");
      expect(formatCurrencyInput("0,5")).toBe("0,5");
    });

    it("devolve vazio para texto vazio", () => {
      expect(formatCurrencyInput("")).toBe("");
    });
  });

  describe("parseCurrencyInput", () => {
    it("interpreta ponto como milhar e vírgula como decimal", () => {
      expect(parseCurrencyInput("1.234,56")).toBe(1234.56);
      expect(parseCurrencyInput("1.234.567,89")).toBe(1234567.89);
      expect(parseCurrencyInput("12,3")).toBe(12.3);
    });

    it("aceita número sem separador de milhar", () => {
      expect(parseCurrencyInput("1234")).toBe(1234);
      expect(parseCurrencyInput("0,05")).toBe(0.05);
    });

    it("devolve 0 para vazio ou inválido", () => {
      expect(parseCurrencyInput("")).toBe(0);
      expect(parseCurrencyInput("abc")).toBe(0);
      expect(parseCurrencyInput(",")).toBe(0);
    });
  });

  describe("toCurrencyInputText", () => {
    it("usa vírgula e omite milhar", () => {
      expect(toCurrencyInputText(1234.5)).toBe("1234,5");
      expect(toCurrencyInputText(0.05)).toBe("0,05");
    });

    it("devolve vazio para zero ou ausente, deixando o placeholder aparecer", () => {
      expect(toCurrencyInputText(0)).toBe("");
      expect(toCurrencyInputText(null)).toBe("");
      expect(toCurrencyInputText(undefined)).toBe("");
      expect(toCurrencyInputText(Number.NaN)).toBe("");
    });

    it("arredonda a sujeira de ponto flutuante conforme as casas pedidas", () => {
      expect(toCurrencyInputText(2680.4000000000001)).toBe("2680,4");
      expect(toCurrencyInputText(0.1 + 0.2)).toBe("0,3");
      expect(toCurrencyInputText(5.36, 4)).toBe("5,36");
      expect(toCurrencyInputText(5.3612, 4)).toBe("5,3612");
      expect(toCurrencyInputText(5.3612)).toBe("5,36");
    });

    it("preserva milhares exatos sem sobra de separador", () => {
      expect(toCurrencyInputText(1000)).toBe("1000");
      expect(toCurrencyInputText(100)).toBe("100");
      expect(toCurrencyInputText(10.1)).toBe("10,1");
    });
  });

  it("faz o ciclo digitar → exibir → ler → exibir sem deriva", () => {
    const typed = "123456,78";
    const sanitized = sanitizeCurrencyInput(typed, 2);
    const displayed = formatCurrencyInput(sanitized);
    const value = parseCurrencyInput(displayed);

    expect(displayed).toBe("123.456,78");
    expect(value).toBe(123456.78);
    expect(formatCurrencyInput(toCurrencyInputText(value, 2))).toBe("123.456,78");
  });
});
