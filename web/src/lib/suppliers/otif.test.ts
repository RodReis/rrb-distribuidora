import { describe, expect, it } from "vitest";
import {
  buildSupplierPerformance,
  calendarDaysBetween,
  civilDayBounds,
  computeOtifSummary,
  dayKey,
  evaluateDelivery,
  last90CivilDateRange,
  type OtifDeliveryEvent,
  type OtifDeliverySnapshot,
} from "./otif";

const NOW = new Date("2026-11-03T18:00:00.000Z");
const PERIOD = {
  from: new Date("2026-10-01T12:00:00-03:00"),
  to: new Date("2026-10-31T12:00:00-03:00"),
};

let sequence = 0;
function orderId(): string {
  sequence += 1;
  return `00000000-0000-0000-0000-${String(sequence).padStart(12, "0")}`;
}

function at(date: string): string {
  return new Date(`${date}T12:00:00-03:00`).toISOString();
}

function issued(date: string): OtifDeliveryEvent {
  return {
    eventType: "issued",
    itemId: null,
    quantity: null,
    promisedAt: null,
    eventAt: at(date),
    note: null,
  };
}

function promise(
  date: string,
  eventDate = date,
  type: "promise_confirmed" | "promise_revised" = "promise_confirmed"
): OtifDeliveryEvent {
  return {
    eventType: type,
    itemId: null,
    quantity: null,
    promisedAt: at(date),
    eventAt: at(eventDate),
    note: type === "promise_revised" ? "Fornecedor reprogramou a entrega." : null,
  };
}

function received(itemId: string, quantity: number, date: string): OtifDeliveryEvent {
  return {
    eventType: "received",
    itemId,
    quantity,
    promisedAt: null,
    eventAt: at(date),
    note: null,
  };
}

function reversed(itemId: string, quantity: number, date: string): OtifDeliveryEvent {
  return {
    eventType: "receipt_reversed",
    itemId,
    quantity,
    promisedAt: null,
    eventAt: at(date),
    note: "Divergência de documento.",
  };
}

function cancelled(date: string): OtifDeliveryEvent {
  return {
    eventType: "cancelled",
    itemId: null,
    quantity: null,
    promisedAt: null,
    eventAt: at(date),
    note: "Cancelado.",
  };
}

const ITEM_A = "11111111-1111-1111-1111-111111111111";
const ITEM_B = "22222222-2222-2222-2222-222222222222";

function snapshot(
  events: OtifDeliveryEvent[],
  options: { status?: string; items?: { itemId: string; quantityOrdered: number }[] } = {}
): OtifDeliverySnapshot {
  return {
    purchaseOrderId: orderId(),
    number: 1,
    status: options.status ?? "recebido_completo",
    items: options.items ?? [{ itemId: ITEM_A, quantityOrdered: 100 }],
    events,
  };
}

/** Fixture de aceite da SPEC: 4 OTIF, 2 atrasadas, 1 incompleta, 1 sem promessa → 4/7 = 57,14%. */
function acceptanceFixture(): OtifDeliverySnapshot[] {
  const fixture: OtifDeliverySnapshot[] = [];

  for (const day of ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]) {
    fixture.push(
      snapshot([issued("2026-10-01"), promise(day, "2026-10-02"), received(ITEM_A, 100, day)])
    );
  }

  // Atrasadas: completas depois da data prometida.
  fixture.push(
    snapshot([
      issued("2026-10-01"),
      promise("2026-10-10", "2026-10-02"),
      received(ITEM_A, 100, "2026-10-12"),
    ])
  );
  fixture.push(
    snapshot([
      issued("2026-10-01"),
      promise("2026-10-15", "2026-10-02"),
      received(ITEM_A, 100, "2026-10-20"),
    ])
  );

  // Incompleta: recebeu parte e nunca completou.
  fixture.push(
    snapshot(
      [
        issued("2026-10-01"),
        promise("2026-10-18", "2026-10-02"),
        received(ITEM_A, 40, "2026-10-18"),
      ],
      {
        status: "parcialmente_recebido",
      }
    )
  );

  // Sem promessa confirmada: fora do denominador.
  fixture.push(
    snapshot([issued("2026-10-01"), received(ITEM_A, 100, "2026-10-03")], {
      status: "recebido_completo",
    })
  );

  return fixture;
}

describe("OTIF — aceite da SPEC", () => {
  it("calcula 4/7 = 57,14% e mantém a entrega sem promessa fora do denominador", () => {
    const summary = computeOtifSummary({
      deliveries: acceptanceFixture(),
      period: PERIOD,
      now: NOW,
    });

    expect(summary.eligibleCount).toBe(7);
    expect(summary.otifCount).toBe(4);
    expect(summary.lateCount).toBe(2);
    expect(summary.incompleteCount).toBe(1);
    expect(summary.excluded.noPromise).toBe(1);
    expect(summary.otifPct).toBe(57.14);
  });

  it("amostra zero mostra 'sem dados' (null), nunca 0%", () => {
    const summary = computeOtifSummary({ deliveries: [], period: PERIOD, now: NOW });

    expect(summary.eligibleCount).toBe(0);
    expect(summary.otifPct).toBeNull();
  });
});

describe("OTIF — completude e pontualidade", () => {
  it("recebimento parcial não conta como entrega completa", () => {
    const evaluation = evaluateDelivery(
      snapshot([issued("2026-10-01"), promise("2026-10-10"), received(ITEM_A, 60, "2026-10-09")], {
        status: "parcialmente_recebido",
      }),
      { now: NOW }
    );

    expect(evaluation.complete).toBe(false);
    expect(evaluation.situation).toBe("incomplete");
    expect(evaluation.completedAt).toBeNull();
  });

  it("segundo recebimento dentro da promessa completa a entrega e conta OTIF", () => {
    const evaluation = evaluateDelivery(
      snapshot(
        [
          issued("2026-10-01"),
          promise("2026-10-10"),
          received(ITEM_A, 60, "2026-10-05"),
          received(ITEM_A, 40, "2026-10-08"),
        ],
        { status: "recebido_completo" }
      ),
      { now: NOW }
    );

    expect(evaluation.complete).toBe(true);
    expect(evaluation.completedAt?.toISOString()).toBe(at("2026-10-08"));
    expect(evaluation.situation).toBe("otif");
  });

  it("completa só quando todos os itens fecham, com tolerância zero", () => {
    const incomplete = evaluateDelivery(
      snapshot(
        [
          issued("2026-10-01"),
          promise("2026-10-10"),
          received(ITEM_A, 100, "2026-10-05"),
          received(ITEM_B, 49.999, "2026-10-06"),
        ],
        {
          status: "parcialmente_recebido",
          items: [
            { itemId: ITEM_A, quantityOrdered: 100 },
            { itemId: ITEM_B, quantityOrdered: 50 },
          ],
        }
      ),
      { now: NOW }
    );

    expect(incomplete.complete).toBe(false);
    expect(incomplete.itemsComplete).toBe(1);
  });

  it("estorno depois da conclusão devolve a entrega para incompleta", () => {
    const evaluation = evaluateDelivery(
      snapshot(
        [
          issued("2026-10-01"),
          promise("2026-10-10"),
          received(ITEM_A, 100, "2026-10-05"),
          reversed(ITEM_A, 100, "2026-10-06"),
        ],
        { status: "parcialmente_recebido" }
      ),
      { now: NOW }
    );

    expect(evaluation.complete).toBe(false);
    expect(evaluation.situation).toBe("incomplete");
  });

  it("estorno após conclusão reabre entrega e preserva data efetiva histórica", () => {
    const evaluation = evaluateDelivery(
      snapshot(
        [
          issued("2026-10-01"),
          promise("2026-10-10"),
          received(ITEM_A, 100, "2026-10-05"),
          reversed(ITEM_A, 100, "2026-10-12"),
        ],
        { status: "parcialmente_recebido" }
      ),
      { now: NOW }
    );
    expect(evaluation.complete).toBe(false);
    expect(evaluation.completedAt?.toISOString()).toBe(at("2026-10-05"));
    expect(evaluation.situation).toBe("incomplete");
  });

  it("ignora promessa informativa do rascunho registrada antes da emissão", () => {
    const evaluation = evaluateDelivery(
      snapshot([
        { ...promise("2026-10-10", "2026-09-30"), eventAt: at("2026-09-30") },
        issued("2026-10-01"),
        received(ITEM_A, 100, "2026-10-08"),
      ]),
      { now: NOW }
    );
    expect(evaluation.situation).toBe("no_promise");
  });

  it("compara datas no fuso operacional (mesmo dia conta como pontual)", () => {
    const evaluation = evaluateDelivery(
      snapshot(
        [
          issued("2026-10-01"),
          promise("2026-10-10"),
          // 23h de 10/10 em Brasília = 02h de 11/10 UTC; ainda é o dia prometido.
          {
            eventType: "received",
            itemId: ITEM_A,
            quantity: 100,
            promisedAt: null,
            eventAt: new Date("2026-10-11T02:00:00.000Z").toISOString(),
            note: null,
          },
        ],
        { status: "recebido_completo" }
      ),
      { now: NOW }
    );

    expect(evaluation.situation).toBe("otif");
    expect(evaluation.delayDays).toBe(0);
  });
});

describe("OTIF — reprogramação e exclusões", () => {
  it("troca de data prometida preserva a promessa original e não apaga o atraso histórico", () => {
    const evaluation = evaluateDelivery(
      snapshot(
        [
          issued("2026-10-01"),
          promise("2026-10-05", "2026-10-02"),
          promise("2026-10-20", "2026-10-06", "promise_revised"),
          received(ITEM_A, 100, "2026-10-15"),
        ],
        { status: "recebido_completo" }
      ),
      { now: NOW }
    );

    expect(evaluation.promisedOriginalAt?.toISOString()).toBe(at("2026-10-05"));
    expect(evaluation.promisedCurrentAt?.toISOString()).toBe(at("2026-10-20"));
    expect(evaluation.revisions).toHaveLength(1);
    expect(evaluation.revisions[0].note).toContain("reprogramou");
    // Pontualidade continua medida contra a promessa original.
    expect(evaluation.situation).toBe("late");
    expect(evaluation.delayDays).toBe(10);
  });

  it("cancelada antes de qualquer promessa fica fora do denominador", () => {
    const summary = computeOtifSummary({
      deliveries: [
        snapshot([issued("2026-10-01"), cancelled("2026-10-02")], { status: "cancelado" }),
      ],
      period: PERIOD,
      now: NOW,
    });

    expect(summary.eligibleCount).toBe(0);
    expect(summary.excluded.cancelledBeforePromise).toBe(1);
    expect(summary.otifPct).toBeNull();
  });

  it("cancelada depois da promessa entra no denominador como incompleta (leitura literal da SPEC)", () => {
    const summary = computeOtifSummary({
      deliveries: [
        snapshot(
          [issued("2026-10-01"), promise("2026-10-20", "2026-10-02"), cancelled("2026-10-10")],
          {
            status: "cancelado",
          }
        ),
      ],
      period: PERIOD,
      now: NOW,
    });

    expect(summary.eligibleCount).toBe(1);
    expect(summary.incompleteCount).toBe(1);
    expect(summary.otifPct).toBe(0);
  });

  it("promessa futura ainda não vencida fica em andamento e fora do denominador", () => {
    const future = new Date("2026-11-20T12:00:00-03:00");
    const summary = computeOtifSummary({
      deliveries: [
        snapshot([issued("2026-11-01"), promise("2026-11-20", "2026-11-01")], {
          status: "emitido",
        }),
      ],
      period: {
        from: new Date("2026-11-01T12:00:00-03:00"),
        to: new Date("2026-11-30T12:00:00-03:00"),
      },
      now: NOW,
    });

    expect(future.getTime()).toBeGreaterThan(NOW.getTime());
    expect(summary.eligibleCount).toBe(0);
    expect(summary.excluded.inProgress).toBe(1);
  });

  it("pedido sem emissão não entra em nenhuma contagem de entrega", () => {
    const evaluation = evaluateDelivery(
      snapshot([promise("2026-10-10"), received(ITEM_A, 100, "2026-10-09")], {
        status: "rascunho",
      }),
      { now: NOW }
    );

    expect(evaluation.situation).toBe("not_issued");
    expect(evaluation.eligible).toBe(false);
  });
});

describe("OTIF — utilidades de data e DTO", () => {
  it("usa exatamente 90 dias civis no fuso de São Paulo", () => {
    expect(last90CivilDateRange(new Date("2026-11-04T02:00:00.000Z"))).toEqual({
      from: "2026-08-06",
      to: "2026-11-03",
    });
  });

  it("inclui dia civil completo no fuso de São Paulo", () => {
    const period = civilDayBounds("2026-10-01", "2026-10-31");
    expect(period.from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-11-01T02:59:59.999Z");
  });
  it("conta dias corridos pelo fuso operacional", () => {
    expect(
      calendarDaysBetween(
        new Date("2026-10-05T12:00:00-03:00"),
        new Date("2026-10-07T12:00:00-03:00")
      )
    ).toBe(2);
    expect(
      calendarDaysBetween(
        new Date("2026-10-05T23:00:00.000Z"),
        new Date("2026-10-07T02:00:00.000Z")
      )
    ).toBe(1);
    expect(dayKey(new Date("2026-10-11T02:00:00.000Z"))).toBe("2026-10-10");
  });

  it("monta o DTO do painel com período explícito e rótulos", () => {
    const performance = buildSupplierPerformance({
      supplier: { id: "s1", name: "Usina Teste", legalName: "Usina Teste LTDA", active: true },
      deliveries: acceptanceFixture(),
      period: PERIOD,
      now: NOW,
    });

    expect(performance.period).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
      basis: "promised_at_original",
      timeZone: "America/Sao_Paulo",
    });
    expect(performance.otifPct).toBe(57.14);
    expect(performance.deliveries).toHaveLength(8);
    const situations = performance.deliveries.map((delivery) => delivery.situation);
    expect(situations).toContain("otif");
    expect(situations).toContain("late");
    expect(situations).toContain("incomplete");
    expect(situations).toContain("no_promise");
    expect(performance.deliveries.every((delivery) => delivery.situationLabel.length > 0)).toBe(
      true
    );
  });
});

describe("OTIF — correções compensatórias", () => {
  it("substitui a promessa no cálculo e mantém os dois registros no histórico", () => {
    const original = {
      ...promise("2026-10-05", "2026-10-02"),
      id: "event-promise-original",
      createdAt: at("2026-10-02"),
      source: "follow_up_manual",
    };
    const correction = {
      ...original,
      id: "event-promise-correction",
      promisedAt: at("2026-10-08"),
      compensatesEventId: original.id,
      correctionReason: "Data inicial do fornecedor estava incorreta.",
      createdAt: at("2026-10-10"),
      source: "manual_correction",
    };
    const delivery = snapshot([
      { ...issued("2026-10-01"), id: "event-issued" },
      original,
      correction,
      { ...received(ITEM_A, 100, "2026-10-07"), id: "event-received" },
    ]);
    const performance = buildSupplierPerformance({
      supplier: { id: "supplier", name: "Fornecedor", legalName: "Fornecedor LTDA", active: true },
      deliveries: [delivery],
      period: PERIOD,
      now: NOW,
    });

    expect(performance.deliveries[0].promisedOriginalAt).toBe(at("2026-10-08"));
    expect(performance.deliveries[0].situation).toBe("otif");
    expect(performance.deliveries[0].events).toHaveLength(4);
    expect(
      performance.deliveries[0].events.find((event) => event.id === original.id)?.corrected
    ).toBe(true);
    expect(
      performance.deliveries[0].events.find((event) => event.id === correction.id)
    ).toMatchObject({
      correctionReason: "Data inicial do fornecedor estava incorreta.",
      corrected: false,
    });
  });

  it("usa apenas a quantidade do último evento compensatório", () => {
    const original = {
      ...received(ITEM_A, 100, "2026-10-06"),
      id: "event-receipt-original",
      createdAt: at("2026-10-06"),
      source: "purchase_receipt",
    };
    const correction = {
      ...original,
      id: "event-receipt-correction",
      quantity: 90,
      compensatesEventId: original.id,
      correctionReason: "Conferência corrigiu quantidade recebida.",
      createdAt: at("2026-10-10"),
      source: "manual_correction",
    };
    const evaluation = evaluateDelivery(
      snapshot([issued("2026-10-01"), promise("2026-10-08", "2026-10-02"), original, correction]),
      { now: NOW }
    );

    expect(evaluation.complete).toBe(false);
    expect(evaluation.situation).toBe("incomplete");
  });
});
