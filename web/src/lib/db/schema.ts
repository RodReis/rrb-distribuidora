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
    status: varchar("status", { length: 20 }).notNull().default("ativa"),
    reservedBy: uuid("reserved_by")
      .notNull()
      .references(() => users.id),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
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
    salesOrderTenantIdx: index("idx_sales_orders_tenant").on(t.tenantId, t.orderStatus),
    salesOrderQuoteIdx: index("idx_sales_orders_quote").on(t.quoteId),
    salesOrderCustomerIdx: index("idx_sales_orders_customer").on(t.customerId),
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
