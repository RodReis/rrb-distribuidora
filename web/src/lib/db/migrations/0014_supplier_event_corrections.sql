ALTER TABLE "supplier_delivery_events" ADD COLUMN "compensates_event_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_delivery_events" ADD COLUMN "correction_reason" text;--> statement-breakpoint
ALTER TABLE "supplier_delivery_events" ADD CONSTRAINT "uq_supplier_delivery_events_scope" UNIQUE("id","tenant_id","purchase_order_id");--> statement-breakpoint
ALTER TABLE "supplier_delivery_events" ADD CONSTRAINT "supplier_delivery_events_compensation_scope_fk" FOREIGN KEY ("compensates_event_id","tenant_id","purchase_order_id") REFERENCES "public"."supplier_delivery_events"("id","tenant_id","purchase_order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_supplier_delivery_events_compensation" ON "supplier_delivery_events" USING btree ("tenant_id","compensates_event_id") WHERE compensates_event_id is not null;
