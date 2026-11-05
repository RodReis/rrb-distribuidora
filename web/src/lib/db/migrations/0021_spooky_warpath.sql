CREATE TABLE "analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"analysis_type" varchar(20) NOT NULL,
	"input_series" jsonb NOT NULL,
	"parameters" jsonb NOT NULL,
	"method_version" varchar(40) NOT NULL,
	"coverage" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"source_snapshot_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_analysis_runs_tenant_time" ON "analysis_runs" USING btree ("tenant_id","created_at");