CREATE TABLE "stock_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"object_type" varchar(20) NOT NULL,
	"object_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'ativa' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "stock_labels_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "stock_labels" ADD CONSTRAINT "stock_labels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_labels_tenant_object_idx" ON "stock_labels" USING btree ("tenant_id","object_type","object_id");