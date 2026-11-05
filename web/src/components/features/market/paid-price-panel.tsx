"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
}
interface PaidPriceData {
  observations: {
    id: string;
    observedAt: string;
    quantity: number;
    value: number;
    currency: string;
    unit: string;
    purchaseReceiptId: string;
  }[];
  averages: {
    currency: string;
    unit: string;
    quantity: number;
    value: number;
    methodVersion: string;
  }[];
}

export function PaidPricePanel({ products }: { products: ProductOption[] }) {
  const [productId, setProductId] = React.useState(products[0]?.id ?? "");
  const [from, setFrom] = React.useState(() =>
    new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
  );
  const [to, setTo] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = React.useState<PaidPriceData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [retry, setRetry] = React.useState(0);

  React.useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    const params = new URLSearchParams({ productId, from, to });
    void fetch(`/api/market/paid-price?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao consultar recebimentos.");
        return response.json() as Promise<PaidPriceData>;
      })
      .then((result) => setData(result))
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Falha ao consultar recebimentos.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [productId, from, to, retry]);

  const money = (value: number, currency: string) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
      maximumFractionDigits: 4,
    }).format(value);

  return (
    <section className="rounded-md border border-carbon-800 bg-carbon-900">
      <div className="border-b border-carbon-800 p-4">
        <h2 className="text-headline-sm text-ice-white">Preço pago em compras recebidas</h2>
        <p className="mt-1 text-body-sm text-titanium-muted">
          Média ponderada pela quantidade recebida. Estornos excluídos. Valores separados por moeda
          e unidade.
        </p>
      </div>
      <div className="space-y-4 p-4">
        <label className="block max-w-xl text-body-sm text-titanium-muted">
          Produto
          <select
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            className="mt-1 w-full rounded border border-carbon-700 bg-carbon-950 px-3 py-2 text-ice-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-carmine-core"
          >
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} · {product.name} ({product.unit})
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="text-body-sm text-titanium-muted">
            De{" "}
            <input
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 block rounded border border-carbon-700 bg-carbon-950 px-3 py-2 text-ice-white"
            />
          </label>
          <label className="text-body-sm text-titanium-muted">
            Até{" "}
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 block rounded border border-carbon-700 bg-carbon-950 px-3 py-2 text-ice-white"
            />
          </label>
        </div>
        {products.length === 0 && (
          <p className="text-body-sm text-titanium-muted">Nenhum produto cadastrado.</p>
        )}
        {loading && (
          <p role="status" className="text-body-sm text-titanium-muted">
            Consultando recebimentos…
          </p>
        )}
        {error && (
          <div role="alert" className="flex items-center gap-3 text-body-sm text-titanium-muted">
            <span>{error}</span>
            <Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}>
              Tentar novamente
            </Button>
          </div>
        )}
        {data && (
          <>
            {data.averages.length === 0 ? (
              <p className="text-body-sm text-titanium-muted">
                Sem recebimentos elegíveis para este produto.
              </p>
            ) : (
              <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-carbon-800 pb-4">
                {data.averages.map((average) => (
                  <div key={`${average.currency}/${average.unit}`}>
                    <div className="text-label-code uppercase tracking-wider text-titanium-muted">
                      Média paga · {average.currency}/{average.unit}
                    </div>
                    <div className="font-mono text-headline-sm tabular-nums text-ice-white">
                      {money(average.value, average.currency)}
                    </div>
                    <div className="text-label-code text-titanium-muted">
                      {average.quantity.toLocaleString("pt-BR")} {average.unit} recebidos
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data.observations.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-carbon-800 text-left text-titanium-muted">
                      <th className="py-2 pr-4">Recebido em</th>
                      <th className="py-2 pr-4 text-right">Quantidade</th>
                      <th className="py-2 text-right">Preço unitário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.observations.map((point) => (
                      <tr key={point.id} className="border-b border-carbon-800/50 text-ice-white">
                        <td className="py-2 pr-4">
                          {new Date(point.observedAt).toLocaleString("pt-BR")}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">
                          {point.quantity.toLocaleString("pt-BR")} {point.unit}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums">
                          {money(point.value, point.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        <p className="text-label-code text-titanium-muted">
          Série de compras separada das cotações de mercado. Conversão entre moedas e unidades
          indisponível sem taxa e vínculo aprovados.
        </p>
      </div>
    </section>
  );
}
