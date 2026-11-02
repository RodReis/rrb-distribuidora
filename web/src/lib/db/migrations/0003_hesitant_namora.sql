CREATE TABLE "stock_cycle_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid,
	"warehouse_id" uuid NOT NULL,
	"system_qty" numeric(12, 4) NOT NULL,
	"counted_qty" numeric(12, 4) NOT NULL,
	"difference_qty" numeric(12, 4) NOT NULL,
	"adjusted" boolean DEFAULT false NOT NULL,
	"justification" text,
	"counted_by" uuid,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'conferido' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"lot_number" varchar(50) NOT NULL,
	"heat_number" varchar(50),
	"supplier_id" uuid,
	"quantity_initial" numeric(12, 4) NOT NULL,
	"quantity_current" numeric(12, 4) NOT NULL,
	"unit_cost" numeric(12, 4) NOT NULL,
	"location_address" varchar(50),
	"entry_date" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(20) DEFAULT 'ativo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid,
	"warehouse_id" uuid NOT NULL,
	"movement_type" varchar(30) NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"unit_cost" numeric(12, 4) NOT NULL,
	"total_cost" numeric(14, 2) NOT NULL,
	"reference_document" varchar(100),
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_predictive_metrics" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"current_stock_qty" numeric(12, 4) NOT NULL,
	"avg_daily_consumption_30d" numeric(10, 4) NOT NULL,
	"lead_time_days" integer DEFAULT 15 NOT NULL,
	"coverage_days" numeric(8, 1) NOT NULL,
	"safety_stock_qty" numeric(12, 4) NOT NULL,
	"reorder_point_qty" numeric(12, 4) NOT NULL,
	"predictive_status" varchar(30) NOT NULL,
	"suggested_purchase_qty" numeric(12, 4) DEFAULT '0' NOT NULL,
	"suggested_purchase_date" timestamp with time zone,
	"curve_abc" varchar(1) DEFAULT 'B' NOT NULL,
	"curve_xyz" varchar(1) DEFAULT 'Y' NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_remnants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"parent_lot_id" uuid,
	"product_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"thickness_mm" numeric(8, 2) NOT NULL,
	"width_mm" numeric(8, 2),
	"length_mm" numeric(8, 2),
	"diameter_mm" numeric(8, 2),
	"weight_kg" numeric(10, 3) NOT NULL,
	"location_address" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'disponivel' NOT NULL,
	"reserved_for_quote_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_remnants_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "stock_cycle_counts" ADD CONSTRAINT "stock_cycle_counts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_cycle_counts" ADD CONSTRAINT "stock_cycle_counts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_cycle_counts" ADD CONSTRAINT "stock_cycle_counts_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_cycle_counts" ADD CONSTRAINT "stock_cycle_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_cycle_counts" ADD CONSTRAINT "stock_cycle_counts_counted_by_users_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_predictive_metrics" ADD CONSTRAINT "stock_predictive_metrics_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_predictive_metrics" ADD CONSTRAINT "stock_predictive_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_remnants" ADD CONSTRAINT "stock_remnants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_remnants" ADD CONSTRAINT "stock_remnants_parent_lot_id_stock_lots_id_fk" FOREIGN KEY ("parent_lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_remnants" ADD CONSTRAINT "stock_remnants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_remnants" ADD CONSTRAINT "stock_remnants_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stock_cycle_counts_tenant" ON "stock_cycle_counts" USING btree ("tenant_id","counted_at");--> statement-breakpoint
CREATE INDEX "idx_stock_cycle_counts_product" ON "stock_cycle_counts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_lots_tenant_product" ON "stock_lots" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_lots_warehouse" ON "stock_lots" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_stock_lots_status" ON "stock_lots" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_tenant_product" ON "stock_movements" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_lot" ON "stock_movements" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movements_created" ON "stock_movements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_stock_predictive_tenant" ON "stock_predictive_metrics" USING btree ("tenant_id","predictive_status");--> statement-breakpoint
CREATE INDEX "idx_stock_remnants_tenant_product" ON "stock_remnants" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_stock_remnants_status" ON "stock_remnants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_stock_remnants_dimensions" ON "stock_remnants" USING btree ("thickness_mm","width_mm","length_mm");