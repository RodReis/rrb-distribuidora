CREATE TYPE "public"."supplier_delivery_event_type" AS ENUM('issued', 'promise_confirmed', 'promise_revised', 'received', 'receipt_reversed', 'cancelled');--> statement-breakpoint
CREATE TABLE "product_supplier_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"lead_time_days" integer,
	"minimum_order_qty" numeric(12, 4),
	"unit" "product_unit",
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"changed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"item_id" uuid,
	"event_type" "supplier_delivery_event_type" NOT NULL,
	"promised_at" timestamp with time zone,
	"event_at" timestamp with time zone NOT NULL,
	"quantity" numeric(12, 4),
	"actor_id" uuid,
	"source" varchar(30) NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_predictive_metrics" ALTER COLUMN "lead_time_days" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "stock_predictive_metrics" ALTER COLUMN "lead_time_days" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_predictive_metrics" ADD COLUMN "lead_time_source" varchar(40);--> statement-breakpoint
-- Alvos das FKs compostas abaixo: precisam existir ANTES das constraints que as referenciam.
ALTER TABLE "products" ADD CONSTRAINT "uq_products_tenant_id" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "uq_purchase_order_items_tenant_id" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "uq_suppliers_tenant_id" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "product_supplier_terms" ADD CONSTRAINT "product_supplier_terms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_supplier_terms" ADD CONSTRAINT "product_supplier_terms_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_supplier_terms" ADD CONSTRAINT "product_supplier_terms_product_tenant_fk" FOREIGN KEY ("product_id","tenant_id") REFERENCES "public"."products"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_supplier_terms" ADD CONSTRAINT "product_supplier_terms_supplier_tenant_fk" FOREIGN KEY ("supplier_id","tenant_id") REFERENCES "public"."suppliers"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_delivery_events" ADD CONSTRAINT "supplier_delivery_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_delivery_events" ADD CONSTRAINT "supplier_delivery_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_delivery_events" ADD CONSTRAINT "supplier_delivery_events_order_tenant_fk" FOREIGN KEY ("purchase_order_id","tenant_id") REFERENCES "public"."purchase_orders"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_delivery_events" ADD CONSTRAINT "supplier_delivery_events_item_tenant_fk" FOREIGN KEY ("item_id","tenant_id") REFERENCES "public"."purchase_order_items"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_product_supplier_terms_tenant_product" ON "product_supplier_terms" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_product_supplier_terms_tenant_supplier" ON "product_supplier_terms" USING btree ("tenant_id","supplier_id");--> statement-breakpoint
-- Sobreposição é validada transacionalmente pelo serviço sob lock do produto;
-- índices parciais por valid_until bloqueariam agendamentos futuros legítimos.
CREATE INDEX "idx_supplier_delivery_events_order" ON "supplier_delivery_events" USING btree ("tenant_id","purchase_order_id","event_at");--> statement-breakpoint
CREATE INDEX "idx_supplier_delivery_events_tenant_type" ON "supplier_delivery_events" USING btree ("tenant_id","event_type","event_at");
