CREATE TYPE "public"."comment_moderation_status" AS ENUM('pending', 'approved', 'rejected', 'spam');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'scheduled', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."contribution_status" AS ENUM('open', 'merged', 'closed');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('note', 'essay', 'performance');--> statement-breakpoint
CREATE TYPE "public"."graph_edge_kind" AS ENUM('tag', 'link', 'semantic');--> statement-breakpoint
CREATE TYPE "public"."graph_node_kind" AS ENUM('concept', 'project', 'writing', 'music', 'oss');--> statement-breakpoint
CREATE TYPE "public"."project_kind" AS ENUM('project', 'experience');--> statement-breakpoint
CREATE TYPE "public"."project_link_kind" AS ENUM('repository', 'live', 'demo', 'writeup', 'other');--> statement-breakpoint
CREATE TABLE "analytics_daily_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"event_name" text NOT NULL,
	"path" text NOT NULL,
	"event_count" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" text NOT NULL,
	"path" text NOT NULL,
	"referrer" text,
	"session_id" uuid,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_events_properties_allowlist_check" CHECK (
        jsonb_typeof("analytics_events"."properties") = 'object'
        AND ("analytics_events"."properties" - ARRAY['viewportWidth', 'viewportHeight', 'language', 'timezone', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm']::text[]) = '{}'::jsonb
        AND ("analytics_events"."properties"->'viewportWidth' IS NULL OR jsonb_typeof("analytics_events"."properties"->'viewportWidth') = 'number')
        AND ("analytics_events"."properties"->'viewportHeight' IS NULL OR jsonb_typeof("analytics_events"."properties"->'viewportHeight') = 'number')
        AND ("analytics_events"."properties"->'language' IS NULL OR jsonb_typeof("analytics_events"."properties"->'language') = 'string')
        AND ("analytics_events"."properties"->'timezone' IS NULL OR jsonb_typeof("analytics_events"."properties"->'timezone') = 'string')
        AND ("analytics_events"."properties"->'utmSource' IS NULL OR jsonb_typeof("analytics_events"."properties"->'utmSource') = 'string')
        AND ("analytics_events"."properties"->'utmMedium' IS NULL OR jsonb_typeof("analytics_events"."properties"->'utmMedium') = 'string')
        AND ("analytics_events"."properties"->'utmCampaign' IS NULL OR jsonb_typeof("analytics_events"."properties"->'utmCampaign') = 'string')
        AND ("analytics_events"."properties"->'utmContent' IS NULL OR jsonb_typeof("analytics_events"."properties"->'utmContent') = 'string')
        AND ("analytics_events"."properties"->'utmTerm' IS NULL OR jsonb_typeof("analytics_events"."properties"->'utmTerm') = 'string')
      )
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"author_name" text,
	"body" text NOT NULL,
	"moderation_status" "comment_moderation_status" DEFAULT 'pending' NOT NULL,
	"author_reply_markdown" text,
	"author_replied_at" timestamp with time zone,
	"moderated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" "entry_kind" DEFAULT 'note' NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body_markdown" text NOT NULL,
	"cover_media_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_publication_timestamp_check" CHECK ("entries"."status" NOT IN ('scheduled', 'published') OR "entries"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "entry_music_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"work_title" text NOT NULL,
	"composer" text NOT NULL,
	"venue" text,
	"performed_at" timestamp with time zone,
	"youtube_url" text NOT NULL,
	"notes_markdown" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entry_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"kind" "entry_kind" DEFAULT 'note' NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body_markdown" text NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entry_revisions_number_positive_check" CHECK ("entry_revisions"."revision_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "knowledge_graph_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"kind" "graph_edge_kind" NOT NULL,
	"weight" double precision,
	"terms" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_graph_edges_distinct_nodes_check" CHECK ("knowledge_graph_edges"."source_id" <> "knowledge_graph_edges"."target_id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_graph_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"kind" "graph_node_kind" NOT NULL,
	"href" text,
	"body" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text NOT NULL,
	"alt_text" text,
	"width" integer,
	"height" integer,
	"byte_size" bigint,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "open_source_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo" text NOT NULL,
	"pr_number" integer NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"contributed_at" date NOT NULL,
	"status" "contribution_status" NOT NULL,
	"writeup_markdown" text,
	"featured" boolean DEFAULT false NOT NULL,
	"status_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "project_link_kind" NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_technologies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"kind" "project_kind" DEFAULT 'project' NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"organization" text,
	"summary" text,
	"body_markdown" text DEFAULT '' NOT NULL,
	"cover_media_id" uuid,
	"started_on" date,
	"ended_on" date,
	"published_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_publication_timestamp_check" CHECK ("projects"."status" NOT IN ('scheduled', 'published') OR "projects"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton_key" text DEFAULT 'default' NOT NULL,
	"site_title" text NOT NULL,
	"intro_markdown" text NOT NULL,
	"about_markdown" text DEFAULT '' NOT NULL,
	"contact_email" text,
	"avatar_media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_singleton_check" CHECK ("site_settings"."singleton_key" = 'default')
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_music_details" ADD CONSTRAINT "entry_music_details_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_revisions" ADD CONSTRAINT "entry_revisions_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_edges" ADD CONSTRAINT "knowledge_graph_edges_source_id_knowledge_graph_nodes_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."knowledge_graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_edges" ADD CONSTRAINT "knowledge_graph_edges_target_id_knowledge_graph_nodes_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."knowledge_graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_links" ADD CONSTRAINT "project_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_technologies" ADD CONSTRAINT "project_technologies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_avatar_media_id_media_id_fk" FOREIGN KEY ("avatar_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_daily_day_event_path_unique" ON "analytics_daily_aggregates" USING btree ("day","event_name","path");--> statement-breakpoint
CREATE INDEX "analytics_daily_day_idx" ON "analytics_daily_aggregates" USING btree ("day");--> statement-breakpoint
CREATE INDEX "analytics_events_occurred_idx" ON "analytics_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_name_occurred_idx" ON "analytics_events" USING btree ("event_name","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_path_occurred_idx" ON "analytics_events" USING btree ("path","occurred_at");--> statement-breakpoint
CREATE INDEX "comments_entry_created_idx" ON "comments" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_moderation_created_idx" ON "comments" USING btree ("moderation_status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_slug_unique" ON "entries" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "entries_publication_idx" ON "entries" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "entries_kind_publication_idx" ON "entries" USING btree ("kind","status","published_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_music_details_entry_unique" ON "entry_music_details" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entry_revisions_entry_number_unique" ON "entry_revisions" USING btree ("entry_id","revision_number");--> statement-breakpoint
CREATE INDEX "entry_revisions_entry_created_idx" ON "entry_revisions" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_graph_edges_pair_kind_unique" ON "knowledge_graph_edges" USING btree ("source_id","target_id","kind");--> statement-breakpoint
CREATE INDEX "knowledge_graph_edges_source_idx" ON "knowledge_graph_edges" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "knowledge_graph_edges_target_idx" ON "knowledge_graph_edges" USING btree ("target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_graph_nodes_key_unique" ON "knowledge_graph_nodes" USING btree ("key");--> statement-breakpoint
CREATE INDEX "knowledge_graph_nodes_kind_idx" ON "knowledge_graph_nodes" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "media_storage_key_unique" ON "media" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "media_url_unique" ON "media" USING btree ("url");--> statement-breakpoint
CREATE UNIQUE INDEX "open_source_contributions_repo_pr_unique" ON "open_source_contributions" USING btree ("repo","pr_number");--> statement-breakpoint
CREATE INDEX "open_source_contributions_status_date_idx" ON "open_source_contributions" USING btree ("status","contributed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_links_project_url_unique" ON "project_links" USING btree ("project_id","url");--> statement-breakpoint
CREATE INDEX "project_links_project_order_idx" ON "project_links" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "project_technologies_project_name_unique" ON "project_technologies" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "project_technologies_project_order_idx" ON "project_technologies" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_slug_unique" ON "projects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "projects_publication_order_idx" ON "projects" USING btree ("status","published_at","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "site_settings_singleton_unique" ON "site_settings" USING btree ("singleton_key");