CREATE TABLE "rate_limit_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"client_key" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_buckets_scope_check" CHECK ("rate_limit_buckets"."scope" IN ('comments', 'analytics')),
	CONSTRAINT "rate_limit_buckets_client_key_check" CHECK (char_length("rate_limit_buckets"."client_key") = 64 AND "rate_limit_buckets"."client_key" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "rate_limit_buckets_request_count_check" CHECK ("rate_limit_buckets"."request_count" > 0),
	CONSTRAINT "rate_limit_buckets_expiration_check" CHECK ("rate_limit_buckets"."expires_at" > "rate_limit_buckets"."window_started_at" AND "rate_limit_buckets"."expires_at" <= "rate_limit_buckets"."window_started_at" + INTERVAL '10 minutes')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_buckets_scope_client_unique" ON "rate_limit_buckets" USING btree ("scope","client_key");--> statement-breakpoint
CREATE INDEX "rate_limit_buckets_expires_idx" ON "rate_limit_buckets" USING btree ("expires_at");