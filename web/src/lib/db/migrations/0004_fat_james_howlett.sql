ALTER TYPE "public"."machine_type" ADD VALUE 'oxicorte' BEFORE 'guilhotina';--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"remnant_id" uuid,
	"geometry_type" varchar(30) NOT NULL,
	"thickness_mm" numeric(8, 2) NOT NULL,
	"width_mm" numeric(8, 2),
	"length_mm" numeric(8, 2),
	"diameter_mm" numeric(8, 2),
	"inner_diameter_mm" numeric(8, 2),
	"wall_mm" numeric(8, 2),
	"process_type" varchar(30),
	"quantity" integer NOT NULL,
	"net_weight_kg" numeric(10, 3) NOT NULL,
	"gross_weight_kg" numeric(10, 3) NOT NULL,
	"scrap_pct" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"unit_material_cost" numeric(12, 4) NOT NULL,
	"unit_process_cost" numeric(12, 4) DEFAULT '0.00' NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"total_item_amount" numeric(12, 2) NOT NULL,
	"item_margin_pct" numeric(5, 2) NOT NULL,
	"replacement_cost_per_kg" numeric(12, 4) DEFAULT '0.00' NOT NULL,
	"machine_id" uuid,
	"setup_minutes" numeric(8, 2),
	"estimated_cut_time_minutes" numeric(8, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quote_number" serial NOT NULL,
	"customer_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"channel" varchar(30) DEFAULT 'whatsapp' NOT NULL,
	"status" varchar(30) DEFAULT 'rascunho' NOT NULL,
	"total_material_cost" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_process_cost" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_freight_cost" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_services_cost" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"gross_margin_pct" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"min_margin_pct" numeric(5, 2) DEFAULT '18.00' NOT NULL,
	"market_symbol" varchar(30),
	"market_volatility_pct" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"pdf_file_key" varchar(255),
	"loss_reason" varchar(100),
	"approved_by_director_id" uuid,
	"approved_at" timestamp with time zone,
	"delivery_deadline" timestamp with time zone,
	"payment_terms" varchar(100),
	"delivery_method" varchar(100),
	"banking_info" text,
	"external_services" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_quote_number_unique" UNIQUE("quote_number")
);
--> statement-breakpoint
CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_number" serial NOT NULL,
	"quote_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"order_status" varchar(30) DEFAULT 'aguardando_producao' NOT NULL,
	"delivery_deadline" timestamp with time zone,
	"payment_terms" varchar(100),
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "min_gross_margin_pct" numeric(5, 2) DEFAULT '18.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "default_quote_margin_pct" numeric(5, 2) DEFAULT '24.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_remnant_id_stock_remnants_id_fk" FOREIGN KEY ("remnant_id") REFERENCES "public"."stock_remnants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_approved_by_director_id_users_id_fk" FOREIGN KEY ("approved_by_director_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quote_items_quote" ON "quote_items" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "idx_quote_items_product" ON "quote_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_quote_items_remnant" ON "quote_items" USING btree ("remnant_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_tenant_status" ON "quotes" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "idx_quotes_tenant_created" ON "quotes" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_quotes_customer" ON "quotes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_seller" ON "quotes" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "idx_sales_orders_tenant" ON "sales_orders" USING btree ("tenant_id","order_status");--> statement-breakpoint
CREATE INDEX "idx_sales_orders_quote" ON "sales_orders" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "idx_sales_orders_customer" ON "sales_orders" USING btree ("customer_id");