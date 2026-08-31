CREATE TYPE "public"."graph_origin" AS ENUM('automatic', 'manual');--> statement-breakpoint
CREATE TYPE "public"."graph_state" AS ENUM('suggested', 'public', 'hidden');--> statement-breakpoint
ALTER TABLE "knowledge_graph_edges" ADD COLUMN "origin" "graph_origin" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_graph_edges" ADD COLUMN "state" "graph_state" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_graph_edges" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_graph_edges" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD COLUMN "entry_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD COLUMN "label_override" text;--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD COLUMN "summary_override" text;--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD COLUMN "origin" "graph_origin" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD COLUMN "state" "graph_state" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD CONSTRAINT "knowledge_graph_nodes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD CONSTRAINT "knowledge_graph_nodes_entry_id_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "knowledge_graph_edges_state_idx" ON "knowledge_graph_edges" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_graph_nodes_project_unique" ON "knowledge_graph_nodes" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_graph_nodes_entry_unique" ON "knowledge_graph_nodes" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "knowledge_graph_nodes_state_idx" ON "knowledge_graph_nodes" USING btree ("state");--> statement-breakpoint
ALTER TABLE "knowledge_graph_edges" ADD CONSTRAINT "knowledge_graph_edges_version_positive_check" CHECK ("knowledge_graph_edges"."version" > 0);--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD CONSTRAINT "knowledge_graph_nodes_single_source_check" CHECK (num_nonnulls("knowledge_graph_nodes"."project_id", "knowledge_graph_nodes"."entry_id") <= 1);--> statement-breakpoint
ALTER TABLE "knowledge_graph_nodes" ADD CONSTRAINT "knowledge_graph_nodes_version_positive_check" CHECK ("knowledge_graph_nodes"."version" > 0);--> statement-breakpoint
UPDATE "knowledge_graph_nodes" AS node
SET
  "project_id" = project."id",
  "origin" = 'automatic'
FROM "projects" AS project
WHERE
  node."project_id" IS NULL
  AND node."entry_id" IS NULL
  AND node."kind" = 'project'
  AND node."key" = project."slug";--> statement-breakpoint
UPDATE "knowledge_graph_nodes" AS node
SET
  "entry_id" = entry."id",
  "origin" = 'automatic'
FROM "entries" AS entry
WHERE
  node."project_id" IS NULL
  AND node."entry_id" IS NULL
  AND node."kind" IN ('writing', 'music')
  AND node."key" = entry."slug";--> statement-breakpoint
INSERT INTO "knowledge_graph_nodes"
  ("key", "project_id", "label", "kind", "href", "body", "origin")
SELECT
  'project:' || project."id"::text,
  project."id",
  project."title",
  'project',
  '/work#' || project."slug",
  COALESCE(project."summary", ''),
  'automatic'
FROM "projects" AS project
WHERE NOT EXISTS (
  SELECT 1
  FROM "knowledge_graph_nodes" AS node
  WHERE node."project_id" = project."id"
);--> statement-breakpoint
INSERT INTO "knowledge_graph_nodes"
  ("key", "entry_id", "label", "kind", "href", "body", "origin")
SELECT
  'entry:' || entry."id"::text,
  entry."id",
  entry."title",
  CASE WHEN entry."section" = 'music' THEN 'music'::graph_node_kind ELSE 'writing'::graph_node_kind END,
  '/' || entry."section"::text || '/' || entry."slug",
  COALESCE(entry."summary", ''),
  'automatic'
FROM "entries" AS entry
WHERE NOT EXISTS (
  SELECT 1
  FROM "knowledge_graph_nodes" AS node
  WHERE node."entry_id" = entry."id"
);--> statement-breakpoint
UPDATE "knowledge_graph_nodes"
SET "state" = 'hidden'
WHERE "kind" = 'oss';--> statement-breakpoint
INSERT INTO "knowledge_graph_nodes"
  ("key", "label", "kind", "body", "origin", "state", "pinned")
VALUES
  (
    'applied-ai',
    'Applied AI',
    'concept',
    'Projects and notes about building useful AI systems.',
    'manual',
    'public',
    true
  ),
  (
    'music',
    'Music',
    'concept',
    'Classical piano performances, repertoire, and writing about music.',
    'manual',
    'public',
    true
  )
ON CONFLICT ("key") DO UPDATE
SET
  "state" = 'public',
  "pinned" = true;
