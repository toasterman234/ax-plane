-- Optional pattern tag + v2 DAG definition (executor still runs v1 steps until Phase 3–4)
ALTER TABLE "graph_workflows" ADD COLUMN IF NOT EXISTS "pattern" text;
ALTER TABLE "graph_workflows" ADD COLUMN IF NOT EXISTS "definition_json" jsonb;
