-- Persistent memory kernel entries (agent-scoped or global)
CREATE TABLE "memory_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" text REFERENCES "agents"("id") ON DELETE CASCADE,
  "run_id" uuid REFERENCES "runs"("id") ON DELETE SET NULL,
  "content" text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "memory_entries_agent_idx" ON "memory_entries" ("agent_id");
CREATE INDEX "memory_entries_created_idx" ON "memory_entries" ("created_at");
