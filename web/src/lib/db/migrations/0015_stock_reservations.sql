CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_type" varchar(30) NOT NULL,
	"source_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"status" varchar(20) DEFAULT 'ativa' NOT NULL,
	"reserved_by" uuid NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_reserved_by_users_id_fk" FOREIGN KEY ("reserved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_reservations_tenant_source_idx" ON "stock_reservations" USING btree ("tenant_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_lot_status_idx" ON "stock_reservations" USING btree ("lot_id","status");