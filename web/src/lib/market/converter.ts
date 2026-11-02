export type PriceUnit = "USD/t" | "USD/lb" | "USD/cwt" | "BRL/t" | "BRL/kg";

const LB_PER_KG = 2.20462262185;
const LB_PER_CWT = 100;

export function convertToBrlPerKg(value: number, unit: PriceUnit, ptax: number): number {
  switch (unit) {
    case "BRL/kg":
      return value;
    case "BRL/t":
      return value / 1000;
    case "USD/t":
      return (value / 1000) * ptax;
    case "USD/lb":
      return value * LB_PER_KG * ptax;
    case "USD/cwt":
      return (value / LB_PER_CWT) * LB_PER_KG * ptax;
  }
}

export function convertToBrlPerTon(value: number, unit: PriceUnit, ptax: number): number {
  return convertToBrlPerKg(value, unit, ptax) * 1000;
}
