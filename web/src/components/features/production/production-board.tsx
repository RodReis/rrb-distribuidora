"use client";

import * as React from "react";
import { Factory, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Breadcrumbs } from "@/components/shared/breadcrumbs";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Capability =
  | "production.read"
  | "production.release"
  | "production.report"
  | "production.consume"
  | "production.close"
  | "production.approve_loss";
type Source = {
  id: string;
  type: "lot" | "remnant";
  lotNumber: string | null;
  remnantCode: string | null;
  availableQty: string;
  unit: string;
  warehouseName: string;
};
type Item = {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  unit: string;
  plannedQty: string;
  completedQty: string;
  cancelledQty: string;
  operationId: string;
  operationStatus: string;
  operatorId: string | null;
  specSnapshot: Record<string, unknown>;
  availableSources?: Source[];
};
type Order = {
  id: string;
  salesOrderId: string;
  number: number;
  salesOrderNumber: string;
  quoteNumber: number;
  customerName: string;
  status: string;
  priority: number;
  dueAt: string | null;
  version: number;
  items: Item[];
  reports: Record<string, number>;
  pendingProduction?: boolean;
};
type QueueEntry = { orderId: string; envelope: Record<string, unknown>; createdAt: string };
type Operator = { id: string; name: string; role: string };
type DraftLine = { sourceId: string; quantity: string };
type DraftResidual = {
  enabled: boolean;
  thicknessMm: string;
  widthMm: string;
  lengthMm: string;
  diameterMm: string;
  measuredWeightKg: string;
  locationAddress: string;
};
const emptyResidual = (): DraftResidual => ({
  enabled: false,
  thicknessMm: "",
  widthMm: "",
  lengthMm: "",
  diameterMm: "",
  measuredWeightKg: "",
  locationAddress: "",
});

const QUEUE_PREFIX = "metalagents:production:queue:v1:";
const DEVICE_KEY = "metalagents:production:device:v1";
const SEQUENCE_KEY = "metalagents:production:sequence:v1";
const ORDER_CACHE_PREFIX = "metalagents:production:orders:v1:";
const labels: Record<string, string> = {
  planejada: "Planejada",
  liberada: "Liberada",
  em_corte: "Em corte",
  pausada: "Pausada",
  bloqueada_qualidade: "Bloqueada",
  concluida: "Concluída",
  cancelada: "Cancelada",
  pendente: "Pendente",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  conflito: "Conflito",
  aplicado: "Aplicado",
  rejeitado: "Rejeitado",
};
const qty = (value: string | number, unit = "") =>
  `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;
const allowed = (caps: Capability[], cap: Capability) => caps.includes(cap);

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(body.error || `Falha HTTP ${response.status}`, response.status);
  return body.data as T;
}
function key(operator: string) {
  return `${QUEUE_PREFIX}${operator}`;
}
function readQueue(operator: string): QueueEntry[] {
  try {
    return JSON.parse(localStorage.getItem(key(operator)) || "[]");
  } catch {
    return [];
  }
}
function writeQueue(operator: string, queue: QueueEntry[]) {
  localStorage.setItem(key(operator), JSON.stringify(queue));
}
function getDeviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

export function ProductionBoard({
  operator,
  capabilities,
}: {
  operator: Operator;
  capabilities: Capability[];
}) {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [details, setDetails] = React.useState<Record<string, Order>>({});
  const [queue, setQueue] = React.useState<QueueEntry[]>([]);
  const [online, setOnline] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [filter, setFilter] = React.useState("ativas");
  const [reportOrder, setReportOrder] = React.useState<Order | null>(null);
  const [reportItem, setReportItem] = React.useState<Item | null>(null);
  const [completedQty, setCompletedQty] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>([{ sourceId: "", quantity: "" }]);
  const [residuals, setResiduals] = React.useState<DraftResidual[]>([emptyResidual()]);
  const [lossReason, setLossReason] = React.useState("");
  const [transitionOrder, setTransitionOrder] = React.useState<Order | null>(null);
  const [transitionTarget, setTransitionTarget] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [partial, setPartial] = React.useState(false);
  const [history, setHistory] = React.useState<{ order: Order; reports: any[] } | null>(null);
  const autoSyncAttempted = React.useRef(false);

  const refresh = React.useCallback(
    async (showLoading = false) => {
      if (showLoading) setLoading(true);
      try {
        const data = await api<Order[]>("/api/production/orders");
        setOrders(data);
        localStorage.setItem(`${ORDER_CACHE_PREFIX}${operator.id}`, JSON.stringify(data));
        setOnline(true);
        setError("");
      } catch (cause) {
        if (cause instanceof ApiError) {
          setOnline(true);
          setOrders([]);
          setError(cause.message);
          return;
        }
        setOnline(false);
        if (showLoading) {
          try {
            setOrders(
              JSON.parse(localStorage.getItem(`${ORDER_CACHE_PREFIX}${operator.id}`) || "[]")
            );
          } catch {
            setOrders([]);
          }
          setError(cause instanceof Error ? cause.message : "Servidor indisponível.");
        }
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [operator.id]
  );

  React.useEffect(() => {
    setOnline(navigator.onLine);
    setQueue(readQueue(operator.id));
    void refresh(true);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/production-sw.js").catch(() => undefined);
    const onOnline = () => {
      setOnline(true);
      void refresh();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [operator.id, refresh]);

  const syncQueue = React.useCallback(async () => {
    if (!navigator.onLine || !queue.length || busy) return;
    setBusy(true);
    setError("");
    const ordered = [...queue].sort(
      (a, b) => Number(a.envelope.sequence) - Number(b.envelope.sequence)
    );
    const remaining: QueueEntry[] = [];
    const currentVersions = new Map<string, number>();
    for (let index = 0; index < ordered.length; index += 1) {
      const entry = ordered[index];
      let knownReport: any;
      try {
        const serverReports = await api<any[]>(`/api/production/orders/${entry.orderId}/reports`);
        knownReport = serverReports.find(
          (report) => report.clientOperationId === entry.envelope.clientOperationId
        );
      } catch {
        remaining.push(...ordered.slice(index));
        setError(
          "Não foi possível consultar a fila no servidor. Apontamentos locais foram preservados."
        );
        break;
      }
      const version = currentVersions.get(entry.orderId);
      if (version !== undefined && !knownReport) entry.envelope.expectedOrderVersion = version;
      try {
        const accepted =
          knownReport ??
          (await api<any>(`/api/production/orders/${entry.orderId}/reports`, {
            method: "POST",
            body: JSON.stringify(entry.envelope),
          }));
        if (accepted.reconciliationStatus === "aplicado" && accepted.resultingOrderVersion)
          currentVersions.set(entry.orderId, accepted.resultingOrderVersion);
        else if (
          ["conflito", "aguardando_aprovacao", "aprovado", "rejeitado"].includes(
            accepted.reconciliationStatus
          )
        )
          currentVersions.delete(entry.orderId);
      } catch (cause) {
        remaining.push(...ordered.slice(index));
        setError(cause instanceof Error ? cause.message : "Falha ao sincronizar. Fila preservada.");
        break;
      }
      writeQueue(operator.id, ordered.slice(index + 1));
    }
    writeQueue(operator.id, remaining);
    setQueue(remaining);
    await refresh();
    if (!remaining.length)
      setNotice("Fila sincronizada. Conflitos e aprovações estão no histórico da ordem.");
    setBusy(false);
  }, [busy, operator.id, queue, refresh]);

  React.useEffect(() => {
    if (!online) {
      autoSyncAttempted.current = false;
      return;
    }
    if (queue.length && !autoSyncAttempted.current) {
      autoSyncAttempted.current = true;
      void syncQueue();
    }
  }, [online, queue.length, syncQueue]);

  const loadOrder = async (order: Order) => {
    if (!online) return details[order.id] ?? null;
    setBusy(true);
    setError("");
    try {
      const data = await api<Order>(`/api/production/orders/${order.id}`);
      setDetails((old) => ({ ...old, [order.id]: data }));
      return data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar ordem.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const transition = async (
    order: Order,
    target: string,
    reasonText = "",
    cancelledItems?: unknown[]
  ) => {
    if (!online) {
      setError("Transição exige conexão. Apontamentos continuam disponíveis offline.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (order.id.startsWith("pending:")) {
        await api("/api/production/orders", {
          method: "POST",
          body: JSON.stringify({ salesOrderId: order.salesOrderId }),
        });
      } else {
        await api(`/api/production/orders/${order.id}/transition`, {
          method: "POST",
          body: JSON.stringify({
            target,
            expectedVersion: order.version,
            reason: reasonText,
            cancelledItems,
          }),
        });
      }
      setTransitionOrder(null);
      setTransitionTarget("");
      setReason("");
      setPartial(false);
      setNotice(`OP ${order.number}: ${labels[target]}.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Transição não concluída.");
    } finally {
      setBusy(false);
    }
  };

  const openReport = async (order: Order, item: Item) => {
    const full = await loadOrder(order);
    if (!full) return;
    const current = full.items.find((candidate) => candidate.id === item.id);
    if (!current) return;
    setReportOrder(full);
    setReportItem(current);
    setCompletedQty("");
    setLossReason("");
    setLines([{ sourceId: current.availableSources?.[0]?.id ?? "", quantity: "" }]);
    setResiduals([emptyResidual()]);
  };

  const saveReport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reportOrder || !reportItem) return;
    const used = lines.filter((line) => line.sourceId && Number(line.quantity) > 0);
    if (!used.length) {
      setError("Informe material reservado consumido.");
      return;
    }
    const usedIndexes = lines
      .map((line, index) => (line.sourceId && Number(line.quantity) > 0 ? index : -1))
      .filter((index) => index >= 0);
    let residualPayload: Record<string, unknown>[];
    try {
      residualPayload = usedIndexes.flatMap((lineIndex, consumptionIndex) => {
        const measure = residuals[lineIndex];
        if (!measure?.enabled) return [];
        const payload = {
          clientOperationId: crypto.randomUUID(),
          consumptionIndex,
          thicknessMm: Number(measure.thicknessMm),
          widthMm: measure.widthMm ? Number(measure.widthMm) : undefined,
          lengthMm: measure.lengthMm ? Number(measure.lengthMm) : undefined,
          diameterMm: measure.diameterMm ? Number(measure.diameterMm) : undefined,
          measuredWeightKg: Number(measure.measuredWeightKg),
          locationAddress: measure.locationAddress.trim(),
        };
        if (!(
          payload.thicknessMm > 0 &&
          payload.measuredWeightKg > 0 &&
          (payload.widthMm || payload.lengthMm || payload.diameterMm) &&
          payload.locationAddress
        ))
          throw new Error(
            "Retalho residual exige espessura, peso, localização e ao menos outra dimensão medida."
          );
        return [payload];
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Medidas do residual inválidas.");
      return;
    }
    const sequence = Number(localStorage.getItem(SEQUENCE_KEY) || "0") + 1;
    localStorage.setItem(SEQUENCE_KEY, String(sequence));
    const envelope = {
      clientOperationId: crypto.randomUUID(),
      deviceId: getDeviceId(),
      sequence,
      payloadVersion: 1,
      expectedOrderVersion: reportOrder.version,
      operatorId: operator.id,
      localOccurredAt: new Date().toISOString(),
      operationId: reportItem.operationId,
      payload: {
        kind: "production",
        orderItemId: reportItem.id,
        completedQty: Number(completedQty),
        consumptions: used.map((line) => {
          const source = reportItem.availableSources?.find(
            (candidate) => candidate.id === line.sourceId
          );
          return {
            sourceType: source?.type,
            sourceId: line.sourceId,
            quantity: Number(line.quantity),
          };
        }),
        residuals: residualPayload,
        lossReason: lossReason.trim() || undefined,
      },
    };
    const next = [
      ...queue,
      { orderId: reportOrder.id, envelope, createdAt: new Date().toISOString() },
    ];
    writeQueue(operator.id, next);
    setQueue(next);
    setReportOrder(null);
    setReportItem(null);
    if (online) {
      setBusy(true);
      try {
        await api(`/api/production/orders/${reportOrder.id}/reports`, {
          method: "POST",
          body: JSON.stringify(envelope),
        });
        const remaining = next.filter(
          (entry) => entry.envelope.clientOperationId !== envelope.clientOperationId
        );
        writeQueue(operator.id, remaining);
        setQueue(remaining);
        await refresh();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Falha de sincronização. Apontamento ficou na fila."
        );
      } finally {
        setBusy(false);
      }
    } else
      setNotice(
        "Apontamento salvo localmente. Sincroniza com a mesma conta quando houver conexão."
      );
  };

  const openHistory = async (order: Order) => {
    const full = await loadOrder(order);
    if (full) setHistory({ order: full, reports: (full as any).reports ?? [] });
  };
  const actOnReport = async (order: Order, reportId: string, action: string) => {
    if (!online) return;
    const justification =
      action === "apply"
        ? ""
        : (window.prompt(
            action === "approve" ? "Justificativa da aprovação:" : "Motivo da rejeição:"
          ) ?? "");
    if (action !== "apply" && justification.trim().length < 5) return;
    setBusy(true);
    try {
      await api(`/api/production/orders/${order.id}/reports/${reportId}/${action}`, {
        method: "POST",
        body: JSON.stringify(action === "apply" ? {} : { reason: justification }),
      });
      await openHistory(order);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ação não concluída.");
    } finally {
      setBusy(false);
    }
  };

  const visible = orders.filter(
    (order) =>
      filter === "todas" ||
      (filter === "ativas"
        ? !["concluida", "cancelada"].includes(order.status)
        : order.status === filter)
  );
  const pendingCount = orders.reduce(
    (sum, order) =>
      sum +
      (order.reports.pendente ?? 0) +
      (order.reports.conflito ?? 0) +
      (order.reports.aguardando_aprovacao ?? 0) +
      (order.reports.aprovado ?? 0),
    0
  );

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 px-4 py-5 md:px-6">
      <Breadcrumbs
        items={[
          { label: "OP-MODULES", href: "/dashboard" },
          { label: "Produção", href: "/producao" },
        ]}
      />
      <PageHeader
        title="Produção"
        description="Ordens rastreáveis, apontamento idempotente e consumo por reserva."
      />
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: "Ordens abertas",
            value: orders.filter((o) => !["concluida", "cancelada"].includes(o.status)).length,
          },
          { label: "Em corte", value: orders.filter((o) => o.status === "em_corte").length },
          { label: "Apontamentos para tratar", value: pendingCount },
        ].map((metric) => (
          <div
            key={metric.label}
            className="rounded border border-carbon-800 bg-carbon-900 px-4 py-3"
          >
            <p className="text-xs uppercase tracking-wider text-titanium-muted">{metric.label}</p>
            <p className="mt-1 font-mono text-2xl">{metric.value}</p>
          </div>
        ))}
      </section>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-carbon-800 bg-carbon-900 p-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span
            className={`flex items-center gap-2 ${online ? "text-emerald-400" : "text-amber-300"}`}
          >
            {online ? <Wifi size={16} /> : <WifiOff size={16} />} {online ? "Conectado" : "Offline"}
          </span>
          <span className="text-titanium-light">
            {operator.name} · fila local {queue.length}
          </span>
        </div>
        <div className="flex gap-2">
          {queue.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              disabled={!online || busy}
              onClick={() => void syncQueue()}
            >
              <RefreshCw size={14} className="mr-2" />
              Sincronizar fila
            </Button>
          )}
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void refresh(true)}>
            <RefreshCw size={14} className="mr-2" />
            Atualizar
          </Button>
        </div>
      </section>
      {!online && (
        <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          Fila fica neste navegador, vinculada a {operator.name}. Servidor rejeita sincronização por
          outra conta. Não limpe os dados do site antes de sincronizar.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded border border-signal-risk/40 bg-signal-risk/10 px-4 py-3 text-sm text-red-100"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100"
        >
          {notice}
        </div>
      )}
      <div className="w-full max-w-xs">
        <label className="mb-1 block text-xs text-titanium-muted">Ordens</label>
        <Select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="ativas">Abertas</option>
          <option value="todas">Todas</option>
          {[
            "planejada",
            "liberada",
            "em_corte",
            "pausada",
            "bloqueada_qualidade",
            "concluida",
            "cancelada",
          ].map((status) => (
            <option key={status} value={status}>
              {labels[status]}
            </option>
          ))}
        </Select>
      </div>
      {loading ? (
        <div className="rounded border border-carbon-800 bg-carbon-900 p-8 text-center text-sm text-titanium-muted">
          Carregando ordens…
        </div>
      ) : !visible.length ? (
        <div className="rounded border border-dashed border-carbon-700 bg-carbon-900/50 p-10 text-center">
          <Factory className="mx-auto mb-3 text-titanium-muted" />
          <p className="text-sm text-titanium-light">Nenhuma ordem neste filtro.</p>
          <p className="mt-1 text-xs text-titanium-muted">
            Pedidos aprovados geram OP automaticamente na conversão.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          {visible.map((order) => (
            <article
              key={order.id}
              className="overflow-hidden rounded border border-carbon-800 bg-carbon-900"
            >
              <header className="flex flex-wrap items-center justify-between gap-4 border-b border-carbon-800 p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-mono text-lg">
                      {order.pendingProduction
                        ? `Pedido PV ${order.salesOrderNumber}`
                        : `OP-${String(order.number).padStart(5, "0")}`}
                    </h2>
                    <span className="rounded border border-carbon-700 px-2 py-0.5 text-xs text-titanium-light">
                      {order.pendingProduction
                        ? "Aguardando OP"
                        : (labels[order.status] ?? order.status)}
                    </span>
                    {!order.pendingProduction && (
                      <span className="text-xs text-titanium-muted">v{order.version}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-titanium-light">
                    PV {order.salesOrderNumber} · orçamento {order.quoteNumber} ·{" "}
                    {order.customerName}
                  </p>
                </div>
                <p className="text-right text-xs text-titanium-muted">
                  {order.dueAt
                    ? `Prazo ${new Date(order.dueAt).toLocaleDateString("pt-BR")}`
                    : "Sem prazo definido"}
                  <br />
                  Prioridade {order.priority}
                </p>
              </header>
              <div className="divide-y divide-carbon-800">
                {order.items.map((item) => (
                  <div key={item.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.sku} · {item.productName}
                        </p>
                        <p className="mt-1 text-xs text-titanium-muted">
                          Plano {qty(item.plannedQty, item.unit)} · concluído{" "}
                          {qty(item.completedQty, item.unit)} · cancelado{" "}
                          {qty(item.cancelledQty, item.unit)}
                        </p>
                        <p className="mt-1 text-xs text-titanium-dark">
                          {Object.entries(item.specSnapshot)
                            .filter(
                              ([key, value]) =>
                                [
                                  "geometryType",
                                  "thicknessMm",
                                  "widthMm",
                                  "lengthMm",
                                  "diameterMm",
                                  "processType",
                                ].includes(key) && value != null
                            )
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                    {order.status === "em_corte" &&
                      item.operationStatus !== "concluida" &&
                      item.operationStatus !== "cancelada" && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded bg-carbon-950/70 px-3 py-2">
                          <span className="text-xs text-titanium-light">
                            Operação {labels[item.operationStatus] ?? item.operationStatus}
                            {item.operatorId === operator.id
                              ? " · sua sessão"
                              : item.operatorId
                                ? " · outro operador"
                                : ""}{" "}
                            · máquina opcional
                          </span>
                          {allowed(capabilities, "production.report") && (
                            <Button
                              size="sm"
                              variant="terminal"
                              disabled={
                                !online ||
                                busy ||
                                (item.operationStatus === "em_execucao" &&
                                  item.operatorId !== operator.id) ||
                                (item.operationStatus === "pausada" &&
                                  item.operatorId !== operator.id)
                              }
                              onClick={() => void openReport(order, item)}
                            >
                              {item.operatorId && item.operatorId !== operator.id
                                ? "Operação atribuída a outra pessoa"
                                : "Registrar produção e consumo"}
                            </Button>
                          )}
                        </div>
                      )}
                  </div>
                ))}
              </div>
              <footer className="flex flex-wrap gap-2 border-t border-carbon-800 p-4">
                {order.pendingProduction && allowed(capabilities, "production.release") && (
                  <Button
                    size="sm"
                    disabled={!online || busy}
                    onClick={() => void transition(order, "liberada")}
                  >
                    Gerar OP
                  </Button>
                )}
                {order.pendingProduction && (
                  <span className="rounded border border-carmine-core/30 px-2 py-1 text-xs text-carmine-signal">
                    Aguardando geração de OP
                  </span>
                )}
                {order.status === "planejada" && allowed(capabilities, "production.release") && (
                  <Button
                    size="sm"
                    disabled={!online || busy}
                    onClick={() => void transition(order, "liberada")}
                  >
                    Liberar
                  </Button>
                )}
                {order.status === "bloqueada_qualidade" &&
                  allowed(capabilities, "production.release") && (
                    <Button
                      size="sm"
                      disabled={!online || busy}
                      onClick={() => {
                        setTransitionOrder(order);
                        setTransitionTarget("liberada");
                      }}
                    >
                      Retomar
                    </Button>
                  )}
                {["liberada", "pausada"].includes(order.status) &&
                  allowed(capabilities, "production.report") && (
                    <Button
                      size="sm"
                      disabled={!online || busy}
                      onClick={() => void transition(order, "em_corte")}
                    >
                      {order.status === "pausada" ? "Retomar corte" : "Iniciar corte"}
                    </Button>
                  )}
                {order.status === "em_corte" && allowed(capabilities, "production.report") && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!online || busy}
                    onClick={() => {
                      setTransitionOrder(order);
                      setTransitionTarget("pausada");
                    }}
                  >
                    Pausar
                  </Button>
                )}
                {["em_corte", "pausada"].includes(order.status) &&
                  allowed(capabilities, "production.close") && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!online || busy}
                      onClick={() => {
                        setTransitionOrder(order);
                        setTransitionTarget("concluida");
                      }}
                    >
                      Encerrar OP
                    </Button>
                  )}
                {["liberada", "em_corte", "pausada"].includes(order.status) &&
                  allowed(capabilities, "production.close") && (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={!online || busy}
                      onClick={() => {
                        setTransitionOrder(order);
                        setTransitionTarget("bloqueada_qualidade");
                      }}
                    >
                      Bloqueio
                    </Button>
                  )}
                {!["concluida", "cancelada"].includes(order.status) &&
                  allowed(capabilities, "production.close") && (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={!online || busy}
                      onClick={() => {
                        setTransitionOrder(order);
                        setTransitionTarget("cancelada");
                      }}
                    >
                      Cancelar OP
                    </Button>
                  )}
                {allowed(capabilities, "production.read") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void openHistory(order)}
                  >
                    Apontamentos ({Object.values(order.reports).reduce((a, b) => a + b, 0)})
                  </Button>
                )}
              </footer>
            </article>
          ))}
        </section>
      )}

      {reportOrder && reportItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3">
          <form
            onSubmit={saveReport}
            className="my-auto w-full max-w-2xl space-y-4 rounded-lg border border-carbon-700 bg-carbon-900 p-5 shadow-2xl"
          >
            <div>
              <p className="font-mono text-xs uppercase tracking-widest text-carmine-signal">
                OP-{String(reportOrder.number).padStart(5, "0")}
              </p>
              <h2 className="mt-1 text-xl font-semibold">Apontar produção</h2>
              <p className="mt-1 text-sm text-titanium-light">
                {reportItem.sku} · saldo{" "}
                {qty(
                  Number(reportItem.plannedQty) -
                    Number(reportItem.completedQty) -
                    Number(reportItem.cancelledQty),
                  reportItem.unit
                )}
              </p>
            </div>
            <label className="block text-xs text-titanium-light">
              Quantidade produzida
              <Input
                required
                type="number"
                min="0.0001"
                step="0.0001"
                max={
                  Number(reportItem.plannedQty) -
                  Number(reportItem.completedQty) -
                  Number(reportItem.cancelledQty)
                }
                value={completedQty}
                onChange={(event) => setCompletedQty(event.target.value)}
                className="mt-1"
              />
            </label>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Material reservado consumido</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setLines((rows) => [...rows, { sourceId: "", quantity: "" }]);
                    setResiduals((rows) => [...rows, emptyResidual()]);
                  }}
                >
                  Adicionar origem
                </Button>
              </div>
              {lines.map((line, index) => (
                <div key={index} className="space-y-2 rounded border border-carbon-800 p-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
                    <Select
                      value={line.sourceId}
                      onChange={(event) =>
                        setLines((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, sourceId: event.target.value } : row
                          )
                        )
                      }
                    >
                      <option value="">Selecione material reservado</option>
                      {(reportItem.availableSources ?? []).map((source) => (
                        <option key={`${source.type}:${source.id}`} value={source.id}>
                          {source.type === "lot"
                            ? `Lote ${source.lotNumber}`
                            : `Retalho ${source.remnantCode}`}{" "}
                          · {source.warehouseName} · {qty(source.availableQty, source.unit)}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={line.quantity}
                      onChange={(event) =>
                        setLines((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, quantity: event.target.value } : row
                          )
                        )
                      }
                      placeholder={`Qtd (${reportItem.unit})`}
                      aria-label={`Quantidade de material ${index + 1}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={lines.length === 1}
                      onClick={() => {
                        setLines((rows) => rows.filter((_, i) => i !== index));
                        setResiduals((rows) => rows.filter((_, i) => i !== index));
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-titanium-light">
                    <input
                      type="checkbox"
                      checked={residuals[index]?.enabled ?? false}
                      onChange={(event) =>
                        setResiduals((rows) =>
                          rows.map((row, i) =>
                            i === index ? { ...row, enabled: event.target.checked } : row
                          )
                        )
                      }
                    />
                    Registrar retalho residual medido desta origem
                  </label>
                  {residuals[index]?.enabled && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Espessura mm"
                        aria-label="Espessura residual"
                        value={residuals[index].thicknessMm}
                        onChange={(e) =>
                          setResiduals((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, thicknessMm: e.target.value } : row
                            )
                          )
                        }
                      />
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Largura mm"
                        aria-label="Largura residual"
                        value={residuals[index].widthMm}
                        onChange={(e) =>
                          setResiduals((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, widthMm: e.target.value } : row
                            )
                          )
                        }
                      />
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Comprimento mm"
                        aria-label="Comprimento residual"
                        value={residuals[index].lengthMm}
                        onChange={(e) =>
                          setResiduals((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, lengthMm: e.target.value } : row
                            )
                          )
                        }
                      />
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="Diâmetro mm"
                        aria-label="Diâmetro residual"
                        value={residuals[index].diameterMm}
                        onChange={(e) =>
                          setResiduals((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, diameterMm: e.target.value } : row
                            )
                          )
                        }
                      />
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        placeholder="Peso medido kg"
                        aria-label="Peso residual medido"
                        value={residuals[index].measuredWeightKg}
                        onChange={(e) =>
                          setResiduals((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, measuredWeightKg: e.target.value } : row
                            )
                          )
                        }
                      />
                      <Input
                        maxLength={50}
                        placeholder="Localização"
                        aria-label="Localização do residual"
                        value={residuals[index].locationAddress}
                        onChange={(e) =>
                          setResiduals((rows) =>
                            rows.map((row, i) =>
                              i === index ? { ...row, locationAddress: e.target.value } : row
                            )
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <label className="block text-xs text-titanium-light">
              Justificativa de perda (se consumo &gt; produção)
              <Input
                minLength={5}
                maxLength={500}
                value={lossReason}
                onChange={(event) => setLossReason(event.target.value)}
                placeholder="Exigida e aprovada antes da baixa"
                className="mt-1"
              />
            </label>
            {!online && (
              <p className="rounded bg-amber-500/10 p-3 text-xs text-amber-100">
                Salva na fila local. Baixa só ocorre após validação online e aprovação da perda.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setReportOrder(null)}>
                Voltar
              </Button>
              <Button type="submit">Salvar apontamento</Button>
            </div>
          </form>
        </div>
      )}

      {transitionOrder && transitionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const cancellations =
                transitionTarget === "concluida" && partial
                  ? transitionOrder.items
                      .filter(
                        (item) =>
                          Number(item.plannedQty) -
                            Number(item.completedQty) -
                            Number(item.cancelledQty) >
                          0
                      )
                      .map((item) => ({
                        itemId: item.id,
                        quantity:
                          Number(item.plannedQty) -
                          Number(item.completedQty) -
                          Number(item.cancelledQty),
                        reason,
                      }))
                  : undefined;
              void transition(transitionOrder, transitionTarget, reason, cancellations);
            }}
            className="w-full max-w-lg space-y-4 rounded-lg border border-carbon-700 bg-carbon-900 p-5"
          >
            <h2 className="text-xl font-semibold">
              {transitionTarget === "concluida" ? "Encerrar ordem" : labels[transitionTarget]}
            </h2>
            <p className="text-sm text-titanium-light">
              Justificativa obrigatória. Encerramento parcial cancela formalmente todo saldo aberto.
            </p>
            {transitionTarget === "concluida" && (
              <label className="flex gap-2 text-sm text-titanium-light">
                <input
                  type="checkbox"
                  checked={partial}
                  onChange={(event) => setPartial(event.target.checked)}
                />
                Cancelar saldo não produzido com esta justificativa
              </label>
            )}
            <label className="block text-xs text-titanium-light">
              Motivo
              <textarea
                required
                minLength={5}
                maxLength={500}
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded border border-carbon-700 bg-carbon-950 p-3 text-sm text-ice-white"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setTransitionOrder(null)}>
                Voltar
              </Button>
              <Button
                type="submit"
                variant={
                  transitionTarget === "cancelada" || transitionTarget === "bloqueada_qualidade"
                    ? "danger"
                    : "primary"
                }
              >
                {labels[transitionTarget]}
              </Button>
            </div>
          </form>
        </div>
      )}

      {history && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3">
          <section className="my-auto w-full max-w-3xl rounded-lg border border-carbon-700 bg-carbon-900 p-5">
            <div className="flex justify-between">
              <div>
                <p className="font-mono text-xs text-carmine-signal">
                  OP-{String(history.order.number).padStart(5, "0")}
                </p>
                <h2 className="mt-1 text-xl font-semibold">Apontamentos</h2>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setHistory(null)}>
                Fechar
              </Button>
            </div>
            <div className="mt-4 max-h-[65vh] space-y-3 overflow-auto">
              {history.reports.length === 0 ? (
                <p className="text-sm text-titanium-muted">Sem apontamentos no servidor.</p>
              ) : (
                history.reports.map((report: any) => (
                  <article
                    key={report.id}
                    className="rounded border border-carbon-700 bg-carbon-950 p-3"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <span>
                        {labels[report.reconciliationStatus] ?? report.reconciliationStatus}
                      </span>
                      <span className="font-mono text-xs text-titanium-muted">
                        {report.clientOperationId.slice(0, 8)} · {report.reporterName}
                      </span>
                    </div>
                    {report.reconciliationReason && (
                      <p className="mt-2 text-xs text-amber-100">{report.reconciliationReason}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {report.reconciliationStatus === "aguardando_aprovacao" &&
                        allowed(capabilities, "production.approve_loss") && (
                          <Button
                            size="sm"
                            disabled={!online || busy}
                            onClick={() => void actOnReport(history.order, report.id, "approve")}
                          >
                            Aprovar perda
                          </Button>
                        )}
                      {report.reconciliationStatus === "aprovado" &&
                        report.reporterId === operator.id &&
                        allowed(capabilities, "production.report") && (
                          <Button
                            size="sm"
                            disabled={!online || busy}
                            onClick={() => void actOnReport(history.order, report.id, "apply")}
                          >
                            Confirmar baixa
                          </Button>
                        )}
                      {["conflito", "aguardando_aprovacao"].includes(report.reconciliationStatus) &&
                        allowed(capabilities, "production.approve_loss") && (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={!online || busy}
                            onClick={() => void actOnReport(history.order, report.id, "resolve")}
                          >
                            Rejeitar
                          </Button>
                        )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
