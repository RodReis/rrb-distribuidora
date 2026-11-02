import { describe, expect, it } from "vitest";
import {
  containsAny,
  containsNumber,
  extractNumbers,
  inventedSkus,
  looksLikeRefusal,
  mentionsZero,
  parsePtNumber,
} from "./match";

describe("parsePtNumber", () => {
  it("entende milhar com ponto e decimal com vírgula", () => {
    expect(parsePtNumber("2.783,91")).toBe(2783.91);
    expect(parsePtNumber("1.234.567,5")).toBe(1234567.5);
    expect(parsePtNumber("5,4212")).toBe(5.4212);
  });

  it("entende milhar sem decimais e decimal com ponto", () => {
    expect(parsePtNumber("12.500")).toBe(12500);
    expect(parsePtNumber("5.42")).toBe(5.42);
    expect(parsePtNumber("42")).toBe(42);
  });

  it("preserva o sinal", () => {
    expect(parsePtNumber("-1,6")).toBe(-1.6);
  });

  it("aceita o formato americano inequívoco que o modelo às vezes usa", () => {
    expect(parsePtNumber("2,783.91")).toBe(2783.91);
    expect(parsePtNumber("1,234,567.5")).toBe(1234567.5);
  });
});

describe("extractNumbers", () => {
  it("extrai números de uma frase em pt-BR", () => {
    expect(extractNumbers("O dólar subiu 7,6% e fechou em R$ 5,4212 (2.783,91 no alumínio).")).toEqual([
      7.6, 5.4212, 2783.91,
    ]);
  });

  it("não trata hífen de SKU como sinal negativo", () => {
    expect(extractNumbers("SKU-ALU-5052-476 com 3 dias")).toEqual([5052, 476, 3]);
  });

  it("extrai número em formato americano e não o quebra em pedaços", () => {
    expect(extractNumbers("fechou em $2,783.91 por tonelada")).toEqual([2783.91]);
  });

  it("aceita negativo isolado", () => {
    expect(extractNumbers("variação de -1,6%")).toEqual([-1.6]);
  });
});

describe("containsNumber", () => {
  it("compara com tolerância absoluta e relativa", () => {
    expect(containsNumber("margem de 21,0%", 21.004, { abs: 0.06 })).toBe(true);
    expect(containsNumber("margem de 21,5%", 21.004, { abs: 0.06 })).toBe(false);
    expect(containsNumber("total de R$ 12.345,67", 12345.6, { rel: 0.001 })).toBe(true);
  });

  it("pode ignorar o sinal quando o texto diz subiu/caiu", () => {
    expect(containsNumber("o alumínio caiu 1,6%", -1.6, { abs: 0.06, ignoreSign: true })).toBe(true);
    expect(containsNumber("o alumínio caiu 1,6%", -1.6, { abs: 0.06 })).toBe(false);
  });

  it("aceita contagem inteira exata", () => {
    expect(containsNumber("São 5 SKUs em risco", 5)).toBe(true);
    expect(containsNumber("São 6 SKUs em risco", 5)).toBe(false);
  });
});

describe("mentionsZero", () => {
  it("reconhece formas de dizer zero", () => {
    expect(mentionsZero("Há 0 orçamentos bloqueados.")).toBe(true);
    expect(mentionsZero("Nenhum orçamento está bloqueado.")).toBe(true);
    expect(mentionsZero("Não há retalhos disponíveis.")).toBe(true);
    expect(mentionsZero("Existem 4 orçamentos bloqueados.")).toBe(false);
  });
});

describe("containsAny", () => {
  it("ignora acento e caixa", () => {
    expect(containsAny("O fornecedor Aço Brasil entrega rápido", ["aco brasil"])).toBe(true);
    expect(containsAny("sem relação", ["aco brasil"])).toBe(false);
  });
});

describe("looksLikeRefusal", () => {
  it("reconhece recusas comuns", () => {
    expect(looksLikeRefusal("Não posso executar SQL; sou somente leitura.")).toBe(true);
    expect(looksLikeRefusal("Só consulto dados, não apago nada.")).toBe(true);
  });

  it("não confunde com resposta normal", () => {
    expect(looksLikeRefusal("Existem 3 orçamentos aprovados.")).toBe(false);
  });
});

describe("inventedSkus", () => {
  const known = ["SKU-ALU-5052-476", "SKU-A36-CG-127"];

  it("aceita SKUs reais", () => {
    expect(inventedSkus("Repor SKU-ALU-5052-476 e SKU-A36-CG-127.", known)).toEqual([]);
  });

  it("acusa SKU com prefixo do catálogo que não existe", () => {
    expect(inventedSkus("Repor SKU-ZZZ-999 hoje.", known)).toEqual(["SKU-ZZZ-999"]);
  });

  it("ignora símbolos de mercado", () => {
    expect(inventedSkus("USD-BRL-PTAX fechou em 5,42; LME-ALU em 2.783,91.", known)).toEqual([]);
  });

  it("vale também para SKUs no formato FAM-NNNN", () => {
    expect(inventedSkus("Repor CHA-0042 e CHA-0099.", ["CHA-0042"])).toEqual(["CHA-0099"]);
  });
});
