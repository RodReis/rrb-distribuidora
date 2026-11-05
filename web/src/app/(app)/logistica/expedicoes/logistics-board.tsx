"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";

type Shipment = {
  id: string;
  number: number;
  salesOrderId: string;
  status: string;
  volumeCount: number;
  origin: string;
  destination: string;
  carrier: string | null;
  dispatchedAt: string | null;
  manifestHash: string | null;
  items: {
    id: string;
    salesOrderItemId: string;
    quantity: number;
    weightKg: string;
    unit: string;
  }[];
  events: {
    id: string;
    type: string;
    source: string;
    occurredAt: string;
    eta: string | null;
    etaStatus: string;
    location: string | null;
  }[];
};
type ImportRow = {
  id: string;
  reference: string;
  milestone: string;
  source: string;
  observedAt: string;
  eta: string | null;
  etaStatus: string;
};
type Eligible = { id: string; number: number };
type ImportOrder = { id: string; number: number | null; status: string };
type Props = { canRead: boolean; canPrepare: boolean; canDispatch: boolean; canTrack: boolean };

async function api(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Falha na operação.");
  return result.data;
}

export function LogisticsBoard({ canRead, canPrepare, canDispatch, canTrack }: Props) {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [eligible, setEligible] = useState<Eligible[]>([]);
  const [importOrders, setImportOrders] = useState<ImportOrder[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [carrier, setCarrier] = useState("");
  const [volumeCount, setVolumeCount] = useState(1);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [reference, setReference] = useState("");
  const [milestone, setMilestone] = useState("");
  const [eta, setEta] = useState("");
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventType, setEventType] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventEvidence, setEventEvidence] = useState("");
  const [eventEta, setEventEta] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [s, i, e, p] = await Promise.all([
        canRead ? api("/api/shipments") : Promise.resolve([]),
        canTrack ? api("/api/import-tracking") : Promise.resolve([]),
        canPrepare ? api("/api/shipments/eligible") : Promise.resolve([]),
        canTrack ? api("/api/import-tracking/orders") : Promise.resolve([]),
      ]);
      setShipments(s);
      setImports(i);
      setEligible(e);
      setImportOrders(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar logística.");
    }
  }, [canRead, canTrack, canPrepare]);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }

  function prepare(event: FormEvent) {
    event.preventDefault();
    void run(
      () =>
        api("/api/shipments", { salesOrderId: orderId, origin, destination, carrier, volumeCount }),
      "Romaneio preparado."
    );
  }
  function addImport(event: FormEvent) {
    event.preventDefault();
    void run(
      () =>
        api("/api/import-tracking", {
          purchaseOrderId,
          reference,
          milestone,
          observedAt: new Date().toISOString(),
          eta: eta ? new Date(eta).toISOString() : undefined,
        }),
      "Marco manual registrado."
    );
  }

  if (!canRead && !canTrack)
    return <p className="p-8 text-carbon-200">Sem permissão para logística.</p>;
  return (
    <div className="mx-auto max-w-7xl space-y-7 pb-12">
      <Breadcrumbs items={[{ label: "Início", href: "/dashboard" }, { label: "Logística" }]} />
      <PageHeader
        title="Expedição e rastreio"
        description="Romaneios integrais e marcos registrados manualmente"
      />
      {error && (
        <p role="alert" className="rounded-lg bg-red-950 p-4 text-red-100">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-950 p-4 text-emerald-100">
          {notice}
        </p>
      )}
      {canPrepare && (
        <section className="rounded-xl bg-carbon-900 p-5 md:p-7" aria-labelledby="prepare-heading">
          <h2 id="prepare-heading" className="text-xl font-semibold text-ice-white">
            Preparar romaneio
          </h2>
          <p className="mt-2 text-sm text-carbon-300">
            Pedido inteiro, após conclusão da produção. Origem e destino ficam congelados no
            despacho.
          </p>
          <form onSubmit={prepare} className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-carbon-200">
              Pedido pronto
              <select
                required
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="rounded-lg bg-carbon-800 p-3 text-ice-white"
              >
                <option value="">Selecione</option>
                {eligible.map((row) => (
                  <option key={row.id} value={row.id}>
                    Pedido #{row.number}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-carbon-200">
              Origem
              <input
                required
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="rounded-lg bg-carbon-800 p-3 text-ice-white"
              />
            </label>
            <label className="grid gap-1 text-sm text-carbon-200">
              Destino
              <input
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="rounded-lg bg-carbon-800 p-3 text-ice-white"
              />
            </label>
            <label className="grid gap-1 text-sm text-carbon-200">
              Transportadora (opcional)
              <input
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                className="rounded-lg bg-carbon-800 p-3 text-ice-white"
              />
            </label>
            <label className="grid gap-1 text-sm text-carbon-200">
              Volumes
              <input
                type="number"
                min={1}
                max={10000}
                required
                value={volumeCount}
                onChange={(event) => setVolumeCount(Number(event.target.value))}
                className="rounded-lg bg-carbon-800 p-3 text-ice-white"
              />
            </label>
            <button
              disabled={busy || !eligible.length}
              className="rounded-lg bg-carmine-core px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              Preparar
            </button>
          </form>
        </section>
      )}
      {canRead && (
        <section aria-labelledby="shipments-heading" className="space-y-3">
          <h2 id="shipments-heading" className="text-xl font-semibold text-ice-white">
            Expedições
          </h2>
          {!shipments.length && (
            <p className="text-sm text-carbon-300">Nenhum romaneio registrado.</p>
          )}
          {shipments.map((shipment) => (
            <article key={shipment.id} className="rounded-xl bg-carbon-900 p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-ice-white">
                    Romaneio #{shipment.number}
                  </h3>
                  <p className="mt-1 text-sm text-carbon-300">
                    {shipment.origin} → {shipment.destination}
                  </p>
                  <p className="text-sm text-carbon-300">
                    {shipment.items.length} item(ns) · {shipment.volumeCount} volume(s) ·{" "}
                    {shipment.carrier || "Transportadora não informada"}
                  </p>
                </div>
                <span className="rounded-full bg-carbon-800 px-3 py-1 text-sm text-ice-white">
                  {shipment.status}
                </span>
              </div>
              {shipment.manifestHash && (
                <p className="mt-3 break-all text-xs text-carbon-400">
                  SHA-256 do romaneio: {shipment.manifestHash}
                </p>
              )}
              <details className="mt-4 text-sm text-carbon-200">
                <summary className="cursor-pointer font-medium text-ice-white">
                  Composição do romaneio
                </summary>
                <ul className="mt-3 space-y-2">
                  {shipment.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap justify-between gap-2 border-t border-carbon-700 pt-2"
                    >
                      <span>Item {item.salesOrderItemId.slice(0, 8)}</span>
                      <span>
                        {item.quantity} {item.unit} ·{" "}
                        {Number(item.weightKg).toLocaleString("pt-BR")} kg bruto
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
              <div className="mt-4 flex flex-wrap gap-2">
                {canDispatch && shipment.status === "preparada" && (
                  <button
                    disabled={busy}
                    className="rounded-lg bg-carmine-core px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    onClick={() => {
                      const key = crypto.randomUUID();
                      void run(
                        () => api(`/api/shipments/${shipment.id}/dispatch`, { key }),
                        "Despacho registrado."
                      );
                    }}
                  >
                    Despachar
                  </button>
                )}
                {canDispatch && shipment.status === "despachada" && (
                  <button
                    disabled={busy}
                    className="rounded-lg bg-carbon-700 px-4 py-2 text-sm text-ice-white disabled:opacity-50"
                    onClick={() => {
                      void run(
                        () =>
                          api(`/api/shipments/${shipment.id}/deliver`, {
                            occurredAt: new Date().toISOString(),
                          }),
                        "Entrega registrada manualmente."
                      );
                    }}
                  >
                    Registrar entrega
                  </button>
                )}
                {canTrack && ["despachada", "entregue"].includes(shipment.status) && (
                  <button
                    disabled={busy}
                    className="rounded-lg bg-carbon-700 px-4 py-2 text-sm text-ice-white disabled:opacity-50"
                    onClick={() => {
                      setEditingEventId(editingEventId === shipment.id ? null : shipment.id);
                      setEventType(shipment.status === "entregue" ? "correcao" : "");
                    }}
                  >
                    {shipment.status === "entregue" ? "Registrar correção" : "Registrar evento"}
                  </button>
                )}
              </div>
              {editingEventId === shipment.id && (
                <form
                  className="mt-4 grid gap-3 border-t border-carbon-700 pt-4 md:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(
                      () =>
                        api(`/api/shipments/${shipment.id}/event`, {
                          type: eventType,
                          location: eventLocation || undefined,
                          evidenceRef: eventEvidence || undefined,
                          eta: eventEta ? new Date(eventEta).toISOString() : undefined,
                          occurredAt: new Date().toISOString(),
                        }),
                      "Evento manual registrado."
                    );
                    setEditingEventId(null);
                    setEventType("");
                    setEventLocation("");
                    setEventEvidence("");
                    setEventEta("");
                  }}
                >
                  <label className="grid gap-1 text-sm text-carbon-200">
                    Tipo do evento
                    <input
                      required
                      maxLength={40}
                      value={eventType}
                      onChange={(event) => setEventType(event.target.value)}
                      className="rounded-lg bg-carbon-800 p-3 text-ice-white"
                    />
                  </label>
                  <label className="grid gap-1 text-sm text-carbon-200">
                    Localização (opcional)
                    <input
                      maxLength={500}
                      value={eventLocation}
                      onChange={(event) => setEventLocation(event.target.value)}
                      className="rounded-lg bg-carbon-800 p-3 text-ice-white"
                    />
                  </label>
                  <label className="grid gap-1 text-sm text-carbon-200">
                    Evidência (referência opcional)
                    <input
                      maxLength={500}
                      value={eventEvidence}
                      onChange={(event) => setEventEvidence(event.target.value)}
                      className="rounded-lg bg-carbon-800 p-3 text-ice-white"
                    />
                  </label>
                  <label className="grid gap-1 text-sm text-carbon-200">
                    ETA estimada (opcional)
                    <input
                      type="datetime-local"
                      value={eventEta}
                      onChange={(event) => setEventEta(event.target.value)}
                      className="rounded-lg bg-carbon-800 p-3 text-ice-white"
                    />
                  </label>
                  <button
                    disabled={busy}
                    className="rounded-lg bg-carmine-core px-4 py-2 font-semibold text-white disabled:opacity-50"
                  >
                    Salvar evento
                  </button>
                </form>
              )}
              {!!shipment.events.length && (
                <ol className="mt-4 space-y-1 border-t border-carbon-700 pt-4 text-sm text-carbon-300">
                  {shipment.events.map((event) => (
                    <li key={event.id}>
                      {new Date(event.occurredAt).toLocaleString("pt-BR")} · {event.type} · fonte{" "}
                      {event.source}
                      {event.eta &&
                        ` · ${event.etaStatus}: ${new Date(event.eta).toLocaleDateString("pt-BR")}`}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))}
        </section>
      )}
      {canTrack && (
        <section className="rounded-xl bg-carbon-900 p-5 md:p-7" aria-labelledby="import-heading">
          <h2 id="import-heading" className="text-xl font-semibold text-ice-white">
            Importações
          </h2>
          <p className="mt-2 text-sm text-carbon-300">
            Marcos manuais. ETA vencida indica atraso estimado, sem ajuste automático do prazo.
          </p>
          <form onSubmit={addImport} className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm text-carbon-200">
              Pedido de compra
              <select
                required
                value={purchaseOrderId}
                onChange={(e) => setPurchaseOrderId(e.target.value)}
                className="rounded-lg bg-carbon-800 p-3 text-ice-white"
              >
                <option value="">Selecione</option>
                {importOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.number ? `Pedido #${order.number}` : `Rascunho ${order.id.slice(0, 8)}`}{" "}
                    · {order.status}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-carbon-200">
              Referência
              <input
                required
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="rounded-lg bg-carbon-800 p-3 text-ice-white"
              />
            </label>
            <label className="grid gap-1 text-sm text-carbon-200">
              Marco
              <input
                required
                value={milestone}
                onChange={(e) => setMilestone(e.target.value)}
                className="rounded-lg bg-carbon-800 p-3 text-ice-white"
              />
            </label>
            <label className="grid gap-1 text-sm text-carbon-200">
              ETA (opcional)
              <input
                type="datetime-local"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
                className="rounded-lg bg-carbon-800 p-3 text-ice-white"
              />
            </label>
            <button
              disabled={busy}
              className="rounded-lg bg-carmine-core px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              Registrar marco
            </button>
          </form>
          <ul className="mt-6 space-y-2">
            {imports.map((row) => (
              <li key={row.id} className="border-t border-carbon-700 pt-3 text-sm text-carbon-200">
                <strong>{row.milestone}</strong> · {row.reference} · fonte {row.source} ·{" "}
                {row.etaStatus}
                {row.eta && ` (${new Date(row.eta).toLocaleString("pt-BR")})`}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
