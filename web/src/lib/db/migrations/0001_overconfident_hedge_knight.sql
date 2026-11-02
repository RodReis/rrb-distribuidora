CREATE TABLE "import_parity_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"associated_product_id" uuid,
	"ii_tax_pct" numeric(5, 2) DEFAULT '12.00' NOT NULL,
	"ipi_tax_pct" numeric(5, 2) DEFAULT '3.25' NOT NULL,
	"pis_tax_pct" numeric(5, 2) DEFAULT '2.10' NOT NULL,
	"cofins_tax_pct" numeric(5, 2) DEFAULT '9.65' NOT NULL,
	"icms_tax_pct" numeric(5, 2) DEFAULT '18.00' NOT NULL,
	"port_expenses_per_ton" numeric(10, 2) DEFAULT '150.00' NOT NULL,
	"road_freight_per_ton" numeric(10, 2) DEFAULT '280.00' NOT NULL,
	"ocean_freight_usd_per_ton" numeric(10, 2) DEFAULT '58.00' NOT NULL,
	"domestic_price_brl_per_ton" numeric(12, 2) DEFAULT '4710.00' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_alert_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"rule_id" uuid,
	"title" varchar(150) NOT NULL,
	"message" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"condition_type" varchar(30) NOT NULL,
	"threshold_value" numeric(10, 4) NOT NULL,
	"channels" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_triggered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	"market" varchar(50) NOT NULL,
	"base_currency" varchar(10) NOT NULL,
	"unit" varchar(20) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_assets_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
CREATE TABLE "market_price_series" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" numeric(12, 4),
	"high" numeric(12, 4),
	"low" numeric(12, 4),
	"close" numeric(12, 4) NOT NULL,
	"volume" numeric(14, 2),
	"source" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "import_parity_configs" ADD CONSTRAINT "import_parity_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_parity_configs" ADD CONSTRAINT "import_parity_configs_associated_product_id_products_id_fk" FOREIGN KEY ("associated_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_parity_configs" ADD CONSTRAINT "import_parity_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_alert_notifications" ADD CONSTRAINT "market_alert_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_alert_notifications" ADD CONSTRAINT "market_alert_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_alert_notifications" ADD CONSTRAINT "market_alert_notifications_rule_id_market_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."market_alert_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_alert_rules" ADD CONSTRAINT "market_alert_rules_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_alert_rules" ADD CONSTRAINT "market_alert_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_alert_rules" ADD CONSTRAINT "market_alert_rules_asset_id_market_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."market_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_price_series" ADD CONSTRAINT "market_price_series_asset_id_market_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."market_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_notifications_user_idx" ON "market_alert_notifications" USING btree ("user_id","read","created_at");--> statement-breakpoint
CREATE INDEX "market_alert_rules_tenant_idx" ON "market_alert_rules" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "idx_market_price_asset_time" ON "market_price_series" USING btree ("asset_id","timestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_market_price_asset_time" ON "market_price_series" USING btree ("asset_id","timestamp");