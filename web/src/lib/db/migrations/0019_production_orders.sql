CREATE TABLE "production_consumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"reservation_id" uuid,
	"lot_id" uuid,
	"remnant_id" uuid,
	"quantity" numeric(12, 4) NOT NULL,
	"movement_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_consumptions_source_ck" CHECK (("production_consumptions"."lot_id" is not null) <> ("production_consumptions"."remnant_id" is not null)),
	CONSTRAINT "production_consumptions_quantity_ck" CHECK ("production_consumptions"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"machine_id" uuid,
	"status" varchar(20) DEFAULT 'planejada' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"operator_id" uuid,
	CONSTRAINT "production_operations_sequence_ck" CHECK ("production_operations"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "production_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"quote_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"planned_qty" numeric(12, 4) NOT NULL,
	"completed_qty" numeric(12, 4) DEFAULT '0' NOT NULL,
	"cancelled_qty" numeric(12, 4) DEFAULT '0' NOT NULL,
	"cancellation_reason" text,
	"spec_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_order_items_quantities_ck" CHECK ("production_order_items"."planned_qty" > 0 and "production_order_items"."completed_qty" >= 0 and "production_order_items"."cancelled_qty" >= 0 and "production_order_items"."completed_qty" + "production_order_items"."cancelled_qty" <= "production_order_items"."planned_qty")
);
--> statement-breakpoint
CREATE TABLE "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"number" serial NOT NULL,
	"sales_order_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'planejada' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"planned_start" timestamp with time zone,
	"due_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_orders_number_unique" UNIQUE("number"),
	CONSTRAINT "production_orders_version_ck" CHECK ("production_orders"."version" > 0),
	CONSTRAINT "production_orders_priority_ck" CHECK ("production_orders"."priority" >= 0),
	CONSTRAINT "production_orders_status_ck" CHECK ("production_orders"."status" in ('planejada', 'liberada', 'em_corte', 'pausada', 'bloqueada_qualidade', 'concluida', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "production_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"operation_id" uuid,
	"client_operation_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"payload_version" integer NOT NULL,
	"expected_order_version" integer NOT NULL,
	"reporter_id" uuid NOT NULL,
	"local_occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"reconciliation_status" varchar(30) DEFAULT 'pendente' NOT NULL,
	"reconciliation_reason" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"resulting_order_version" integer,
	CONSTRAINT "production_reports_sequence_ck" CHECK ("production_reports"."sequence" > 0 and "production_reports"."payload_version" > 0 and "production_reports"."expected_order_version" > 0),
	CONSTRAINT "production_reports_status_ck" CHECK ("production_reports"."reconciliation_status" in ('pendente', 'aguardando_aprovacao', 'aprovado', 'conflito', 'aplicado', 'rejeitado'))
);
--> statement-breakpoint
CREATE TABLE "production_residuals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"consumption_id" uuid NOT NULL,
	"stock_remnant_id" uuid NOT NULL,
	"parent_lot_id" uuid NOT NULL,
	"thickness_mm" numeric(8, 2) NOT NULL,
	"width_mm" numeric(8, 2),
	"length_mm" numeric(8, 2),
	"diameter_mm" numeric(8, 2),
	"measured_weight_kg" numeric(10, 3) NOT NULL,
	"measured_by" uuid NOT NULL,
	"client_operation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_residuals_measurements_ck" CHECK ("production_residuals"."thickness_mm" > 0 and "production_residuals"."measured_weight_kg" > 0 and ("production_residuals"."width_mm" is not null or "production_residuals"."length_mm" is not null or "production_residuals"."diameter_mm" is not null))
);
--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD COLUMN "consumed_quantity" numeric(12, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_order_id_production_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_item_id_production_order_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."production_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_report_id_production_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."production_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_reservation_id_stock_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."stock_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_remnant_id_stock_remnants_id_fk" FOREIGN KEY ("remnant_id") REFERENCES "public"."stock_remnants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_consumptions" ADD CONSTRAINT "production_consumptions_movement_id_stock_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_operations" ADD CONSTRAINT "production_operations_order_item_id_production_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."production_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_operations" ADD CONSTRAINT "production_operations_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_operations" ADD CONSTRAINT "production_operations_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_order_id_production_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_quote_item_id_quote_items_id_fk" FOREIGN KEY ("quote_item_id") REFERENCES "public"."quote_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_order_items" ADD CONSTRAINT "production_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reports" ADD CONSTRAINT "production_reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reports" ADD CONSTRAINT "production_reports_order_id_production_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reports" ADD CONSTRAINT "production_reports_operation_id_production_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."production_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reports" ADD CONSTRAINT "production_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_reports" ADD CONSTRAINT "production_reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_residuals" ADD CONSTRAINT "production_residuals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_residuals" ADD CONSTRAINT "production_residuals_order_id_production_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_residuals" ADD CONSTRAINT "production_residuals_item_id_production_order_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."production_order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_residuals" ADD CONSTRAINT "production_residuals_report_id_production_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."production_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_residuals" ADD CONSTRAINT "production_residuals_consumption_id_production_consumptions_id_fk" FOREIGN KEY ("consumption_id") REFERENCES "public"."production_consumptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_residuals" ADD CONSTRAINT "production_residuals_stock_remnant_id_stock_remnants_id_fk" FOREIGN KEY ("stock_remnant_id") REFERENCES "public"."stock_remnants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_residuals" ADD CONSTRAINT "production_residuals_parent_lot_id_stock_lots_id_fk" FOREIGN KEY ("parent_lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_residuals" ADD CONSTRAINT "production_residuals_measured_by_users_id_fk" FOREIGN KEY ("measured_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_consumptions_report_idx" ON "production_consumptions" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "production_consumptions_lot_idx" ON "production_consumptions" USING btree ("lot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_operations_item_sequence_uq" ON "production_operations" USING btree ("order_item_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "production_order_items_order_quote_uq" ON "production_order_items" USING btree ("order_id","quote_item_id");--> statement-breakpoint
CREATE INDEX "production_order_items_product_idx" ON "production_order_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_orders_tenant_sales_order_uq" ON "production_orders" USING btree ("tenant_id","sales_order_id");--> statement-breakpoint
CREATE INDEX "production_orders_tenant_status_idx" ON "production_orders" USING btree ("tenant_id","status","priority","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "production_reports_tenant_client_operation_uq" ON "production_reports" USING btree ("tenant_id","client_operation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_reports_tenant_device_sequence_uq" ON "production_reports" USING btree ("tenant_id","device_id","sequence");--> statement-breakpoint
CREATE INDEX "production_reports_order_status_idx" ON "production_reports" USING btree ("order_id","reconciliation_status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "production_residuals_tenant_client_uq" ON "production_residuals" USING btree ("tenant_id","client_operation_id");--> statement-breakpoint
CREATE INDEX "production_residuals_consumption_idx" ON "production_residuals" USING btree ("consumption_id");--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_consumed_quantity_ck" CHECK ("stock_reservations"."consumed_quantity" >= 0 and "stock_reservations"."consumed_quantity" <= "stock_reservations"."quantity");