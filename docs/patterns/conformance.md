# Pattern conformance checklists

Manual review checklists until automated probes land in CI. Use after axflow or graph runs when validating a pattern port.

**Rosetta detail:** [rosetta/](./rosetta/)

---

## axflow runs (`runKind: axflow`)

Observable via run detail timeline, `outputJson.axflow`, and engine `runs.jsonl`.

### Classify-And-Act

- [ ] One classification outcome per input item
- [ ] Exactly one handler path exercised (check result `kind` + `action`)
- [ ] Sensitive / low-confidence inputs → `escalate` (not autonomous handler)
- [ ] Classifier did not call write/approval tools (if traced)

### Fanout-And-Synthesize

- [ ] Branch count matches input substeps (or defaults)
- [ ] `synthesis.parts_merged` equals surviving branch count
- [ ] Synthesis output references all branches (spot-check overview/themes)

### Adversarial Verification

- [ ] `candidates` ≥ 1
- [ ] `confirmed.length + killed == candidates`
- [ ] Each confirmed item has `refutersTotal` and `refutedCount` with minority rule
- [ ] Claims unchanged from producer (removal-only)

### Generate-And-Filter

- [ ] Generator fan-out count matches seeds
- [ ] `kept.length <= keepCount`
- [ ] Discarded titles not present in kept set

### Tournament

- [ ] `roundCount` ≥ 1 for ≥2 competitors
- [ ] Single `winner` with non-empty approach/answer
- [ ] Judge calls == match count (spot-check stderr log if live)

### Loop Until Done

- [ ] `stoppedBy` is `dry-streak` or `max-rounds`
- [ ] `discovered` ids unique
- [ ] If `max-rounds`, flag for operator review (not false convergence)

---

## Graph child-runs (`runKind: graph`)

Today's executor is **linear only**. Use these when staging or after Phase 3–4.

### Classify-And-Act (staging workflow)

- [ ] `pattern_classify_act_staging`: two child runs (`classify`, `act`)
- [ ] Classify child completes before act child starts
- [ ] **Not yet:** exactly one of bug/feature/question/escalate handlers — requires Phase 4

### Fanout / Tournament / Loop

- [ ] **Defer** until graph Phase 3 (parallel/join) or Phase 4 (conditions)

---

## Automated future work

| Probe | Source |
|-------|--------|
| INV-3 golden tests | `adversarial-verification.ts --self-test` in ax-sandbox |
| Rosetta `fixtures[]` | upstream `spec/*.spec.md` §8 |
| axflow overlay node count | worker `axflow.*` events vs `FlowEntry.spec` |
