import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  numeric,
  integer,
  bigserial,
  serial,
  jsonb,
  char,
  date,
  varchar,
  pgEnum,
  primaryKey,
  index,
  unique,
  uniqueIndex,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ==========================================
// ENUMS
// ==========================================
export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "diretor",
  "comprador",
  "vendedor",
  "estoque",
  "financeiro",
]);

export const appModuleEnum = pgEnum("app_module", [
  "visao_geral",
  "inteligencia_mercado",
  "estoque_retalhos",
  "compras_rfq",
  "vendas_orcamentos",
  "producao_nesting",
  "qualidade_certificados",
  "financeiro_risco",
  "cadastros_produtos",
  "cadastros_fornecedores",
  "cadastros_clientes",
  "cadastros_depositos",
  "cadastros_maquinas",
  "usuarios_sistema",
  "auditoria",
]);

export const productFamilyEnum = pgEnum("product_family", [
  "chapa_grossa",
  "bobina",
  "tubo",
  "perfil",
  "barra",
]);

export const productUnitEnum = pgEnum("product_unit", ["kg", "m", "un", "t"]);

export const productStatusEnum = pgEnum("product_status", ["ativo", "inativo", "homologacao"]);

export const supplierTypeEnum = pgEnum("supplier_type", ["usina", "distribuidor", "trader"]);

export const warehouseTypeEnum = pgEnum("warehouse_type", ["matriz", "filial", "patio"]);

export const machineTypeEnum = pgEnum("machine_type", [
  "laser",
  "plasma",
  "oxicorte",
  "guilhotina",
  "serra",
  "dobra",
  "slitter",
]);

export const auditActionEnum = pgEnum("audit_action", ["insert", "update", "delete"]);

export const importJobStatusEnum = pgEnum("import_job_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

// ==========================================
// 1. TENANTS
// ==========================================
export const tenants = pgTable("tenants", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: boolean("active").default(true).notNull(),
  minGrossMarginPct: numeric("min_gross_margin_pct", { precision: 5, scale: 2 })
    .default("18.00")
    .notNull(),
  defaultQuoteMarginPct: numeric("default_quote_margin_pct", { precision: 5, scale: 2 })
    .default("24.00")
    .notNull(),
  /** Modelo de IA padrão do tenant (Copiloto e briefing): provedor + id do modelo. */
  aiDefaultProvider: varchar("ai_default_provider", { length: 20 }),
  aiDefaultModel: varchar("ai_default_model", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// 2. USERS
// ==========================================
export const users = pgTable(
  "users",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").default("vendedor").notNull(),
    active: boolean("active").default(true).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantRoleIdx: index("users_tenant_role_idx").on(t.tenantId, t.role),
    idTenantLac08Uq: unique("users_id_tenant_lac08_uq").on(t.id, t.tenantId),
  })
);

// ==========================================
// 3. SESSIONS (Auth.js session support)
// ==========================================
export const sessions = pgTable("sessions", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// 4. ROLE PERMISSIONS
// ==========================================
export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: userRoleEnum("role").notNull(),
    module: appModuleEnum("module").notNull(),
    canRead: boolean("can_read").default(false).notNull(),
    canWrite: boolean("can_write").default(false).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.role, t.module] }),
  })
);

// ==========================================
// 5. PRODUCTS (RF-01)
// ==========================================
export const products = pgTable(
  "products",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    erpCode: text("erp_code").unique(),
    family: productFamilyEnum("family").notNull(),
    commercialDescription: text("commercial_description").notNull(),
    fiscalDescription: text("fiscal_description").notNull(),
    norm: text("norm").notNull(),
    ncm: char("ncm", { length: 8 }).notNull(),
    thicknessMm: numeric("thickness_mm", { precision: 12, scale: 4 }),
    widthMm: numeric("width_mm", { precision: 12, scale: 4 }),
    lengthMm: numeric("length_mm", { precision: 12, scale: 4 }),
    diameterMm: numeric("diameter_mm", { precision: 12, scale: 4 }),
    wallMm: numeric("wall_mm", { precision: 12, scale: 4 }),
    densityGCm3: numeric("density_g_cm3", { precision: 12, scale: 4 }).default("7.85").notNull(),
    unit: productUnitEnum("unit").default("kg").notNull(),
    weightPerUnit: numeric("weight_per_unit", { precision: 12, scale: 4 }).notNull(),
    replacementCostBase: numeric("replacement_cost_base", {
      precision: 12,
      scale: 4,
    }).notNull(),
    status: productStatusEnum("status").default("ativo").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantFamilyIdx: index("products_tenant_family_idx").on(t.tenantId, t.family),
    tenantStatusIdx: index("products_tenant_status_idx").on(t.tenantId, t.status),
    normIdx: index("products_norm_idx").on(t.norm),
    // Chave-alvo das FKs compostas tenant-safe de condições e eventos LAC-02.
    productsTenantIdUq: unique("uq_products_tenant_id").on(t.id, t.tenantId),
  })
);

// ==========================================
// 6. SUPPLIERS
// ==========================================
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    cnpj: text("cnpj").notNull().unique(),
    contacts: jsonb("contacts").$type<{
      email?: string;
      phone?: string;
      contactName?: string;
    }>(),
    city: text("city"),
    uf: char("uf", { length: 2 }),
    type: supplierTypeEnum("type").default("distribuidor").notNull(),
    leadTimeDays: integer("lead_time_days").default(7).notNull(),
    paymentTerms: text("payment_terms"),
    notes: text("notes"),
    active: boolean("active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantSupplierIdx: index("suppliers_tenant_idx").on(t.tenantId),
    // Chave-alvo da FK composta de condições produto × fornecedor.
    suppliersTenantIdUq: unique("uq_suppliers_tenant_id").on(t.id, t.tenantId),
    // Alvo das FKs compostas da LAC-02 (impede termo/histórico de fornecedor de outro tenant).
  })
);

// ==========================================
// 7. CUSTOMERS
// ==========================================
export const customers = pgTable(
  "customers",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    document: text("document").notNull().unique(),
    contacts: jsonb("contacts").$type<{
      email?: string;
      phone?: string;
      contactName?: string;
    }>(),
    city: text("city"),
    uf: char("uf", { length: 2 }),
    stateRegistration: text("state_registration"),
    segment: text("segment"),
    notes: text("notes"),
    active: boolean("active").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantCustomerIdx: index("customers_tenant_idx").on(t.tenantId),
    tenantIdUq: unique("customers_id_tenant_lac09_uq").on(t.id, t.tenantId),
  })
);

// ==========================================
// 8. WAREHOUSES
// ==========================================
export const warehouses = pgTable(
  "warehouses",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    type: warehouseTypeEnum("type").default("matriz").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantWarehouseIdx: index("warehouses_tenant_idx").on(t.tenantId),
  })
);

// ==========================================
// 9. MACHINES
// ==========================================
export const machines = pgTable(
  "machines",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: machineTypeEnum("type").notNull(),
    costPerHour: numeric("cost_per_hour", { precision: 12, scale: 4 }).default("0").notNull(),
    setupMin: integer("setup_min").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantMachineIdx: index("machines_tenant_idx").on(t.tenantId),
  })
);

// ==========================================
// 10. AUDIT LOG & IMPORT JOBS
// ==========================================
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").references(() => users.id),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: auditActionEnum("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantEntityIdx: index("audit_tenant_entity_idx").on(t.tenantId, t.entity, t.entityId),
  })
);

export const importJobs = pgTable("import_jobs", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  entity: text("entity").notNull(),
  fileKey: text("file_key"),
  status: importJobStatusEnum("status").default("pending").notNull(),
  report: jsonb("report"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

// ==========================================
// 11. MARKET INTELLIGENCE (MVP-01)
// ==========================================
export const marketAssets = pgTable("market_assets", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  symbol: varchar("symbol", { length: 30 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  market: varchar("market", { length: 50 }).notNull(),
  baseCurrency: varchar("base_currency", { length: 10 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  provider: varchar("provider", { length: 20 }).default("MANUAL").notNull(),
  providerSymbol: varchar("provider_symbol", { length: 50 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const marketPriceSeries = pgTable(
  "market_price_series",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => marketAssets.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    open: numeric("open", { precision: 12, scale: 4 }),
    high: numeric("high", { precision: 12, scale: 4 }),
    low: numeric("low", { precision: 12, scale: 4 }),
    close: numeric("close", { precision: 12, scale: 4 }).notNull(),
    volume: numeric("volume", { precision: 14, scale: 2 }),
    source: varchar("source", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    assetTimeIdx: index("idx_market_price_asset_time").on(t.assetId, t.timestamp),
    assetTimeUnique: uniqueIndex("uq_market_price_asset_time").on(t.assetId, t.timestamp),
  })
);

/** Importações do usuário não entram na série global compartilhada entre tenants. */
export const tenantMarketPriceSeries = pgTable(
  "tenant_market_price_series",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => marketAssets.id, { onDelete: "cascade" }),
    assetName: varchar("asset_name", { length: 100 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    open: numeric("open", { precision: 12, scale: 4 }),
    high: numeric("high", { precision: 12, scale: 4 }),
    low: numeric("low", { precision: 12, scale: 4 }),
    close: numeric("close", { precision: 12, scale: 4 }).notNull(),
    volume: numeric("volume", { precision: 14, scale: 2 }),
    source: varchar("source", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantAssetTimeUq: uniqueIndex("uq_tenant_market_price_asset_time").on(
      t.tenantId,
      t.assetId,
      t.timestamp
    ),
    tenantAssetTimeIdx: index("idx_tenant_market_price_asset_time").on(
      t.tenantId,
      t.assetId,
      t.timestamp
    ),
  })
);

export const marketExports = pgTable(
  "market_exports",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    filters: jsonb("filters").$type<{ symbol: string; from: string; to: string }>().notNull(),
    format: varchar("format", { length: 4 }).notNull(),
    rowCount: integer("row_count").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ tenantTimeIdx: index("idx_market_exports_tenant_time").on(t.tenantId, t.createdAt) })
);

export const analysisRuns = pgTable(
  "analysis_runs",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    analysisType: varchar("analysis_type", { length: 20 }).notNull(),
    inputSeries: jsonb("input_series").$type<string[]>().notNull(),
    parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull(),
    methodVersion: varchar("method_version", { length: 40 }).notNull(),
    coverage: jsonb("coverage").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    sourceSnapshotHash: varchar("source_snapshot_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ tenantTimeIdx: index("idx_analysis_runs_tenant_time").on(t.tenantId, t.createdAt) })
);

export const signalModels = pgTable(
  "signal_models",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 40 }).notNull(),
    componentConfig: jsonb("component_config").$type<Record<string, unknown>>().notNull(),
    weights: jsonb("weights").$type<Record<string, number>>().notNull(),
    thresholds: jsonb("thresholds").$type<Record<string, number>>().notNull(),
    horizonDays: integer("horizon_days").notNull(),
    minimumCoverage: numeric("minimum_coverage", { precision: 5, scale: 4 }).notNull(),
    methodology: jsonb("methodology").$type<Record<string, unknown>>().notNull(),
    approvedBy: uuid("approved_by").references(() => users.id),
    activeFrom: timestamp("active_from", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantVersionUq: uniqueIndex("uq_signal_models_tenant_version").on(t.tenantId, t.version),
    idTenantUq: uniqueIndex("uq_signal_models_id_tenant").on(t.id, t.tenantId),
  })
);

export const signalObservations = pgTable(
  "signal_observations",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    modelId: uuid("model_id").notNull(),
    entity: varchar("entity", { length: 100 }).notNull(),
    score: numeric("score", { precision: 6, scale: 3 }),
    signal: varchar("signal", { length: 40 }).notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    components: jsonb("components").$type<Record<string, unknown>>().notNull(),
    inputsHash: varchar("inputs_hash", { length: 64 }).notNull(),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantAsOfIdx: index("idx_signal_observations_tenant_asof").on(t.tenantId, t.asOf),
    modelTenantFk: foreignKey({
      name: "signal_observations_model_tenant_fk",
      columns: [t.modelId, t.tenantId],
      foreignColumns: [signalModels.id, signalModels.tenantId],
    }),
  })
);

export const backtestRuns = pgTable(
  "backtest_runs",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    modelId: uuid("model_id").notNull(),
    datasetHash: varchar("dataset_hash", { length: 64 }).notNull(),
    period: jsonb("period").$type<Record<string, unknown>>().notNull(),
    methodology: jsonb("methodology").$type<Record<string, unknown>>().notNull(),
    costs: jsonb("costs").$type<Record<string, unknown>>().notNull(),
    benchmark: jsonb("benchmark").$type<Record<string, unknown>>().notNull(),
    metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantRunIdx: index("idx_backtest_runs_tenant_time").on(t.tenantId, t.runAt),
    modelTenantFk: foreignKey({
      name: "backtest_runs_model_tenant_fk",
      columns: [t.modelId, t.tenantId],
      foreignColumns: [signalModels.id, signalModels.tenantId],
    }),
  })
);

export const marketManualPrices = pgTable(
  "market_manual_prices",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => marketAssets.id),
    value: numeric("value", { precision: 14, scale: 4 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
  },
  (t) => ({
    tenantAssetTimeIdx: index("idx_market_manual_prices_tenant_asset_time").on(
      t.tenantId,
      t.assetId,
      t.observedAt
    ),
  })
);

export const importParityConfigs = pgTable("import_parity_configs", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  associatedProductId: uuid("associated_product_id").references(() => products.id),
  iiTaxPct: numeric("ii_tax_pct", { precision: 5, scale: 2 }).default("12.00").notNull(),
  ipiTaxPct: numeric("ipi_tax_pct", { precision: 5, scale: 2 }).default("3.25").notNull(),
  pisTaxPct: numeric("pis_tax_pct", { precision: 5, scale: 2 }).default("2.10").notNull(),
  cofinsTaxPct: numeric("cofins_tax_pct", { precision: 5, scale: 2 }).default("9.65").notNull(),
  icmsTaxPct: numeric("icms_tax_pct", { precision: 5, scale: 2 }).default("18.00").notNull(),
  portExpensesPerTon: numeric("port_expenses_per_ton", { precision: 10, scale: 2 })
    .default("150.00")
    .notNull(),
  roadFreightPerTon: numeric("road_freight_per_ton", { precision: 10, scale: 2 })
    .default("280.00")
    .notNull(),
  oceanFreightUsdPerTon: numeric("ocean_freight_usd_per_ton", { precision: 10, scale: 2 })
    .default("58.00")
    .notNull(),
  domesticPriceBrlPerTon: numeric("domestic_price_brl_per_ton", { precision: 12, scale: 2 })
    .default("4710.00")
    .notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const marketAlertRules = pgTable(
  "market_alert_rules",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => marketAssets.id),
    conditionType: varchar("condition_type", { length: 30 }).notNull(),
    thresholdValue: numeric("threshold_value", { precision: 10, scale: 4 }).notNull(),
    channels: jsonb("channels").$type<("in_app" | "email")[]>().notNull(),
    active: boolean("active").default(true).notNull(),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantRuleIdx: index("market_alert_rules_tenant_idx").on(t.tenantId, t.active),
  })
);

export const marketAlertNotifications = pgTable(
  "market_alert_notifications",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    ruleId: uuid("rule_id").references(() => marketAlertRules.id, { onDelete: "set null" }),
    title: varchar("title", { length: 150 }).notNull(),
    message: text("message").notNull(),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userReadIdx: index("market_notifications_user_idx").on(t.userId, t.read, t.createdAt),
  })
);

// ==========================================
// 12. ESTOQUE PREVENTIVO & RETALHOS (MVP-02)
// ==========================================

// Lotes de Produto
export const stockLots = pgTable(
  "stock_lots",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    lotNumber: varchar("lot_number", { length: 50 }).notNull(),
    heatNumber: varchar("heat_number", { length: 50 }), // Número de corrida da usina
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    quantityInitial: numeric("quantity_initial", { precision: 12, scale: 4 }).notNull(),
    quantityCurrent: numeric("quantity_current", { precision: 12, scale: 4 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).notNull(),
    locationAddress: varchar("location_address", { length: 50 }), // Rua A, Prateleira 2
    entryDate: timestamp("entry_date", { withTimezone: true }).defaultNow().notNull(),
    status: varchar("status", { length: 20 }).default("ativo").notNull(), // 'ativo', 'esgotado', 'bloqueado'
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    lotTenantProductIdx: index("idx_stock_lots_tenant_product").on(t.tenantId, t.productId),
    lotWarehouseIdx: index("idx_stock_lots_warehouse").on(t.warehouseId),
    lotStatusIdx: index("idx_stock_lots_status").on(t.status),
  })
);

// Reservas comerciais (LAC-03). Append-only de estado: liberar altera status
// e registra releasedAt; exclusão mútua concorrente é protegida no serviço.
export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceType: varchar("source_type", { length: 30 }).notNull(),
    sourceId: uuid("source_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => stockLots.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    consumedQuantity: numeric("consumed_quantity", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ativa"),
    reservedBy: uuid("reserved_by")
      .notNull()
      .references(() => users.id),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    consumedQuantityCheck: check(
      "stock_reservations_consumed_quantity_ck",
      sql`${t.consumedQuantity} >= 0 and ${t.consumedQuantity} <= ${t.quantity}`
    ),
    tenantSourceIdx: index("stock_reservations_tenant_source_idx").on(
      t.tenantId,
      t.sourceType,
      t.sourceId
    ),
    lotStatusIdx: index("stock_reservations_lot_status_idx").on(t.lotId, t.status),
  })
);

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    number: serial("number").notNull().unique(),
    requestKey: uuid("request_key").notNull(),
    fromWarehouseId: uuid("from_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    toWarehouseId: uuid("to_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    status: varchar("status", { length: 20 }).notNull().default("concluida"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    requestKeyUnique: uniqueIndex("stock_transfers_tenant_request_key_uq").on(
      t.tenantId,
      t.requestKey
    ),
  })
);

export const stockTransferItems = pgTable("stock_transfer_items", {
  id: uuid("id")
    .default(sql`gen_random_uuid()`)
    .primaryKey(),
  transferId: uuid("transfer_id")
    .notNull()
    .references(() => stockTransfers.id, { onDelete: "cascade" }),
  sourceLotId: uuid("source_lot_id")
    .notNull()
    .references(() => stockLots.id),
  destinationLotId: uuid("destination_lot_id")
    .notNull()
    .references(() => stockLots.id),
  quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
});

export const stockLabels = pgTable(
  "stock_labels",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    objectType: varchar("object_type", { length: 20 }).notNull(),
    objectId: uuid("object_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    status: varchar("status", { length: 20 }).notNull().default("ativa"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    objectIdx: index("stock_labels_tenant_object_idx").on(t.tenantId, t.objectType, t.objectId),
  })
);

export const seasonalityRuns = pgTable(
  "seasonality_runs",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    methodVersion: varchar("method_version", { length: 40 }).notNull(),
    window: jsonb("window").$type<{ start: string; end: string; months: number }>().notNull(),
    coverage: jsonb("coverage")
      .$type<{ observedMonths: number; requiredMonths: number; missingMonths: string[] }>()
      .notNull(),
    result: jsonb("result")
      .$type<{
        status: "ready" | "insufficient";
        monthlyForecast?: number[];
        seasonalIndex?: number[];
        reason?: string;
      }>()
      .notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantProductCalculatedIdx: index("seasonality_runs_tenant_product_idx").on(
      t.tenantId,
      t.productId,
      t.calculatedAt
    ),
  })
);

// Movimentações de Estoque
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id").references(() => stockLots.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    movementType: varchar("movement_type", { length: 30 }).notNull(), // 'ENTRADA_COMPRA', 'SAIDA_VENDA', 'CORTE_CONSUMO', 'RETALHO_ENTRADA', 'AJUSTE_INVENTARIO'
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(), // Positivo para entrada, negativo para saída
    unitCost: numeric("unit_cost", { precision: 12, scale: 4 }).notNull(),
    totalCost: numeric("total_cost", { precision: 14, scale: 2 }).notNull(),
    referenceDocument: varchar("reference_document", { length: 100 }), // Chave NFe, Pedido Venda #1020, OS #50
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    movementTenantProductIdx: index("idx_stock_movements_tenant_product").on(
      t.tenantId,
      t.productId
    ),
    movementLotIdx: index("idx_stock_movements_lot").on(t.lotId),
    movementCreatedIdx: index("idx_stock_movements_created").on(t.createdAt),
  })
);

// Catálogo de Retalhos Sobressalentes (Offcuts)
export const stockRemnants = pgTable(
  "stock_remnants",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 30 }).notNull().unique(), // ex: 'RET-00492'
    parentLotId: uuid("parent_lot_id").references(() => stockLots.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    thicknessMm: numeric("thickness_mm", { precision: 8, scale: 2 }).notNull(),
    widthMm: numeric("width_mm", { precision: 8, scale: 2 }),
    lengthMm: numeric("length_mm", { precision: 8, scale: 2 }),
    diameterMm: numeric("diameter_mm", { precision: 8, scale: 2 }),
    weightKg: numeric("weight_kg", { precision: 10, scale: 3 }).notNull(),
    locationAddress: varchar("location_address", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).default("disponivel").notNull(), // 'disponivel', 'reservado', 'consumido', 'descarte'
    reservedForQuoteId: uuid("reserved_for_quote_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    remnantTenantProductIdx: index("idx_stock_remnants_tenant_product").on(t.tenantId, t.productId),
    remnantStatusIdx: index("idx_stock_remnants_status").on(t.status),
    remnantDimensionsIdx: index("idx_stock_remnants_dimensions").on(
      t.thicknessMm,
      t.widthMm,
      t.lengthMm
    ),
  })
);

// Cache / Métricas de Previsão de Demanda e Cobertura
export const stockPredictiveMetrics = pgTable(
  "stock_predictive_metrics",
  {
    productId: uuid("product_id")
      .primaryKey()
      .references(() => products.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    currentStockQty: numeric("current_stock_qty", { precision: 12, scale: 4 }).notNull(),
    avgDailyConsumption30d: numeric("avg_daily_consumption_30d", {
      precision: 10,
      scale: 4,
    }).notNull(),
    /**
     * Lead time usado no cálculo. Nulo = lead time não definido (não existe termo
     * produto×fornecedor nem cadastro de fornecedor aplicável). A LAC-02 proíbe
     * substituir a ausência por um default numérico do código.
     */
    leadTimeDays: integer("lead_time_days"),
    /** Origem do lead time acima; nula quando `leadTimeDays` é nulo. Ver `lib/suppliers/lead-time.ts`. */
    leadTimeSource: varchar("lead_time_source", { length: 40 }),
    coverageDays: numeric("coverage_days", { precision: 8, scale: 1 }).notNull(),
    safetyStockQty: numeric("safety_stock_qty", { precision: 12, scale: 4 }).notNull(),
    reorderPointQty: numeric("reorder_point_qty", { precision: 12, scale: 4 }).notNull(),
    predictiveStatus: varchar("predictive_status", { length: 30 }).notNull(), // 'CRITICAL_RUPTURE', 'WARNING', 'HEALTHY', 'EXCESS'
    suggestedPurchaseQty: numeric("suggested_purchase_qty", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),
    suggestedPurchaseDate: timestamp("suggested_purchase_date", { withTimezone: true }),
    curveAbc: varchar("curve_abc", { length: 1 }).default("B").notNull(),
    curveXyz: varchar("curve_xyz", { length: 1 }).default("Y").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    predictiveTenantIdx: index("idx_stock_predictive_tenant").on(t.tenantId, t.predictiveStatus),
  })
);

// Inventário Cíclico Dirigido por Risco
export const stockCycleCounts = pgTable(
  "stock_cycle_counts",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    lotId: uuid("lot_id").references(() => stockLots.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    systemQty: numeric("system_qty", { precision: 12, scale: 4 }).notNull(),
    countedQty: numeric("counted_qty", { precision: 12, scale: 4 }).notNull(),
    differenceQty: numeric("difference_qty", { precision: 12, scale: 4 }).notNull(),
    adjusted: boolean("adjusted").default(false).notNull(),
    justification: text("justification"),
    countedBy: uuid("counted_by").references(() => users.id),
    countedAt: timestamp("counted_at", { withTimezone: true }).defaultNow().notNull(),
    status: varchar("status", { length: 20 }).default("conferido").notNull(), // 'pendente', 'conferido', 'ajustado'
  },
  (t) => ({
    cycleCountTenantIdx: index("idx_stock_cycle_counts_tenant").on(t.tenantId, t.countedAt),
    cycleCountProductIdx: index("idx_stock_cycle_counts_product").on(t.productId),
  })
);

// ==========================================
// 13. VENDAS, ORÇAMENTOS E PEDIDOS (MVP-03)
// ==========================================

export const quotes = pgTable(
  "quotes",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    quoteNumber: serial("quote_number").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    sellerId: uuid("seller_id")
      .notNull()
      .references(() => users.id),
    channel: varchar("channel", { length: 30 }).default("whatsapp").notNull(), // whatsapp, email, phone, counter
    status: varchar("status", { length: 30 }).default("rascunho").notNull(), // rascunho, bloqueado_margem, enviado, em_negociacao, aprovado, perdido, expirado
    totalMaterialCost: numeric("total_material_cost", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    totalProcessCost: numeric("total_process_cost", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    totalFreightCost: numeric("total_freight_cost", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    totalServicesCost: numeric("total_services_cost", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).default("0.00").notNull(),
    grossMarginPct: numeric("gross_margin_pct", { precision: 5, scale: 2 })
      .default("0.00")
      .notNull(),
    minMarginPct: numeric("min_margin_pct", { precision: 5, scale: 2 }).default("18.00").notNull(),
    targetMarginPct: numeric("target_margin_pct", { precision: 5, scale: 2 })
      .default("24.00")
      .notNull(),
    discountPct: numeric("discount_pct", { precision: 5, scale: 2 }).default("0.00").notNull(),
    marketSymbol: varchar("market_symbol", { length: 30 }),
    marketVolatilityPct: numeric("market_volatility_pct", { precision: 6, scale: 2 })
      .default("0.00")
      .notNull(),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    pdfFileKey: varchar("pdf_file_key", { length: 255 }),
    lossReason: varchar("loss_reason", { length: 100 }),
    approvedByDirectorId: uuid("approved_by_director_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    deliveryDeadline: timestamp("delivery_deadline", { withTimezone: true }),
    paymentTerms: varchar("payment_terms", { length: 100 }),
    deliveryMethod: varchar("delivery_method", { length: 100 }),
    bankingInfo: text("banking_info"),
    externalServices: jsonb("external_services").$type<{ description: string; cost: number }[]>(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    quoteTenantStatusIdx: index("idx_quotes_tenant_status").on(t.tenantId, t.status),
    quoteTenantCreatedIdx: index("idx_quotes_tenant_created").on(t.tenantId, t.createdAt),
    quoteCustomerIdx: index("idx_quotes_customer").on(t.customerId),
    quoteSellerIdx: index("idx_quotes_seller").on(t.sellerId),
  })
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    remnantId: uuid("remnant_id").references(() => stockRemnants.id),
    geometryType: varchar("geometry_type", { length: 30 }).notNull(), // CHAPA_RETANGULAR, DISCO, BARRA_CORTE, TUBO_CORTE, PADRAO
    thicknessMm: numeric("thickness_mm", { precision: 8, scale: 2 }).notNull(),
    widthMm: numeric("width_mm", { precision: 8, scale: 2 }),
    lengthMm: numeric("length_mm", { precision: 8, scale: 2 }),
    diameterMm: numeric("diameter_mm", { precision: 8, scale: 2 }),
    innerDiameterMm: numeric("inner_diameter_mm", { precision: 8, scale: 2 }),
    wallMm: numeric("wall_mm", { precision: 8, scale: 2 }),
    processType: varchar("process_type", { length: 30 }),
    quantity: integer("quantity").notNull(),
    netWeightKg: numeric("net_weight_kg", { precision: 10, scale: 3 }).notNull(),
    grossWeightKg: numeric("gross_weight_kg", { precision: 10, scale: 3 }).notNull(),
    scrapPct: numeric("scrap_pct", { precision: 5, scale: 2 }).default("0.00").notNull(),
    unitMaterialCost: numeric("unit_material_cost", { precision: 12, scale: 4 }).notNull(),
    unitProcessCost: numeric("unit_process_cost", { precision: 12, scale: 4 })
      .default("0.00")
      .notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    totalItemAmount: numeric("total_item_amount", { precision: 12, scale: 2 }).notNull(),
    itemMarginPct: numeric("item_margin_pct", { precision: 5, scale: 2 }).notNull(),
    replacementCostPerKg: numeric("replacement_cost_per_kg", { precision: 12, scale: 4 })
      .default("0.00")
      .notNull(),
    machineId: uuid("machine_id").references(() => machines.id),
    setupMinutes: numeric("setup_minutes", { precision: 8, scale: 2 }),
    estimatedCutTimeMinutes: numeric("estimated_cut_time_minutes", { precision: 8, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    quoteItemQuoteIdx: index("idx_quote_items_quote").on(t.quoteId),
    quoteItemProductIdx: index("idx_quote_items_product").on(t.productId),
    quoteItemRemnantIdx: index("idx_quote_items_remnant").on(t.remnantId),
  })
);

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderNumber: serial("order_number").notNull().unique(),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    orderStatus: varchar("order_status", { length: 30 }).default("aguardando_producao").notNull(), // aguardando_producao, em_corte, pronto_faturamento, entregue, cancelado
    deliveryDeadline: timestamp("delivery_deadline", { withTimezone: true }),
    paymentTerms: varchar("payment_terms", { length: 100 }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdUqLac10: unique("sales_orders_id_tenant_lac10_uq").on(t.id, t.tenantId),
    salesOrderTenantIdx: index("idx_sales_orders_tenant").on(t.tenantId, t.orderStatus),
    salesOrderQuoteIdx: index("idx_sales_orders_quote").on(t.quoteId),
    salesOrderCustomerIdx: index("idx_sales_orders_customer").on(t.customerId),
  })
);

// LAC-10: expedição manual. Item aponta para produção concluída; matéria-prima já saiu em LAC-04.
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    number: bigserial("number", { mode: "number" }).notNull(),
    salesOrderId: uuid("sales_order_id")
      .notNull()
      .references(() => salesOrders.id),
    status: varchar("status", { length: 20 }).notNull().default("preparada"),
    volumeCount: integer("volume_count").notNull().default(1),
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    carrier: text("carrier"),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    dispatchKey: uuid("dispatch_key"),
    manifestHash: varchar("manifest_hash", { length: 64 }),
    manifestBy: uuid("manifest_by").references(() => users.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantOrderIdx: index("shipments_tenant_order_idx").on(t.tenantId, t.salesOrderId),
    volumeCountCheck: check("shipments_volume_count_ck", sql`${t.volumeCount} > 0`),
    salesOrderTenantFk: foreignKey({
      name: "shipments_sales_order_tenant_fk",
      columns: [t.salesOrderId, t.tenantId],
      foreignColumns: [salesOrders.id, salesOrders.tenantId],
    }),
  })
);

export const shipmentItems = pgTable("shipment_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => shipments.id),
  salesOrderItemId: uuid("sales_order_item_id")
    .notNull()
    .references(() => quoteItems.id),
  productionOrderItemId: uuid("production_order_item_id").notNull(),
  quantity: integer("quantity").notNull(),
  weightKg: numeric("weight_kg", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull().default("un"),
});

export const shipmentEvents = pgTable("shipment_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => shipments.id),
  type: varchar("type", { length: 40 }).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  source: varchar("source", { length: 20 }).notNull().default("manual"),
  location: text("location"),
  evidenceRef: text("evidence_ref"),
  eta: timestamp("eta", { withTimezone: true }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ==========================================
// 13. PRODUÇÃO (LAC-04)
// ==========================================

export const productionOrders = pgTable(
  "production_orders",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    number: serial("number").notNull().unique(),
    salesOrderId: uuid("sales_order_id")
      .notNull()
      .references(() => salesOrders.id),
    status: varchar("status", { length: 30 }).notNull().default("planejada"),
    priority: integer("priority").notNull().default(0),
    plannedStart: timestamp("planned_start", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productionOrderSalesUq: uniqueIndex("production_orders_tenant_sales_order_uq").on(
      t.tenantId,
      t.salesOrderId
    ),
    productionOrderTenantStatusIdx: index("production_orders_tenant_status_idx").on(
      t.tenantId,
      t.status,
      t.priority,
      t.createdAt
    ),
    productionOrderVersionCheck: check("production_orders_version_ck", sql`${t.version} > 0`),
    productionOrderPriorityCheck: check("production_orders_priority_ck", sql`${t.priority} >= 0`),
    productionOrderStatusCheck: check(
      "production_orders_status_ck",
      sql`${t.status} in ('planejada', 'liberada', 'em_corte', 'pausada', 'bloqueada_qualidade', 'concluida', 'cancelada')`
    ),
  })
);

export const productionOrderItems = pgTable(
  "production_order_items",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => productionOrders.id, { onDelete: "cascade" }),
    quoteItemId: uuid("quote_item_id")
      .notNull()
      .references(() => quoteItems.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    plannedQty: numeric("planned_qty", { precision: 12, scale: 4 }).notNull(),
    completedQty: numeric("completed_qty", { precision: 12, scale: 4 }).default("0").notNull(),
    cancelledQty: numeric("cancelled_qty", { precision: 12, scale: 4 }).default("0").notNull(),
    cancellationReason: text("cancellation_reason"),
    specSnapshot: jsonb("spec_snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productionItemQuoteUq: uniqueIndex("production_order_items_order_quote_uq").on(
      t.orderId,
      t.quoteItemId
    ),
    productionItemProductIdx: index("production_order_items_product_idx").on(t.productId),
    productionItemQuantitiesCheck: check(
      "production_order_items_quantities_ck",
      sql`${t.plannedQty} > 0 and ${t.completedQty} >= 0 and ${t.cancelledQty} >= 0 and ${t.completedQty} + ${t.cancelledQty} <= ${t.plannedQty}`
    ),
  })
);

export const productionOperations = pgTable(
  "production_operations",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => productionOrderItems.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    machineId: uuid("machine_id").references(() => machines.id),
    status: varchar("status", { length: 20 }).notNull().default("planejada"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    operatorId: uuid("operator_id").references(() => users.id),
  },
  (t) => ({
    productionOperationSequenceUq: uniqueIndex("production_operations_item_sequence_uq").on(
      t.orderItemId,
      t.sequence
    ),
    productionOperationSequenceCheck: check(
      "production_operations_sequence_ck",
      sql`${t.sequence} > 0`
    ),
  })
);

export const productionReports = pgTable(
  "production_reports",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => productionOrders.id),
    operationId: uuid("operation_id").references(() => productionOperations.id),
    clientOperationId: uuid("client_operation_id").notNull(),
    deviceId: uuid("device_id").notNull(),
    sequence: integer("sequence").notNull(),
    payloadVersion: integer("payload_version").notNull(),
    expectedOrderVersion: integer("expected_order_version").notNull(),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id),
    localOccurredAt: timestamp("local_occurred_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").notNull(),
    reconciliationStatus: varchar("reconciliation_status", { length: 30 })
      .notNull()
      .default("pendente"),
    reconciliationReason: text("reconciliation_reason"),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    resultingOrderVersion: integer("resulting_order_version"),
  },
  (t) => ({
    productionReportClientUq: uniqueIndex("production_reports_tenant_client_operation_uq").on(
      t.tenantId,
      t.clientOperationId
    ),
    productionReportDeviceSeqUq: uniqueIndex("production_reports_tenant_device_sequence_uq").on(
      t.tenantId,
      t.deviceId,
      t.sequence
    ),
    productionReportOrderIdx: index("production_reports_order_status_idx").on(
      t.orderId,
      t.reconciliationStatus,
      t.receivedAt
    ),
    productionReportSequenceCheck: check(
      "production_reports_sequence_ck",
      sql`${t.sequence} > 0 and ${t.payloadVersion} > 0 and ${t.expectedOrderVersion} > 0`
    ),
    productionReportStatusCheck: check(
      "production_reports_status_ck",
      sql`${t.reconciliationStatus} in ('pendente', 'aguardando_aprovacao', 'aprovado', 'conflito', 'aplicado', 'rejeitado')`
    ),
  })
);

export const productionConsumptions = pgTable(
  "production_consumptions",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => productionOrders.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => productionOrderItems.id),
    reportId: uuid("report_id")
      .notNull()
      .references(() => productionReports.id),
    reservationId: uuid("reservation_id").references(() => stockReservations.id),
    lotId: uuid("lot_id").references(() => stockLots.id),
    remnantId: uuid("remnant_id").references(() => stockRemnants.id),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    movementId: uuid("movement_id")
      .notNull()
      .references(() => stockMovements.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productionConsumptionReportIdx: index("production_consumptions_report_idx").on(t.reportId),
    productionConsumptionLotIdx: index("production_consumptions_lot_idx").on(t.lotId),
    productionConsumptionSourceCheck: check(
      "production_consumptions_source_ck",
      sql`(${t.lotId} is not null) <> (${t.remnantId} is not null)`
    ),
    productionConsumptionQuantityCheck: check(
      "production_consumptions_quantity_ck",
      sql`${t.quantity} > 0`
    ),
  })
);

export const productionResiduals = pgTable(
  "production_residuals",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => productionOrders.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => productionOrderItems.id),
    reportId: uuid("report_id")
      .notNull()
      .references(() => productionReports.id),
    consumptionId: uuid("consumption_id")
      .notNull()
      .references(() => productionConsumptions.id),
    stockRemnantId: uuid("stock_remnant_id")
      .notNull()
      .references(() => stockRemnants.id),
    parentLotId: uuid("parent_lot_id")
      .notNull()
      .references(() => stockLots.id),
    thicknessMm: numeric("thickness_mm", { precision: 8, scale: 2 }).notNull(),
    widthMm: numeric("width_mm", { precision: 8, scale: 2 }),
    lengthMm: numeric("length_mm", { precision: 8, scale: 2 }),
    diameterMm: numeric("diameter_mm", { precision: 8, scale: 2 }),
    measuredWeightKg: numeric("measured_weight_kg", { precision: 10, scale: 3 }).notNull(),
    measuredBy: uuid("measured_by")
      .notNull()
      .references(() => users.id),
    clientOperationId: uuid("client_operation_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    productionResidualClientUq: uniqueIndex("production_residuals_tenant_client_uq").on(
      t.tenantId,
      t.clientOperationId
    ),
    productionResidualConsumptionIdx: index("production_residuals_consumption_idx").on(
      t.consumptionId
    ),
    productionResidualMeasurementsCheck: check(
      "production_residuals_measurements_ck",
      sql`${t.thicknessMm} > 0 and ${t.measuredWeightKg} > 0 and (${t.widthMm} is not null or ${t.lengthMm} is not null or ${t.diameterMm} is not null)`
    ),
  })
);

// ==========================================
// 14. COPILOTO & GOVERNANÇA DE IA (MVP-04)
// ==========================================

export const agentActions = pgTable(
  "agent_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Nulo = execução automática do sistema (ex.: briefing das 06h55), sem usuário humano.
    userId: uuid("user_id").references(() => users.id),
    agentName: varchar("agent_name", { length: 50 }).notNull(),
    userPrompt: text("user_prompt"),
    toolsExecuted: jsonb("tools_executed").$type<
      {
        toolName: string;
        params: Record<string, unknown>;
        resultSummary: string;
      }[]
    >(),
    agentResponse: text("agent_response").notNull(),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    latencyMs: integer("latency_ms"),
    feedbackScore: integer("feedback_score"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    agentTenantCreatedIdx: index("idx_agent_actions_tenant_created").on(t.tenantId, t.createdAt),
    agentUserIdx: index("idx_agent_actions_user").on(t.userId),
  })
);

export const dailyBriefings = pgTable(
  "daily_briefings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    briefingDate: date("briefing_date").notNull(),
    summaryHtml: text("summary_html").notNull(),
    summaryText: text("summary_text").notNull(),
    keyMetrics: jsonb("key_metrics")
      .$type<{
        criticalRupturesCount: number;
        pendingQuotesCount: number;
        potentialLossAmount: number;
        /** Nulo quando a cotação não está disponível: zero pareceria um preço real. */
        usdRate: number | null;
        lmeAluRate: number | null;
      }>()
      .notNull(),
    recommendedActions: jsonb("recommended_actions").$type<
      {
        department: string;
        action: string;
        financialImpact: string;
        priority: "alta" | "media" | "baixa";
      }[]
    >(),
    sentViaEmailAt: timestamp("sent_via_email_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    briefingTenantDateIdx: index("idx_daily_briefings_tenant_date").on(t.tenantId, t.briefingDate),
  })
);

// Aceite dos Termos de Uso da IA: um registro por usuário e versão do termo.
export const aiTermsAcceptances = pgTable(
  "ai_terms_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: varchar("version", { length: 20 }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    aiTermsUserVersionUq: unique("ai_terms_acceptances_user_version_uq").on(t.userId, t.version),
  })
);

// Chave de API de provedor de IA, por tenant e provedor (uma linha por par). A chave vai
// cifrada (AES-256-GCM, `lib/crypto/secret-box.ts`); `apiKeyLast4` existe para exibir sem abrir.
export const aiProviderCredentials = pgTable(
  "ai_provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull(), // 'openai' | 'anthropic' | 'nvidia'
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    apiKeyLast4: varchar("api_key_last4", { length: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    aiProviderTenantProviderUq: unique("ai_provider_credentials_tenant_provider_uq").on(
      t.tenantId,
      t.provider
    ),
  })
);

// ==========================================
// 15. COMPRAS OPERACIONAIS (LAC-01)
//
// Pedido de compra manual com aprovação humana por alçada versionada. Nenhum
// campo aqui tem default de negócio: faixa de alçada, fórmula de preço médio e
// dados fiscais dependem de decisão do PI (ver docs/specs/LAC-01).
// ==========================================

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "rascunho",
  "submetido",
  "aprovado",
  "emitido",
  "parcialmente_recebido",
  "recebido_completo",
  "rejeitado",
  "cancelado",
  "aguardando_alcada_configurada",
]);

/** Decisão do aprovador. Nomes em inglês como na SPEC LAC-01 §6. */
export const purchaseApprovalDecisionEnum = pgEnum("purchase_approval_decision", [
  "approved",
  "rejected",
]);

export const purchaseEventTypeEnum = pgEnum("purchase_event_type", [
  "created",
  "updated",
  "deleted",
  "submitted",
  "approved",
  "rejected",
  "issued",
  "follow_up",
  "received",
  "receipt_reversed",
  "cancelled",
  "denied",
]);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Gerado apenas na emissão (sequência `purchase_order_number_seq`). */
    number: integer("number"),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    status: purchaseOrderStatusEnum("status").default("rascunho").notNull(),
    currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
    expectedDeliveryAt: timestamp("expected_delivery_at", { withTimezone: true }),
    subtotal: numeric("subtotal", { precision: 16, scale: 2 }).default("0").notNull(),
    discountTotal: numeric("discount_total", { precision: 16, scale: 2 }).default("0").notNull(),
    additionalCostsTotal: numeric("additional_costs_total", { precision: 16, scale: 2 })
      .default("0")
      .notNull(),
    grandTotal: numeric("grand_total", { precision: 16, scale: 2 }).default("0").notNull(),
    /** Versão congelada mais recente (0 = nunca submetido). */
    currentVersion: integer("current_version").default(0).notNull(),
    approvedVersionHash: varchar("approved_version_hash", { length: 64 }),
    approvedRuleVersion: integer("approved_rule_version"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    /** Exclusão lógica do rascunho: histórico e aprovações permanecem. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    poTenantStatusIdx: index("idx_purchase_orders_tenant_status").on(t.tenantId, t.status),
    poTenantSupplierIdx: index("idx_purchase_orders_tenant_supplier").on(t.tenantId, t.supplierId),
    poTenantCreatedIdx: index("idx_purchase_orders_tenant_created").on(t.tenantId, t.createdAt),
    // Número só existe depois da emissão; a unicidade vale por tenant.
    poTenantNumberUq: uniqueIndex("uq_purchase_orders_tenant_number")
      .on(t.tenantId, t.number)
      .where(sql`number is not null`),
    // Alvo das FKs compostas que impedem referência cross-tenant nas tabelas filhas.
    // Precisa ser CONSTRAINT (não índice único): o Postgres exige a constraint ao
    // criar a FK e o drizzle emite as constraints antes dos ALTER TABLE ... FOREIGN KEY.
    poTenantIdUq: unique("uq_purchase_orders_tenant_id").on(t.id, t.tenantId),
  })
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    /** Descrição congelada no momento do pedido. */
    productDescriptionSnapshot: text("product_description_snapshot").notNull(),
    quantityOrdered: numeric("quantity_ordered", { precision: 12, scale: 4 }).notNull(),
    quantityReceived: numeric("quantity_received", { precision: 12, scale: 4 })
      .default("0")
      .notNull(),
    unit: productUnitEnum("unit").default("kg").notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 4 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 14, scale: 4 }).default("0").notNull(),
    additionalCosts: jsonb("additional_costs")
      .$type<{ description: string; amount: number }[]>()
      .default([])
      .notNull(),
    lineTotal: numeric("line_total", { precision: 16, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    poiOrderIdx: index("idx_purchase_order_items_order").on(t.purchaseOrderId),
    poiProductIdx: index("idx_purchase_order_items_product").on(t.productId),
    // Chave-alvo da FK composta dos eventos tenant-safe.
    poiTenantIdUq: unique("uq_purchase_order_items_tenant_id").on(t.id, t.tenantId),
    poiOrderFk: foreignKey({
      name: "purchase_order_items_order_tenant_fk",
      columns: [t.purchaseOrderId, t.tenantId],
      foreignColumns: [purchaseOrders.id, purchaseOrders.tenantId],
    }).onDelete("cascade"),
  })
);

export const purchaseOrderVersions = pgTable(
  "purchase_order_versions",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    version: integer("version").notNull(),
    /** Cabeçalho + itens congelados como JSON canônico. */
    content: jsonb("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    povOrderVersionUq: unique("purchase_order_versions_order_version_uq").on(
      t.purchaseOrderId,
      t.version
    ),
    povOrderFk: foreignKey({
      name: "purchase_order_versions_order_tenant_fk",
      columns: [t.purchaseOrderId, t.tenantId],
      foreignColumns: [purchaseOrders.id, purchaseOrders.tenantId],
    }).onDelete("cascade"),
  })
);

export const purchaseApprovalRules = pgTable(
  "purchase_approval_rules",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Versão da matriz de alçadas. Salvar cria uma nova versão inteira. */
    version: integer("version").notNull(),
    /** Faixa em BRL: `minTotal` inclusivo, `maxTotal` exclusivo (nulo = sem teto). */
    minTotal: numeric("min_total", { precision: 16, scale: 2 }).notNull(),
    maxTotal: numeric("max_total", { precision: 16, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("BRL").notNull(),
    /** Capability exigida do aprovador (ex.: `purchase.approve`). */
    approverPermission: varchar("approver_permission", { length: 40 }).notNull(),
    requiredApprovals: integer("required_approvals").default(1).notNull(),
    activeFrom: timestamp("active_from", { withTimezone: true }).notNull(),
    activeUntil: timestamp("active_until", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    parVersionUq: unique("purchase_approval_rules_version_uq").on(
      t.tenantId,
      t.version,
      t.minTotal
    ),
    parTenantActiveIdx: index("idx_purchase_approval_rules_tenant_active").on(
      t.tenantId,
      t.activeFrom
    ),
  })
);

export const purchaseApprovals = pgTable(
  "purchase_approvals",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    orderVersion: integer("order_version").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    ruleVersion: integer("rule_version").notNull(),
    decision: purchaseApprovalDecisionEnum("decision").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    justification: text("justification"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    paActorUq: unique("purchase_approvals_actor_version_uq").on(
      t.purchaseOrderId,
      t.orderVersion,
      t.actorUserId
    ),
    paOrderIdx: index("idx_purchase_approvals_order").on(t.purchaseOrderId, t.orderVersion),
    paOrderFk: foreignKey({
      name: "purchase_approvals_order_tenant_fk",
      columns: [t.purchaseOrderId, t.tenantId],
      foreignColumns: [purchaseOrders.id, purchaseOrders.tenantId],
    }).onDelete("cascade"),
  })
);

export const purchaseEvents = pgTable(
  "purchase_events",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    itemId: uuid("item_id"),
    eventType: purchaseEventTypeEnum("event_type").notNull(),
    /** Nulo = ação automática do sistema. */
    actorUserId: uuid("actor_user_id").references(() => users.id),
    payload: jsonb("payload"),
    idempotencyKey: varchar("idempotency_key", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    peOrderIdx: index("idx_purchase_events_order").on(t.purchaseOrderId, t.createdAt),
    peIdemUq: uniqueIndex("uq_purchase_events_tenant_idem")
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`idempotency_key is not null`),
    peOrderFk: foreignKey({
      name: "purchase_events_order_tenant_fk",
      columns: [t.purchaseOrderId, t.tenantId],
      foreignColumns: [purchaseOrders.id, purchaseOrders.tenantId],
    }).onDelete("cascade"),
  })
);

export const purchaseReceipts = pgTable(
  "purchase_receipts",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    purchaseOrderItemId: uuid("purchase_order_item_id")
      .notNull()
      .references(() => purchaseOrderItems.id),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => stockLots.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    unit: productUnitEnum("unit").notNull(),
    unitCost: numeric("unit_cost", { precision: 14, scale: 4 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    supplierDocumentReference: text("supplier_document_reference"),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => users.id),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedBy: uuid("reversed_by").references(() => users.id),
    reversalReason: text("reversal_reason"),
    idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    prIdemUq: unique("purchase_receipts_tenant_idem_uq").on(t.tenantId, t.idempotencyKey),
    prOrderIdx: index("idx_purchase_receipts_order").on(t.purchaseOrderId),
    prOrderFk: foreignKey({
      name: "purchase_receipts_order_tenant_fk",
      columns: [t.purchaseOrderId, t.tenantId],
      foreignColumns: [purchaseOrders.id, purchaseOrders.tenantId],
    }).onDelete("cascade"),
  })
);

// ==========================================
// 16. FORNECEDORES: CONDIÇÕES E DESEMPENHO (LAC-02)
//
// Preferência e lead time são por produto × fornecedor, versionados por vigência
// (linha vigente = `valid_until` nulo). Nenhum campo preenche ausência com default
// de negócio: lead time, lote mínimo e unidade nulos significam "não definido".
// O histórico de entrega é append-only; correção só por evento compensatório.
// ==========================================

/** Origem/tipo do evento de entrega da LAC-02 (alimentado pela emissão, follow-up e recebimento da LAC-01). */
export const supplierDeliveryEventTypeEnum = pgEnum("supplier_delivery_event_type", [
  "issued",
  "promise_confirmed",
  "promise_revised",
  "received",
  "receipt_reversed",
  "cancelled",
]);

export const productSupplierTerms = pgTable(
  "product_supplier_terms",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    /** No máximo uma preferência vigente por produto (índice parcial abaixo). */
    preferred: boolean("preferred").default(false).notNull(),
    /** Nulo = lead time específico não definido (não herda o default do código). */
    leadTimeDays: integer("lead_time_days"),
    /** Nulo = lote mínimo desconhecido; nunca arredonda quantidade. */
    minimumOrderQty: numeric("minimum_order_qty", { precision: 12, scale: 4 }),
    /** Unidade do lote mínimo; obrigatória apenas quando há lote mínimo. */
    unit: productUnitEnum("unit"),
    validFrom: timestamp("valid_from", { withTimezone: true }).defaultNow().notNull(),
    /** Nulo = condição vigente. Fechar preserva o histórico; nunca é apagado. */
    validUntil: timestamp("valid_until", { withTimezone: true }),
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pstTenantProductIdx: index("idx_product_supplier_terms_tenant_product").on(
      t.tenantId,
      t.productId
    ),
    pstTenantSupplierIdx: index("idx_product_supplier_terms_tenant_supplier").on(
      t.tenantId,
      t.supplierId
    ),
    // Histórico: um par produto×fornecedor tem no máximo uma condição vigente.
    pstProductFk: foreignKey({
      name: "product_supplier_terms_product_tenant_fk",
      columns: [t.productId, t.tenantId],
      foreignColumns: [products.id, products.tenantId],
    }),
    pstSupplierFk: foreignKey({
      name: "product_supplier_terms_supplier_tenant_fk",
      columns: [t.supplierId, t.tenantId],
      foreignColumns: [suppliers.id, suppliers.tenantId],
    }),
  })
);

export const supplierDeliveryEvents = pgTable(
  "supplier_delivery_events",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id").notNull(),
    /** Nulo = evento de nível de entrega (emissão, promessa, cancelamento). */
    itemId: uuid("item_id"),
    eventType: supplierDeliveryEventTypeEnum("event_type").notNull(),
    /** Data prometida informada no evento (`promise_confirmed`/`promise_revised`). */
    promisedAt: timestamp("promised_at", { withTimezone: true }),
    /** Instante do evento: emissão, confirmação, recebimento, estorno ou cancelamento. */
    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
    /** Quantidade recebida/estornada; nula nos eventos de nível de entrega. */
    quantity: numeric("quantity", { precision: 12, scale: 4 }),
    /** Nulo = ação automática do sistema. */
    actorId: uuid("actor_id").references(() => users.id),
    /** Origem do registro: `purchase_issue`, `follow_up_manual`, `receipt`, etc. */
    source: varchar("source", { length: 30 }).notNull(),
    /** Justificativa/observação do evento (ex.: motivo da reprogramação). */
    note: text("note"),
    /** Correção append-only aponta para o evento substituído. */
    compensatesEventId: uuid("compensates_event_id"),
    /** Motivo obrigatório quando este evento compensa outro. */
    correctionReason: text("correction_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sdeOrderIdx: index("idx_supplier_delivery_events_order").on(
      t.tenantId,
      t.purchaseOrderId,
      t.eventAt
    ),
    sdeTenantTypeIdx: index("idx_supplier_delivery_events_tenant_type").on(
      t.tenantId,
      t.eventType,
      t.eventAt
    ),
    sdeScopeUnique: unique("uq_supplier_delivery_events_scope").on(
      t.id,
      t.tenantId,
      t.purchaseOrderId
    ),
    sdeCompensationUnique: uniqueIndex("uq_supplier_delivery_events_compensation")
      .on(t.tenantId, t.compensatesEventId)
      .where(sql`compensates_event_id is not null`),
    sdeCompensatesFk: foreignKey({
      name: "supplier_delivery_events_compensation_scope_fk",
      columns: [t.compensatesEventId, t.tenantId, t.purchaseOrderId],
      foreignColumns: [t.id, t.tenantId, t.purchaseOrderId],
    }),
    sdeOrderFk: foreignKey({
      name: "supplier_delivery_events_order_tenant_fk",
      columns: [t.purchaseOrderId, t.tenantId],
      foreignColumns: [purchaseOrders.id, purchaseOrders.tenantId],
    }).onDelete("cascade"),
    sdeItemFk: foreignKey({
      name: "supplier_delivery_events_item_tenant_fk",
      columns: [t.itemId, t.tenantId],
      foreignColumns: [purchaseOrderItems.id, purchaseOrderItems.tenantId],
    }),
  })
);

// LAC-08: estruturas inativas até definição de fontes e revisão pelo PI.
export const newsSources = pgTable(
  "news_sources",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    sourceUrl: text("source_url").notNull(),
    licenseReference: text("license_reference"),
    displayRights: varchar("display_rights", { length: 16 }).default("none").notNull(),
    retentionPolicy: text("retention_policy"),
    approvedBy: uuid("approved_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    idTenantUq: unique("news_sources_id_tenant_uq").on(t.id, t.tenantId),
    tenantUrlUq: unique("news_sources_tenant_url_uq").on(t.tenantId, t.sourceUrl),
    approverFk: foreignKey({
      name: "news_sources_approver_tenant_fk",
      columns: [t.approvedBy, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }),
    licenseCk: check(
      "news_sources_license_ck",
      sql`display_rights = 'none' OR (license_reference IS NOT NULL AND retention_policy IS NOT NULL AND approved_by IS NOT NULL)`
    ),
    rightsCk: check("news_sources_rights_ck", sql`display_rights IN ('none', 'metadata', 'full')`),
  })
);

export const newsItems = pgTable(
  "news_items",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    version: integer("version").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    rightsPolicy: text("rights_policy"),
    withdrawn: boolean("withdrawn").default(false).notNull(),
    body: text("body"),
    correctionOf: uuid("correction_of"),
    capturedBy: uuid("captured_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    idTenantUq: unique("news_items_id_tenant_uq").on(t.id, t.tenantId),
    sourceFk: foreignKey({
      name: "news_items_source_tenant_fk",
      columns: [t.sourceId, t.tenantId],
      foreignColumns: [newsSources.id, newsSources.tenantId],
    }),
    correctionFk: foreignKey({
      name: "news_items_correction_tenant_fk",
      columns: [t.correctionOf, t.tenantId],
      foreignColumns: [t.id, t.tenantId],
    }),
    actorFk: foreignKey({
      name: "news_items_actor_tenant_fk",
      columns: [t.capturedBy, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }),
    versionUq: unique("news_items_source_external_version_uq").on(
      t.sourceId,
      t.externalId,
      t.version
    ),
    hashUq: unique("news_items_source_external_hash_uq").on(
      t.sourceId,
      t.externalId,
      t.contentHash
    ),
    versionCk: check("news_items_version_ck", sql`version > 0`),
    hashCk: check("news_items_hash_ck", sql`content_hash ~ '^[0-9a-f]{64}$'`),
    capturedIdx: index("news_items_tenant_captured_idx").on(t.tenantId, t.capturedAt),
  })
);

export const newsClassifications = pgTable(
  "news_classifications",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    modelVersion: varchar("model_version", { length: 120 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 120 }).notNull(),
    labels: jsonb("labels").notNull(),
    sentiment: varchar("sentiment", { length: 40 }),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    evidence: text("evidence"),
    reviewStatus: varchar("review_status", { length: 24 }).default("pending").notNull(),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    itemFk: foreignKey({
      name: "news_classifications_item_tenant_fk",
      columns: [t.itemId, t.tenantId],
      foreignColumns: [newsItems.id, newsItems.tenantId],
    }),
    reviewerFk: foreignKey({
      name: "news_classifications_reviewer_tenant_fk",
      columns: [t.reviewedBy, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }),
    reviewCk: check(
      "news_classifications_review_ck",
      sql`(review_status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (review_status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)`
    ),
    reviewStatusCk: check(
      "news_classifications_status_ck",
      sql`review_status IN ('pending', 'approved', 'rejected')`
    ),
    confidenceCk: check(
      "news_classifications_confidence_ck",
      sql`confidence IS NULL OR (confidence >= 0 AND confidence <= 1)`
    ),
  })
);

export const regulatoryItems = pgTable(
  "regulatory_items",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    authority: varchar("authority", { length: 160 }).notNull(),
    actId: varchar("act_id", { length: 160 }).notNull(),
    version: integer("version").notNull(),
    jurisdiction: varchar("jurisdiction", { length: 160 }).notNull(),
    subject: text("subject").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    status: varchar("status", { length: 32 }).notNull(),
    primarySourceUrl: text("primary_source_url").notNull(),
    supersedesId: uuid("supersedes_id"),
    reviewedBy: uuid("reviewed_by").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    idTenantUq: unique("regulatory_items_id_tenant_uq").on(t.id, t.tenantId),
    actVersionUq: unique("regulatory_items_act_version_uq").on(
      t.tenantId,
      t.authority,
      t.actId,
      t.version
    ),
    supersedesFk: foreignKey({
      name: "regulatory_items_supersedes_tenant_fk",
      columns: [t.supersedesId, t.tenantId],
      foreignColumns: [t.id, t.tenantId],
    }),
    reviewerFk: foreignKey({
      name: "regulatory_items_reviewer_tenant_fk",
      columns: [t.reviewedBy, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }),
    datesCk: check(
      "regulatory_items_dates_ck",
      sql`effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from`
    ),
    versionCk: check("regulatory_items_version_ck", sql`version > 0`),
    publishedIdx: index("regulatory_items_tenant_published_idx").on(t.tenantId, t.publishedAt),
  })
);

export const financialTitles = pgTable(
  "financial_titles",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sourceSystem: text("source_system").notNull(),
    externalId: text("external_id").notNull(),
    customerId: uuid("customer_id"),
    supplierId: uuid("supplier_id"),
    direction: text("direction").notNull(),
    amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    dueAt: date("due_at").notNull(),
    sourceHash: varchar("source_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    idTenantUq: unique("financial_titles_id_tenant_uq").on(t.id, t.tenantId),
    externalUq: unique("financial_titles_external_uq").on(t.tenantId, t.sourceSystem, t.externalId),
    customerFk: foreignKey({
      name: "financial_titles_customer_tenant_fk",
      columns: [t.customerId, t.tenantId],
      foreignColumns: [customers.id, customers.tenantId],
    }),
    supplierFk: foreignKey({
      name: "financial_titles_supplier_tenant_fk",
      columns: [t.supplierId, t.tenantId],
      foreignColumns: [suppliers.id, suppliers.tenantId],
    }),
    partyCk: check(
      "financial_titles_party_ck",
      sql`(direction = 'receivable' AND customer_id IS NOT NULL AND supplier_id IS NULL) OR (direction = 'payable' AND supplier_id IS NOT NULL AND customer_id IS NULL)`
    ),
    amountCk: check("financial_titles_amount_ck", sql`amount > 0`),
    hashCk: check("financial_titles_hash_ck", sql`source_hash ~ '^[0-9a-f]{64}$'`),
  })
);

export const titleEvents = pgTable(
  "title_events",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    titleId: uuid("title_id").notNull(),
    eventType: text("event_type").notNull(),
    amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    sourceRef: text("source_ref").notNull(),
    actorId: uuid("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    titleFk: foreignKey({
      name: "title_events_title_tenant_fk",
      columns: [t.titleId, t.tenantId],
      foreignColumns: [financialTitles.id, financialTitles.tenantId],
    }),
    actorFk: foreignKey({
      name: "title_events_actor_tenant_fk",
      columns: [t.actorId, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }),
    sourceUq: unique("title_events_source_uq").on(t.tenantId, t.titleId, t.sourceRef),
    typeCk: check("title_events_type_ck", sql`event_type IN ('settlement', 'reversal')`),
    amountCk: check("title_events_amount_ck", sql`amount > 0`),
  })
);

export const creditLimits = pgTable(
  "credit_limits",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull(),
    limitAmount: numeric("limit_amount", { precision: 16, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    validFrom: date("valid_from").notNull(),
    validUntil: date("valid_until"),
    source: text("source").notNull(),
    approvedBy: uuid("approved_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    customerFk: foreignKey({
      name: "credit_limits_customer_tenant_fk",
      columns: [t.customerId, t.tenantId],
      foreignColumns: [customers.id, customers.tenantId],
    }),
    approverFk: foreignKey({
      name: "credit_limits_approver_tenant_fk",
      columns: [t.approvedBy, t.tenantId],
      foreignColumns: [users.id, users.tenantId],
    }),
    amountCk: check("credit_limits_amount_ck", sql`limit_amount >= 0`),
    periodCk: check(
      "credit_limits_period_ck",
      sql`valid_until IS NULL OR valid_until >= valid_from`
    ),
  })
);

export const financeImportRuns = pgTable(
  "finance_import_runs",
  {
    id: uuid("id")
      .default(sql`gen_random_uuid()`)
      .primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    counts: jsonb("counts").notNull(),
    errors: jsonb("errors").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    sourceHashUq: unique("finance_import_runs_source_hash_uq").on(t.tenantId, t.source, t.fileHash),
    hashCk: check("finance_import_runs_hash_ck", sql`file_hash ~ '^[0-9a-f]{64}$'`),
  })
);

export const importTracking = pgTable(
  "import_tracking",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    reference: text("reference").notNull(),
    milestone: varchar("milestone", { length: 80 }).notNull(),
    eta: timestamp("eta", { withTimezone: true }),
    source: varchar("source", { length: 20 }).notNull().default("manual"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    purchaseTenantFk: foreignKey({
      name: "import_tracking_purchase_tenant_fk",
      columns: [t.purchaseOrderId, t.tenantId],
      foreignColumns: [purchaseOrders.id, purchaseOrders.tenantId],
    }),
  })
);
