ALTER TABLE "eval_suites" ADD COLUMN "agent_id" text REFERENCES "agents"("id") ON DELETE SET NULL;

CREATE TABLE "optimization_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "suite_id" uuid NOT NULL REFERENCES "eval_suites"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'running',
  "optimizer_type" text NOT NULL DEFAULT 'ax-native-mock',
  "optimizer_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "baseline_eval_run_id" uuid REFERENCES "eval_runs"("id") ON DELETE SET NULL,
  "candidate_eval_run_id" uuid REFERENCES "eval_runs"("id") ON DELETE SET NULL,
  "error" text,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX "optimization_runs_agent_idx" ON "optimization_runs" ("agent_id", "created_at");

CREATE TABLE "agent_candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_id" text NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
  "source_optimization_run_id" uuid REFERENCES "optimization_runs"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "artifact_json" jsonb NOT NULL,
  "artifact_text" text,
  "baseline_score" integer,
  "candidate_score" integer,
  "metrics_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "promoted_version_id" uuid REFERENCES "agent_versions"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "promoted_at" timestamp with time zone
);

CREATE INDEX "agent_candidates_agent_idx" ON "agent_candidates" ("agent_id", "created_at");

ALTER TABLE "optimization_runs" ADD COLUMN "candidate_id" uuid REFERENCES "agent_candidates"("id") ON DELETE SET NULL;

ALTER TABLE "eval_runs" ADD COLUMN "candidate_id" uuid REFERENCES "agent_candidates"("id") ON DELETE SET NULL;
ALTER TABLE "eval_runs" ADD COLUMN "run_label" text;
