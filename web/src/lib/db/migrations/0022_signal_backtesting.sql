CREATE TABLE "signal_models" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "version" varchar(40) NOT NULL,
  "component_config" jsonb NOT NULL,
  "weights" jsonb NOT NULL,
  "thresholds" jsonb NOT NULL,
  "horizon_days" integer NOT NULL CHECK (horizon_days > 0),
  "minimum_coverage" numeric(5,4) NOT NULL CHECK (minimum_coverage > 0 AND minimum_coverage <= 1),
  "methodology" jsonb NOT NULL,
  "approved_by" uuid REFERENCES "users"("id"),
  "active_from" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "uq_signal_models_tenant_version" UNIQUE ("tenant_id", "version"),
  CONSTRAINT "uq_signal_models_id_tenant" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "signal_models_activation_ck" CHECK ("active_from" IS NULL OR "approved_by" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "signal_observations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "model_id" uuid NOT NULL,
  "entity" varchar(100) NOT NULL,
  "score" numeric(6,3) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  "signal" varchar(40) NOT NULL,
  "confidence" numeric(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  "components" jsonb NOT NULL,
  "inputs_hash" varchar(64) NOT NULL,
  "as_of" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "signal_observations_model_tenant_fk" FOREIGN KEY ("model_id", "tenant_id") REFERENCES "signal_models" ("id", "tenant_id")
);
--> statement-breakpoint
CREATE TABLE "backtest_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "model_id" uuid NOT NULL,
  "dataset_hash" varchar(64) NOT NULL,
  "period" jsonb NOT NULL,
  "methodology" jsonb NOT NULL,
  "costs" jsonb NOT NULL,
  "benchmark" jsonb NOT NULL,
  "metrics" jsonb NOT NULL,
  "run_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "backtest_runs_model_tenant_fk" FOREIGN KEY ("model_id", "tenant_id") REFERENCES "signal_models" ("id", "tenant_id")
);
--> statement-breakpoint
CREATE INDEX "idx_signal_observations_tenant_asof" ON "signal_observations" ("tenant_id", "as_of");
--> statement-breakpoint
CREATE INDEX "idx_backtest_runs_tenant_time" ON "backtest_runs" ("tenant_id", "run_at");
--> statement-breakpoint
CREATE FUNCTION prevent_signal_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LAC-07 history is immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER signal_models_immutable BEFORE UPDATE OR DELETE ON "signal_models" FOR EACH ROW EXECUTE FUNCTION prevent_signal_history_mutation();
--> statement-breakpoint
CREATE TRIGGER signal_observations_immutable BEFORE UPDATE OR DELETE ON "signal_observations" FOR EACH ROW EXECUTE FUNCTION prevent_signal_history_mutation();
--> statement-breakpoint
CREATE TRIGGER backtest_runs_immutable BEFORE UPDATE OR DELETE ON "backtest_runs" FOR EACH ROW EXECUTE FUNCTION prevent_signal_history_mutation();
