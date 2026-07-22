CREATE TYPE "public"."media_purpose" AS ENUM('profile', 'resume', 'content');--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "provider" text DEFAULT 'static' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "purpose" "media_purpose" DEFAULT 'content' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "headline" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "graduation_on" date;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "github_url" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "youtube_url" text;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "resume_media_id" uuid;--> statement-breakpoint
ALTER TABLE "site_settings" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_resume_media_id_media_id_fk" FOREIGN KEY ("resume_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_version_positive_check" CHECK ("site_settings"."version" > 0);--> statement-breakpoint
INSERT INTO "media" (
	"id",
	"storage_key",
	"url",
	"provider",
	"purpose",
	"original_filename",
	"sha256",
	"mime_type",
	"alt_text",
	"width",
	"height",
	"byte_size"
) VALUES
	(
		'4c6dfd5f-90bf-45fd-b922-fdf2e01b45fb',
		'media/pablo-pupo-portrait.jpg',
		'/media/pablo-pupo-portrait.jpg',
		'static',
		'profile',
		'pablo-pupo-portrait.jpg',
		'a26ce2ad31296fb149e124517a0faecf31d2c3ed1a24ef44b59171ce3e0b57ea',
		'image/jpeg',
		'Pablo Pupo smiling outside at the University of Florida',
		2848,
		4272,
		578420
	),
	(
		'8de31ccf-3422-497f-b1b1-9d3b61e5aa0a',
		'Pablo-Pupo-Resume.pdf',
		'/Pablo-Pupo-Resume.pdf',
		'static',
		'resume',
		'Pablo-Pupo-Resume.pdf',
		'9a1f7a93b1fe4a1b9879ad3fca8f589961d4f6085e895be11cc02b21a1b99096',
		'application/pdf',
		NULL,
		NULL,
		NULL,
		119473
	)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "site_settings" (
	"site_title",
	"headline",
	"location",
	"graduation_on",
	"intro_markdown",
	"about_markdown",
	"contact_email",
	"github_url",
	"linkedin_url",
	"youtube_url",
	"avatar_media_id",
	"resume_media_id"
)
SELECT
	'Pablo Pupo',
	'Software Engineer, Applied AI',
	'Miami, Florida',
	'2026-12-01',
	'I’m a software engineer focused on applied AI, open source, and reliable systems. I’m also a classical pianist.',
	'I study computer science at the University of Florida and build applied AI systems, with a focus on document intelligence, retrieval, and evaluation. I contribute to open source and write technical notes about what I learn. I’m also a classical pianist, and I share performances and writing about music here.',
	'pablofpupo23@gmail.com',
	'https://github.com/pablopupo',
	'https://linkedin.com/in/pablopupo',
	NULL,
	portrait."id",
	resume."id"
FROM "media" AS portrait
CROSS JOIN "media" AS resume
WHERE portrait."url" = '/media/pablo-pupo-portrait.jpg'
	AND resume."url" = '/Pablo-Pupo-Resume.pdf'
ON CONFLICT ("singleton_key") DO UPDATE SET
	"headline" = EXCLUDED."headline",
	"location" = EXCLUDED."location",
	"graduation_on" = EXCLUDED."graduation_on",
	"contact_email" = COALESCE("site_settings"."contact_email", EXCLUDED."contact_email"),
	"github_url" = EXCLUDED."github_url",
	"linkedin_url" = EXCLUDED."linkedin_url",
	"youtube_url" = NULL,
	"avatar_media_id" = COALESCE("site_settings"."avatar_media_id", EXCLUDED."avatar_media_id"),
	"resume_media_id" = EXCLUDED."resume_media_id";
