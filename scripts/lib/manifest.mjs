// Shared helpers for the control-plane scripts.
//
// Single home for things that were copy-pasted across the entrypoints:
//   1. readJson() — read + parse a JSON file from disk.
//   2. manifestPaths() — the on-disk `manifests/...` layout, derived from baseDir.
//   3. fail() — print a prefixed error and exit(1).
//   4. requireFile() — assert a file exists or fail.
//
// Keep the manifest layout defined here only; scripts import it instead of
// re-deriving `path.join(baseDir, "manifests", ...)` independently.

import fs from "node:fs";
import path from "node:path";

export function fail(message) {
  console.error(message);
  process.exit(1);
}

export function requireFile(filePath, prefix) {
  if (!fs.existsSync(filePath)) fail(`${prefix}: missing ${filePath}`);
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function manifestPaths(baseDir) {
  const m = (...parts) => path.join(baseDir, "manifests", ...parts);
  return {
    repos: m("repos.json"),
    wavesDir: m("waves"),
    tiers: m("policies", "repo-tiers.json"),
    exceptions: m("policies", "exception-list.json"),
    healthProfiles: m("policies", "repo-health-profiles.json"),
    governance: m("policies", "repo-governance.json"),
    hostedActionsPolicy: m("policies", "hosted-actions-policy.json"),
    forgejoRepos: m("forgejo-repos.json"),
  };
}
