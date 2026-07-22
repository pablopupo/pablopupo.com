import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const contentStatus = pgEnum("content_status", [
  "draft",
  "scheduled",
  "published",
  "archived",
]);
export const entryKind = pgEnum("entry_kind", ["note", "essay", "performance"]);
export const entrySection = pgEnum("entry_section", ["writing", "music"]);
export const projectKind = pgEnum("project_kind", ["project", "experience"]);
export const projectLinkKind = pgEnum("project_link_kind", [
  "repository",
  "live",
  "demo",
  "writeup",
  "other",
]);
export const contributionStatus = pgEnum("contribution_status", [
  "open",
  "merged",
  "closed",
]);
export const graphNodeKind = pgEnum("graph_node_kind", [
  "concept",
  "project",
  "writing",
  "music",
  "oss",
]);
export const graphEdgeKind = pgEnum("graph_edge_kind", ["tag", "link", "semantic"]);
export const commentModerationStatus = pgEnum("comment_moderation_status", [
  "pending",
  "approved",
  "rejected",
  "spam",
]);

export type AnalyticsEventProperties = {
  viewportWidth?: number;
  viewportHeight?: number;
  language?: string;
  timezone?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

export type EntryPerformanceDetailsSnapshot = {
  workTitle: string;
  composer: string;
  venue: string | null;
  performedAt: string | null;
  youtubeUrl: string;
  notesMarkdown: string | null;
};

function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  };
}

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)]
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_unique").on(
      table.providerId,
      table.accountId
    ),
  ]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const media = pgTable(
  "media",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storageKey: text("storage_key").notNull(),
    url: text("url").notNull(),
    mimeType: text("mime_type").notNull(),
    altText: text("alt_text"),
    width: integer("width"),
    height: integer("height"),
    byteSize: bigint("byte_size", { mode: "number" }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("media_storage_key_unique").on(table.storageKey),
    uniqueIndex("media_url_unique").on(table.url),
  ]
);

export const siteSettings = pgTable(
  "site_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    singletonKey: text("singleton_key").default("default").notNull(),
    siteTitle: text("site_title").notNull(),
    introMarkdown: text("intro_markdown").notNull(),
    aboutMarkdown: text("about_markdown").default("").notNull(),
    contactEmail: text("contact_email"),
    avatarMediaId: uuid("avatar_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("site_settings_singleton_unique").on(table.singletonKey),
    check("site_settings_singleton_check", sql`${table.singletonKey} = 'default'`),
  ]
);

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    kind: entryKind("kind").default("note").notNull(),
    section: entrySection("section").default("writing").notNull(),
    tags: text("tags").array().default(sql`ARRAY[]::text[]`).notNull(),
    status: contentStatus("status").default("draft").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    bodyMarkdown: text("body_markdown").notNull(),
    coverMediaId: uuid("cover_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("entries_slug_unique").on(table.slug),
    index("entries_publication_idx").on(table.status, table.publishedAt),
    index("entries_kind_publication_idx").on(table.kind, table.status, table.publishedAt),
    check(
      "entries_publication_timestamp_check",
      sql`${table.status} NOT IN ('scheduled', 'published') OR ${table.publishedAt} IS NOT NULL`
    ),
    check("entries_version_positive_check", sql`${table.version} > 0`),
  ]
);

export const entryMusicDetails = pgTable(
  "entry_music_details",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    workTitle: text("work_title").notNull(),
    composer: text("composer").notNull(),
    venue: text("venue"),
    performedAt: timestamp("performed_at", { withTimezone: true }),
    youtubeUrl: text("youtube_url").notNull(),
    notesMarkdown: text("notes_markdown"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("entry_music_details_entry_unique").on(table.entryId)]
);

export const entryRevisions = pgTable(
  "entry_revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    slug: text("slug").notNull(),
    kind: entryKind("kind").default("note").notNull(),
    section: entrySection("section").default("writing").notNull(),
    tags: text("tags").array().default(sql`ARRAY[]::text[]`).notNull(),
    status: contentStatus("status").default("draft").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    bodyMarkdown: text("body_markdown").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    performanceDetails: jsonb("performance_details").$type<EntryPerformanceDetailsSnapshot>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("entry_revisions_entry_number_unique").on(
      table.entryId,
      table.revisionNumber
    ),
    index("entry_revisions_entry_created_idx").on(table.entryId, table.createdAt),
    check(
      "entry_revisions_number_positive_check",
      sql`${table.revisionNumber} > 0`
    ),
  ]
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    kind: projectKind("kind").default("project").notNull(),
    status: contentStatus("status").default("draft").notNull(),
    title: text("title").notNull(),
    organization: text("organization"),
    summary: text("summary"),
    bodyMarkdown: text("body_markdown").default("").notNull(),
    coverMediaId: uuid("cover_media_id").references(() => media.id, {
      onDelete: "set null",
    }),
    startedOn: date("started_on"),
    endedOn: date("ended_on"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    sortOrder: integer("sort_order").default(0).notNull(),
    featured: boolean("featured").default(false).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("projects_slug_unique").on(table.slug),
    index("projects_publication_order_idx").on(
      table.status,
      table.publishedAt,
      table.sortOrder
    ),
    check(
      "projects_publication_timestamp_check",
      sql`${table.status} NOT IN ('scheduled', 'published') OR ${table.publishedAt} IS NOT NULL`
    ),
  ]
);

export const projectTechnologies = pgTable(
  "project_technologies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("project_technologies_project_name_unique").on(
      table.projectId,
      table.name
    ),
    index("project_technologies_project_order_idx").on(table.projectId, table.sortOrder),
  ]
);

export const projectLinks = pgTable(
  "project_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: projectLinkKind("kind").notNull(),
    label: text("label").notNull(),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    uniqueIndex("project_links_project_url_unique").on(table.projectId, table.url),
    index("project_links_project_order_idx").on(table.projectId, table.sortOrder),
  ]
);

export const openSourceContributions = pgTable(
  "open_source_contributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repo: text("repo").notNull(),
    prNumber: integer("pr_number").notNull(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    contributedAt: date("contributed_at").notNull(),
    status: contributionStatus("status").notNull(),
    writeupMarkdown: text("writeup_markdown"),
    featured: boolean("featured").default(false).notNull(),
    statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("open_source_contributions_repo_pr_unique").on(
      table.repo,
      table.prNumber
    ),
    index("open_source_contributions_status_date_idx").on(
      table.status,
      table.contributedAt
    ),
  ]
);

export const knowledgeGraphNodes = pgTable(
  "knowledge_graph_nodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    kind: graphNodeKind("kind").notNull(),
    href: text("href"),
    body: text("body").default("").notNull(),
    tags: text("tags").array().default(sql`ARRAY[]::text[]`).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("knowledge_graph_nodes_key_unique").on(table.key),
    index("knowledge_graph_nodes_kind_idx").on(table.kind),
  ]
);

export const knowledgeGraphEdges = pgTable(
  "knowledge_graph_edges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeGraphNodes.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => knowledgeGraphNodes.id, { onDelete: "cascade" }),
    kind: graphEdgeKind("kind").notNull(),
    weight: doublePrecision("weight"),
    terms: text("terms").array().default(sql`ARRAY[]::text[]`).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("knowledge_graph_edges_pair_kind_unique").on(
      table.sourceId,
      table.targetId,
      table.kind
    ),
    index("knowledge_graph_edges_source_idx").on(table.sourceId),
    index("knowledge_graph_edges_target_idx").on(table.targetId),
    check("knowledge_graph_edges_distinct_nodes_check", sql`${table.sourceId} <> ${table.targetId}`),
  ]
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    authorName: text("author_name"),
    body: text("body").notNull(),
    moderationStatus: commentModerationStatus("moderation_status")
      .default("pending")
      .notNull(),
    authorReplyMarkdown: text("author_reply_markdown"),
    authorRepliedAt: timestamp("author_replied_at", { withTimezone: true }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("comments_entry_created_idx").on(table.entryId, table.createdAt),
    index("comments_moderation_created_idx").on(
      table.moderationStatus,
      table.createdAt
    ),
  ]
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventName: text("event_name").notNull(),
    path: text("path").notNull(),
    referrer: text("referrer"),
    sessionId: uuid("session_id"),
    properties: jsonb("properties")
      .$type<AnalyticsEventProperties>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analytics_events_occurred_idx").on(table.occurredAt),
    index("analytics_events_name_occurred_idx").on(table.eventName, table.occurredAt),
    index("analytics_events_path_occurred_idx").on(table.path, table.occurredAt),
    check(
      "analytics_events_properties_allowlist_check",
      sql`
        jsonb_typeof(${table.properties}) = 'object'
        AND (${table.properties} - ARRAY['viewportWidth', 'viewportHeight', 'language', 'timezone', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm']::text[]) = '{}'::jsonb
        AND (${table.properties}->'viewportWidth' IS NULL OR jsonb_typeof(${table.properties}->'viewportWidth') = 'number')
        AND (${table.properties}->'viewportHeight' IS NULL OR jsonb_typeof(${table.properties}->'viewportHeight') = 'number')
        AND (${table.properties}->'language' IS NULL OR jsonb_typeof(${table.properties}->'language') = 'string')
        AND (${table.properties}->'timezone' IS NULL OR jsonb_typeof(${table.properties}->'timezone') = 'string')
        AND (${table.properties}->'utmSource' IS NULL OR jsonb_typeof(${table.properties}->'utmSource') = 'string')
        AND (${table.properties}->'utmMedium' IS NULL OR jsonb_typeof(${table.properties}->'utmMedium') = 'string')
        AND (${table.properties}->'utmCampaign' IS NULL OR jsonb_typeof(${table.properties}->'utmCampaign') = 'string')
        AND (${table.properties}->'utmContent' IS NULL OR jsonb_typeof(${table.properties}->'utmContent') = 'string')
        AND (${table.properties}->'utmTerm' IS NULL OR jsonb_typeof(${table.properties}->'utmTerm') = 'string')
      `
    ),
  ]
);

export const analyticsDailyAggregates = pgTable(
  "analytics_daily_aggregates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    day: date("day").notNull(),
    eventName: text("event_name").notNull(),
    path: text("path").notNull(),
    eventCount: bigint("event_count", { mode: "number" }).default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("analytics_daily_day_event_path_unique").on(
      table.day,
      table.eventName,
      table.path
    ),
    index("analytics_daily_day_idx").on(table.day),
  ]
);

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
