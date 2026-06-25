-- Graph workflows and parent/child run linkage
ALTER TABLE "runs" ADD COLUMN "parent_run_id" uuid REFERENCES "runs"("id") ON DELETE CASCADE;
ALTER TABLE "runs" ADD COLUMN "step_key" text;
ALTER TABLE "runs" ADD COLUMN "run_kind" text DEFAULT 'agent' NOT NULL;

CREATE INDEX "runs_parent_idx" ON "runs" ("parent_run_id");

CREATE TABLE "graph_workflows" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
