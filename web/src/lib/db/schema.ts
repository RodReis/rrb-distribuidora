import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  numeric,
  integer,
  bigserial,
  jsonb,
  char,
  pgEnum,
  primaryKey,
  index,
  uniqueIndex,
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
