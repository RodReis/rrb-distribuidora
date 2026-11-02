import type { CutProcess, GeometryType } from "@/lib/metallurgy/weight-formulas";

/** Item em edição no construtor de orçamentos (estado do cliente). */
export interface BuilderItem {
  key: string;
  productId: string;
  remnantId: string | null;
  remnantCode: string | null;
  geometryType: GeometryType;
  thicknessMm: number | "";
  widthMm: number | "";
  lengthMm: number | "";
  diameterMm: number | "";
  innerDiameterMm: number | "";
  wallMm: number | "";
  quantity: number;
  processType: CutProcess;
  machineId: string;
  setupMinutes: number | "";
  manualUnitPrice: number | "";
}

export interface QuoteFormState {
  customerId: string;
  channel: string;
  targetMarginPct: number;
  discountPct: number;
  freightCost: number;
  servicesCost: number;
  paymentTerms: string;
  deliveryMethod: string;
  deliveryDeadline: string;
  bankingInfo: string;
  notes: string;
}

export const GEOMETRY_LABELS: Record<GeometryType, string> = {
  CHAPA_RETANGULAR: "Chapa retangular",
  DISCO: "Disco / flange",
  BARRA_CORTE: "Barra (corte)",
  TUBO_CORTE: "Tubo (corte)",
  PADRAO: "Produto padrão",
};

export const GEOMETRY_OPTIONS = (Object.keys(GEOMETRY_LABELS) as GeometryType[]).map((value) => ({
  value,
  label: GEOMETRY_LABELS[value],
}));

export const PROCESS_LABELS: Record<CutProcess, string> = {
  laser: "Laser",
  plasma: "Plasma",
  oxicorte: "Oxicorte",
  serra: "Serra",
  guilhotina: "Guilhotina",
  dobra: "Dobra",
};

export const PROCESS_OPTIONS = (Object.keys(PROCESS_LABELS) as CutProcess[]).map((value) => ({
  value,
  label: PROCESS_LABELS[value],
}));

export const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "counter", label: "Balcão" },
];

export const PAYMENT_TERMS_OPTIONS = [
  { value: "", label: "A combinar" },
  { value: "À vista (PIX)", label: "À vista (PIX)" },
  { value: "28 dias", label: "28 dias" },
  { value: "30 dias", label: "30 dias" },
  { value: "30/60 dias", label: "30/60 dias" },
  { value: "30/60/90 dias", label: "30/60/90 dias" },
];

export const DELIVERY_METHOD_OPTIONS = [
  { value: "", label: "A combinar" },
  { value: "Retirada no balcão", label: "Retirada no balcão" },
  { value: "Entrega própria", label: "Entrega própria" },
  { value: "Transportadora", label: "Transportadora" },
  { value: "Redespacho", label: "Redespacho" },
];

function numOrNull(value: number | ""): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toApiItem(item: BuilderItem) {
  return {
    productId: item.productId,
    remnantId: item.remnantId,
    geometryType: item.geometryType,
    thicknessMm: numOrNull(item.thicknessMm),
    widthMm: numOrNull(item.widthMm),
    lengthMm: numOrNull(item.lengthMm),
    diameterMm: numOrNull(item.diameterMm),
    innerDiameterMm: numOrNull(item.innerDiameterMm),
    wallMm: numOrNull(item.wallMm),
    quantity: item.quantity,
    processType: item.processType,
    machineId: item.machineId || null,
    setupMinutes: typeof item.setupMinutes === "number" ? item.setupMinutes : 0,
    manualUnitPrice: numOrNull(item.manualUnitPrice),
  };
}

export function newItem(): BuilderItem {
  return {
    key: `item-${Math.random().toString(36).slice(2, 10)}`,
    productId: "",
    remnantId: null,
    remnantCode: null,
    geometryType: "CHAPA_RETANGULAR",
    thicknessMm: "",
    widthMm: "",
    lengthMm: "",
    diameterMm: "",
    innerDiameterMm: "",
    wallMm: "",
    quantity: 1,
    processType: "laser",
    machineId: "",
    setupMinutes: "",
    manualUnitPrice: "",
  };
}
