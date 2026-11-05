ALTER TABLE "users" ADD CONSTRAINT "users_id_tenant_lac08_uq" UNIQUE ("id", "tenant_id");
--> statement-breakpoint
CREATE TABLE "news_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "name" varchar(160) NOT NULL,
  "source_url" text NOT NULL,
  "license_reference" text,
  "display_rights" varchar(16) NOT NULL DEFAULT 'none',
  "retention_policy" text,
  "approved_by" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "news_sources_id_tenant_uq" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "news_sources_tenant_url_uq" UNIQUE ("tenant_id", "source_url"),
  CONSTRAINT "news_sources_approver_tenant_fk" FOREIGN KEY ("approved_by", "tenant_id") REFERENCES "users" ("id", "tenant_id"),
  CONSTRAINT "news_sources_rights_ck" CHECK (display_rights IN ('none', 'metadata', 'full')),
  CONSTRAINT "news_sources_license_ck" CHECK (display_rights = 'none' OR (license_reference IS NOT NULL AND retention_policy IS NOT NULL AND approved_by IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "news_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "source_id" uuid NOT NULL,
  "external_id" text NOT NULL,
  "title" text NOT NULL,
  "version" integer NOT NULL,
  "canonical_url" text NOT NULL,
  "published_at" timestamptz,
  "captured_at" timestamptz DEFAULT now() NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "rights_policy" text,
  "withdrawn" boolean DEFAULT false NOT NULL,
  "body" text,
  "correction_of" uuid,
  "captured_by" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "news_items_id_tenant_uq" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "news_items_source_tenant_fk" FOREIGN KEY ("source_id", "tenant_id") REFERENCES "news_sources" ("id", "tenant_id"),
  CONSTRAINT "news_items_correction_tenant_fk" FOREIGN KEY ("correction_of", "tenant_id") REFERENCES "news_items" ("id", "tenant_id"),
  CONSTRAINT "news_items_actor_tenant_fk" FOREIGN KEY ("captured_by", "tenant_id") REFERENCES "users" ("id", "tenant_id"),
  CONSTRAINT "news_items_source_external_version_uq" UNIQUE ("source_id", "external_id", "version"),
  CONSTRAINT "news_items_source_external_hash_uq" UNIQUE ("source_id", "external_id", "content_hash"),
  CONSTRAINT "news_items_version_ck" CHECK (version > 0),
  CONSTRAINT "news_items_hash_ck" CHECK (content_hash ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "news_classifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "item_id" uuid NOT NULL,
  "model_version" varchar(120) NOT NULL,
  "prompt_version" varchar(120) NOT NULL,
  "labels" jsonb NOT NULL,
  "sentiment" varchar(40),
  "confidence" numeric(5,4),
  "evidence" text,
  "review_status" varchar(24) NOT NULL DEFAULT 'pending',
  "reviewed_by" uuid,
  "reviewed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "news_classifications_item_tenant_fk" FOREIGN KEY ("item_id", "tenant_id") REFERENCES "news_items" ("id", "tenant_id"),
  CONSTRAINT "news_classifications_reviewer_tenant_fk" FOREIGN KEY ("reviewed_by", "tenant_id") REFERENCES "users" ("id", "tenant_id"),
  CONSTRAINT "news_classifications_review_ck" CHECK ((review_status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR (review_status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT "news_classifications_status_ck" CHECK (review_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT "news_classifications_confidence_ck" CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
--> statement-breakpoint
CREATE TABLE "regulatory_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "authority" varchar(160) NOT NULL,
  "act_id" varchar(160) NOT NULL,
  "version" integer NOT NULL,
  "jurisdiction" varchar(160) NOT NULL,
  "subject" text NOT NULL,
  "published_at" timestamptz,
  "effective_from" timestamptz,
  "effective_until" timestamptz,
  "status" varchar(32) NOT NULL,
  "primary_source_url" text NOT NULL,
  "supersedes_id" uuid,
  "reviewed_by" uuid NOT NULL,
  "reviewed_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "regulatory_items_id_tenant_uq" UNIQUE ("id", "tenant_id"),
  CONSTRAINT "regulatory_items_act_version_uq" UNIQUE ("tenant_id", "authority", "act_id", "version"),
  CONSTRAINT "regulatory_items_supersedes_tenant_fk" FOREIGN KEY ("supersedes_id", "tenant_id") REFERENCES "regulatory_items" ("id", "tenant_id"),
  CONSTRAINT "regulatory_items_reviewer_tenant_fk" FOREIGN KEY ("reviewed_by", "tenant_id") REFERENCES "users" ("id", "tenant_id"),
  CONSTRAINT "regulatory_items_dates_ck" CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from),
  CONSTRAINT "regulatory_items_version_ck" CHECK (version > 0)
);
--> statement-breakpoint
CREATE INDEX "news_items_tenant_captured_idx" ON "news_items" ("tenant_id", "captured_at" DESC);
--> statement-breakpoint
CREATE INDEX "regulatory_items_tenant_published_idx" ON "regulatory_items" ("tenant_id", "published_at" DESC);
--> statement-breakpoint
CREATE FUNCTION prevent_lac08_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LAC-08 history is immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER news_items_immutable BEFORE UPDATE OR DELETE ON "news_items" FOR EACH ROW EXECUTE FUNCTION prevent_lac08_history_mutation();
--> statement-breakpoint
CREATE TRIGGER news_classifications_immutable BEFORE UPDATE OR DELETE ON "news_classifications" FOR EACH ROW EXECUTE FUNCTION prevent_lac08_history_mutation();
--> statement-breakpoint
CREATE TRIGGER regulatory_items_immutable BEFORE UPDATE OR DELETE ON "regulatory_items" FOR EACH ROW EXECUTE FUNCTION prevent_lac08_history_mutation();
