ALTER TABLE "shipments" ADD COLUMN "volume_count" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_volume_count_ck" CHECK ("volume_count" > 0);
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_id_tenant_lac10_uq" UNIQUE ("id", "tenant_id");
--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_sales_order_tenant_fk" FOREIGN KEY ("sales_order_id", "tenant_id") REFERENCES "sales_orders"("id", "tenant_id");
--> statement-breakpoint
ALTER TABLE "import_tracking" ADD CONSTRAINT "import_tracking_purchase_tenant_fk" FOREIGN KEY ("purchase_order_id", "tenant_id") REFERENCES "purchase_orders"("id", "tenant_id");
