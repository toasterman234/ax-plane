CREATE TABLE "forge_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status" text NOT NULL DEFAULT 'intake',
  "intake_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "draft_json" jsonb,
  "agent_id" text REFERENCES "agents"("id") ON DELETE SET NULL,
  "suite_id" uuid REFERENCES "eval_suites"("id") ON DELETE SET NULL,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "forge_sessions_status_idx" ON "forge_sessions" ("status", "created_at");
