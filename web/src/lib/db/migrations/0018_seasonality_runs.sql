CREATE TABLE "seasonality_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"method_version" varchar(40) NOT NULL,
	"window" jsonb NOT NULL,
	"coverage" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seasonality_runs" ADD CONSTRAINT "seasonality_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasonality_runs" ADD CONSTRAINT "seasonality_runs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seasonality_runs_tenant_product_idx" ON "seasonality_runs" USING btree ("tenant_id","product_id","calculated_at");