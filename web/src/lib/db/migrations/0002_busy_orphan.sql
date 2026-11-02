ALTER TABLE "market_assets" ADD COLUMN "provider" varchar(20) DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "market_assets" ADD COLUMN "provider_symbol" varchar(50);
--> statement-breakpoint
UPDATE "market_assets" SET "provider" = 'BCB_PTAX' WHERE "symbol" = 'USD-BRL-PTAX';
--> statement-breakpoint
UPDATE "market_assets" SET "provider" = 'METALS_API', "provider_symbol" = 'LME-ALU' WHERE "symbol" = 'LME-ALU';
--> statement-breakpoint
UPDATE "market_assets" SET "provider" = 'METALS_API', "provider_symbol" = 'STEEL-HRC' WHERE "symbol" = 'CME-HRC';
--> statement-breakpoint
UPDATE "market_assets" SET "provider" = 'METALS_API', "provider_symbol" = 'STEEL-HRC-CN' WHERE "symbol" = 'CN-HRC-FOB';
