export interface PaidObservation {
  quantity: number;
  value: number;
  currency: string;
  unit: string;
}

export function calculatePaidAverages<T extends PaidObservation>(observations: T[]) {
  const groups = new Map<
    string,
    { currency: string; unit: string; quantity: number; total: number }
  >();
  for (const point of observations) {
    if (!Number.isFinite(point.quantity) || point.quantity <= 0 || !Number.isFinite(point.value))
      continue;
    const key = `${point.currency}/${point.unit}`;
    const group = groups.get(key) ?? {
      currency: point.currency,
      unit: point.unit,
      quantity: 0,
      total: 0,
    };
    group.quantity += point.quantity;
    group.total += point.quantity * point.value;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    currency: group.currency,
    unit: group.unit,
    quantity: group.quantity,
    value: group.total / group.quantity,
    methodVersion: "receipt-unit-cost-v1" as const,
  }));
}
