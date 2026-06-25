-- Custom HTTP tools registered via API
CREATE TABLE "custom_tools" (
  "qualified_name" text PRIMARY KEY NOT NULL,
  "namespace" text DEFAULT 'http' NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "risk" text DEFAULT 'risky' NOT NULL,
  "method" text DEFAULT 'POST' NOT NULL,
  "url_template" text NOT NULL,
  "parameters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "headers_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "body_template" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
