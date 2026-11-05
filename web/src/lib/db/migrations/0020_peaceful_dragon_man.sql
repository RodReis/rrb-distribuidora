CREATE TABLE "market_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"filters" jsonb NOT NULL,
	"format" varchar(4) NOT NULL,
	"row_count" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_manual_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"value" numeric(14, 4) NOT NULL,
	"currency" varchar(10) NOT NULL,
	"unit" varchar(20) NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_market_price_series" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"asset_name" varchar(100) NOT NULL,
	"currency" varchar(10) NOT NULL,
	"unit" varchar(20) NOT NULL,
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
ALTER TABLE "market_exports" ADD CONSTRAINT "market_exports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_exports" ADD CONSTRAINT "market_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_manual_prices" ADD CONSTRAINT "market_manual_prices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_manual_prices" ADD CONSTRAINT "market_manual_prices_asset_id_market_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."market_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_manual_prices" ADD CONSTRAINT "market_manual_prices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_market_price_series" ADD CONSTRAINT "tenant_market_price_series_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_market_price_series" ADD CONSTRAINT "tenant_market_price_series_asset_id_market_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."market_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_market_exports_tenant_time" ON "market_exports" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_market_manual_prices_tenant_asset_time" ON "market_manual_prices" USING btree ("tenant_id","asset_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_market_price_asset_time" ON "tenant_market_price_series" USING btree ("tenant_id","asset_id","timestamp");--> statement-breakpoint
CREATE INDEX "idx_tenant_market_price_asset_time" ON "tenant_market_price_series" USING btree ("tenant_id","asset_id","timestamp");