-- Eval lab: suites, cases, runs, and per-case results
CREATE TABLE "eval_suites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "eval_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "suite_id" uuid NOT NULL REFERENCES "eval_suites"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "task_text" text NOT NULL,
  "criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "eval_cases_suite_idx" ON "eval_cases" ("suite_id", "sort_order");

CREATE TABLE "eval_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "suite_id" uuid NOT NULL REFERENCES "eval_suites"("id") ON DELETE CASCADE,
  "agent_id" text NOT NULL REFERENCES "agents"("id"),
  "agent_version_id" uuid REFERENCES "agent_versions"("id"),
  "status" text DEFAULT 'running' NOT NULL,
  "mode" text DEFAULT 'mock' NOT NULL,
  "summary_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE INDEX "eval_runs_suite_idx" ON "eval_runs" ("suite_id", "created_at");

CREATE TABLE "eval_case_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "eval_run_id" uuid NOT NULL REFERENCES "eval_runs"("id") ON DELETE CASCADE,
  "case_id" uuid NOT NULL REFERENCES "eval_cases"("id") ON DELETE CASCADE,
  "run_id" uuid REFERENCES "runs"("id") ON DELETE SET NULL,
  "status" text NOT NULL,
  "score" integer DEFAULT 0 NOT NULL,
  "details_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "eval_case_results_run_idx" ON "eval_case_results" ("eval_run_id");
