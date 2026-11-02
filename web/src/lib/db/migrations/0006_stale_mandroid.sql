CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_name" varchar(50) NOT NULL,
	"user_prompt" text,
	"tools_executed" jsonb,
	"agent_response" text NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"latency_ms" integer,
	"feedback_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"briefing_date" date NOT NULL,
	"summary_html" text NOT NULL,
	"summary_text" text NOT NULL,
	"key_metrics" jsonb NOT NULL,
	"recommended_actions" jsonb,
	"sent_via_email_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_briefings" ADD CONSTRAINT "daily_briefings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_actions_tenant_created" ON "agent_actions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_actions_user" ON "agent_actions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_daily_briefings_tenant_date" ON "daily_briefings" USING btree ("tenant_id","briefing_date");