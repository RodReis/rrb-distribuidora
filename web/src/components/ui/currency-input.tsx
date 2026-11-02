"use client";

import * as React from "react";
import {
  cn,
  formatCurrencyInput,
  parseCurrencyInput,
  sanitizeCurrencyInput,
  toCurrencyInputText,
} from "@/lib/utils";
import { Input, type InputProps } from "./input";

export interface CurrencyInputProps extends Omit<
  InputProps,
  "type" | "value" | "onChange" | "defaultValue"
> {
  /** Valor numérico em reais. */
  value: number | null | undefined;
  onValueChange: (value: number) => void;
  /** Casas decimais exibidas. Padrão: 2. */
  decimals?: number;
}

/**
 * Entrada monetária com máscara pt-BR (`1.234,56`).
 *
 * Aceita edição livre: a vírgula é digitada pelo usuário e o separador de
 * milhar entra automaticamente. O valor numérico sai em reais.
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onValueChange, decimals = 2, className, ...props }, ref) => {
    const [text, setText] = React.useState(() => toCurrencyInputText(value, decimals));

    React.useEffect(() => {
      setText((current) => {
        if (Math.abs(parseCurrencyInput(current) - (value ?? 0)) < 1e-9) return current;
        return toCurrencyInputText(value, decimals);
      });
    }, [value, decimals]);

    return (
      <Input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn("font-mono", className)}
        value={formatCurrencyInput(text)}
        onChange={(event) => {
          const next = sanitizeCurrencyInput(event.target.value, decimals);
          setText(next);
          onValueChange(parseCurrencyInput(next));
        }}
        {...props}
      />
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
