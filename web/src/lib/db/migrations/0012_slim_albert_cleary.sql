CREATE TYPE "public"."purchase_approval_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."purchase_event_type" AS ENUM('created', 'updated', 'deleted', 'submitted', 'approved', 'rejected', 'issued', 'follow_up', 'received', 'receipt_reversed', 'cancelled', 'denied');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('rascunho', 'submetido', 'aprovado', 'emitido', 'parcialmente_recebido', 'recebido_completo', 'rejeitado', 'cancelado', 'aguardando_alcada_configurada');--> statement-breakpoint
CREATE TABLE "purchase_approval_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"min_total" numeric(16, 2) NOT NULL,
	"max_total" numeric(16, 2),
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"approver_permission" varchar(40) NOT NULL,
	"required_approvals" integer DEFAULT 1 NOT NULL,
	"active_from" timestamp with time zone NOT NULL,
	"active_until" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_approval_rules_version_uq" UNIQUE("tenant_id","version","min_total")
);
--> statement-breakpoint
CREATE TABLE "purchase_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"order_version" integer NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"rule_version" integer NOT NULL,
	"decision" "purchase_approval_decision" NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"justification" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_approvals_actor_version_uq" UNIQUE("purchase_order_id","order_version","actor_user_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"item_id" uuid,
	"event_type" "purchase_event_type" NOT NULL,
	"actor_user_id" uuid,
	"payload" jsonb,
	"idempotency_key" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_description_snapshot" text NOT NULL,
	"quantity_ordered" numeric(12, 4) NOT NULL,
	"quantity_received" numeric(12, 4) DEFAULT '0' NOT NULL,
	"unit" "product_unit" DEFAULT 'kg' NOT NULL,
	"unit_price" numeric(14, 4) NOT NULL,
	"discount_amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"additional_costs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"line_total" numeric(16, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_versions_order_version_uq" UNIQUE("purchase_order_id","version")
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" integer,
	"supplier_id" uuid NOT NULL,
	"status" "purchase_order_status" DEFAULT 'rascunho' NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"expected_delivery_at" timestamp with time zone,
	"subtotal" numeric(16, 2) DEFAULT '0' NOT NULL,
	"discount_total" numeric(16, 2) DEFAULT '0' NOT NULL,
	"additional_costs_total" numeric(16, 2) DEFAULT '0' NOT NULL,
	"grand_total" numeric(16, 2) DEFAULT '0' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"approved_version_hash" varchar(64),
	"approved_rule_version" integer,
	"created_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"issued_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_purchase_orders_tenant_id" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"purchase_order_item_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"unit" "product_unit" NOT NULL,
	"unit_cost" numeric(14, 4) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supplier_document_reference" text,
	"received_by" uuid NOT NULL,
	"reversed_at" timestamp with time zone,
	"reversed_by" uuid,
	"reversal_reason" text,
	"idempotency_key" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_receipts_tenant_idem_uq" UNIQUE("tenant_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "purchase_approval_rules" ADD CONSTRAINT "purchase_approval_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_approval_rules" ADD CONSTRAINT "purchase_approval_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_approval_rules" ADD CONSTRAINT "purchase_approval_rules_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_approvals" ADD CONSTRAINT "purchase_approvals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_approvals" ADD CONSTRAINT "purchase_approvals_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_approvals" ADD CONSTRAINT "purchase_approvals_order_tenant_fk" FOREIGN KEY ("purchase_order_id","tenant_id") REFERENCES "public"."purchase_orders"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_events" ADD CONSTRAINT "purchase_events_order_tenant_fk" FOREIGN KEY ("purchase_order_id","tenant_id") REFERENCES "public"."purchase_orders"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_order_tenant_fk" FOREIGN KEY ("purchase_order_id","tenant_id") REFERENCES "public"."purchase_orders"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_versions" ADD CONSTRAINT "purchase_order_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_versions" ADD CONSTRAINT "purchase_order_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_versions" ADD CONSTRAINT "purchase_order_versions_order_tenant_fk" FOREIGN KEY ("purchase_order_id","tenant_id") REFERENCES "public"."purchase_orders"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_order_item_id_purchase_order_items_id_fk" FOREIGN KEY ("purchase_order_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_order_tenant_fk" FOREIGN KEY ("purchase_order_id","tenant_id") REFERENCES "public"."purchase_orders"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_purchase_approval_rules_tenant_active" ON "purchase_approval_rules" USING btree ("tenant_id","active_from");--> statement-breakpoint
CREATE INDEX "idx_purchase_approvals_order" ON "purchase_approvals" USING btree ("purchase_order_id","order_version");--> statement-breakpoint
CREATE INDEX "idx_purchase_events_order" ON "purchase_events" USING btree ("purchase_order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_purchase_events_tenant_idem" ON "purchase_events" USING btree ("tenant_id","idempotency_key") WHERE idempotency_key is not null;--> statement-breakpoint
CREATE INDEX "idx_purchase_order_items_order" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_order_items_product" ON "purchase_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_tenant_status" ON "purchase_orders" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_tenant_supplier" ON "purchase_orders" USING btree ("tenant_id","supplier_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_tenant_created" ON "purchase_orders" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_purchase_orders_tenant_number" ON "purchase_orders" USING btree ("tenant_id","number") WHERE number is not null;--> statement-breakpoint
CREATE INDEX "idx_purchase_receipts_order" ON "purchase_receipts" USING btree ("purchase_order_id");--> statement-breakpoint
-- Sequencia atomica do numero interno do pedido de compra (LAC-01); so e consumida na emissao.
CREATE SEQUENCE IF NOT EXISTS "purchase_order_number_seq" START WITH 1;
