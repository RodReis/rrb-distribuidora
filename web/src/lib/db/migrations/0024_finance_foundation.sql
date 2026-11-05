ALTER TABLE "customers" ADD CONSTRAINT "customers_id_tenant_lac09_uq" UNIQUE ("id", "tenant_id");
--> statement-breakpoint
CREATE TABLE "financial_titles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "source_system" text NOT NULL,
  "external_id" text NOT NULL,
  "customer_id" uuid,
  "supplier_id" uuid,
  "direction" text NOT NULL,
  "amount" numeric(16,2) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "due_at" date NOT NULL,
  "source_hash" varchar(64) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "financial_titles_id_tenant_uq" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "financial_titles_external_uq" UNIQUE ("tenant_id", "source_system", "external_id"),
  CONSTRAINT "financial_titles_customer_tenant_fk" FOREIGN KEY ("customer_id", "tenant_id") REFERENCES "customers"("id", "tenant_id"),
  CONSTRAINT "financial_titles_supplier_tenant_fk" FOREIGN KEY ("supplier_id", "tenant_id") REFERENCES "suppliers"("id", "tenant_id"),
  CONSTRAINT "financial_titles_party_ck" CHECK ((direction = 'receivable' AND customer_id IS NOT NULL AND supplier_id IS NULL) OR (direction = 'payable' AND supplier_id IS NOT NULL AND customer_id IS NULL)),
  CONSTRAINT "financial_titles_amount_ck" CHECK (amount > 0),
  CONSTRAINT "financial_titles_hash_ck" CHECK (source_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "title_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "title_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "amount" numeric(16,2) NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "source_ref" text NOT NULL,
  "actor_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "title_events_title_tenant_fk" FOREIGN KEY ("title_id", "tenant_id") REFERENCES "financial_titles"("id", "tenant_id"),
  CONSTRAINT "title_events_actor_tenant_fk" FOREIGN KEY ("actor_id", "tenant_id") REFERENCES "users"("id", "tenant_id"),
  CONSTRAINT "title_events_source_uq" UNIQUE ("tenant_id", "title_id", "source_ref"),
  CONSTRAINT "title_events_type_ck" CHECK (event_type IN ('settlement', 'reversal')),
  CONSTRAINT "title_events_amount_ck" CHECK (amount > 0)
);
--> statement-breakpoint
CREATE TABLE "credit_limits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "customer_id" uuid NOT NULL,
  "limit_amount" numeric(16,2) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "valid_from" date NOT NULL,
  "valid_until" date,
  "source" text NOT NULL,
  "approved_by" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "credit_limits_customer_tenant_fk" FOREIGN KEY ("customer_id", "tenant_id") REFERENCES "customers"("id", "tenant_id"),
  CONSTRAINT "credit_limits_approver_tenant_fk" FOREIGN KEY ("approved_by", "tenant_id") REFERENCES "users"("id", "tenant_id"),
  CONSTRAINT "credit_limits_amount_ck" CHECK (limit_amount >= 0),
  CONSTRAINT "credit_limits_period_ck" CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
--> statement-breakpoint
CREATE TABLE "finance_import_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "source" text NOT NULL,
  "file_hash" varchar(64) NOT NULL,
  "counts" jsonb NOT NULL,
  "errors" jsonb NOT NULL,
  "started_at" timestamptz DEFAULT now() NOT NULL,
  "finished_at" timestamptz,
  CONSTRAINT "finance_import_runs_source_hash_uq" UNIQUE ("tenant_id", "source", "file_hash"),
  CONSTRAINT "finance_import_runs_hash_ck" CHECK (file_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE FUNCTION reject_finance_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Financial history is immutable'; END $$;
--> statement-breakpoint
CREATE TRIGGER title_events_immutable BEFORE UPDATE OR DELETE ON title_events FOR EACH ROW EXECUTE FUNCTION reject_finance_history_mutation();
--> statement-breakpoint
CREATE TRIGGER finance_import_runs_immutable BEFORE UPDATE OR DELETE ON finance_import_runs FOR EACH ROW EXECUTE FUNCTION reject_finance_history_mutation();
