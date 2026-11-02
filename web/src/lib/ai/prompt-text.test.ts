import { describe, expect, it } from "vitest";
import { extractPromptText } from "./prompt-text";

describe("extractPromptText", () => {
  it("devolve string como está", () => {
    expect(extractPromptText("Qual o saldo?")).toBe("Qual o saldo?");
  });

  it("junta só as partes de texto", () => {
    expect(
      extractPromptText([
        { type: "text", text: "Primeira linha" },
        { type: "image", image: "x" },
        { type: "text", text: "Segunda linha" },
      ])
    ).toBe("Primeira linha\nSegunda linha");
  });

  it("não vaza JSON quando não há texto", () => {
    expect(extractPromptText([{ type: "image", image: "x" }])).toBe("");
    expect(extractPromptText(undefined)).toBe("");
    expect(extractPromptText({ foo: 1 })).toBe("");
  });
});
