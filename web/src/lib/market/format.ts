const nf = (min: number, max: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });

export const fmtNum = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : nf(d, d).format(n);

export const fmtBrl = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : `R$ ${nf(d, d).format(n)}`;

export const fmtUsd = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : `US$ ${nf(d, d).format(n)}`;

export const fmtPct = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${nf(d, d).format(n)}%`;

export const deltaTone = (n: number | null | undefined) =>
  n == null
    ? "text-titanium-muted"
    : n > 0
      ? "text-signal-buy"
      : n < 0
        ? "text-signal-risk"
        : "text-titanium-muted";
