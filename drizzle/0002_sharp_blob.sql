CREATE TYPE "public"."entry_section" AS ENUM('writing', 'music');--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "section" "entry_section";--> statement-breakpoint
ALTER TABLE "entries" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD COLUMN "section" "entry_section";--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD COLUMN "tags" text[];--> statement-breakpoint
UPDATE "entries"
SET
	"section" = CASE WHEN "kind" = 'performance' THEN 'music'::"entry_section" ELSE 'writing'::"entry_section" END,
	"tags" = ARRAY[]::text[];--> statement-breakpoint
UPDATE "entry_revisions"
SET
	"section" = "entries"."section",
	"tags" = "entries"."tags"
FROM "entries"
WHERE "entry_revisions"."entry_id" = "entries"."id";--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "section" SET DEFAULT 'writing';--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "section" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "entries" ALTER COLUMN "tags" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "entry_revisions" ALTER COLUMN "section" SET DEFAULT 'writing';--> statement-breakpoint
ALTER TABLE "entry_revisions" ALTER COLUMN "section" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "entry_revisions" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "entry_revisions" ALTER COLUMN "tags" SET NOT NULL;
