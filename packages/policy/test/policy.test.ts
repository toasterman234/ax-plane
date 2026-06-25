import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from '../src/index';

describe('evaluatePolicy', () => {
  it('requires approval for fake risky action', () => {
    const result = evaluatePolicy({ runId: 'r1', qualifiedName: 'fake.riskyAction', args: {} });
    expect(result.decision).toBe('approval_required');
  });

  it('allows safe fake lookup', () => {
    const result = evaluatePolicy({ runId: 'r1', qualifiedName: 'fake.projectLookup', args: {} });
    expect(result.decision).toBe('allow');
  });

  it('allows read-only repo tools', () => {
    expect(evaluatePolicy({ runId: 'r1', qualifiedName: 'repo.readFile', args: { path: 'README.md' } }).decision).toBe('allow');
    expect(evaluatePolicy({ runId: 'r1', qualifiedName: 'github.searchIssues', args: { query: 'bug' } }).decision).toBe('allow');
    expect(evaluatePolicy({ runId: 'r1', qualifiedName: 'docs.search', args: { query: 'architecture' } }).decision).toBe('allow');
  });

  it('requires approval for write and shell tools', () => {
    expect(evaluatePolicy({ runId: 'r1', qualifiedName: 'repo.writeFile', args: { path: 'x.txt', content: 'hi' } }).decision).toBe('approval_required');
    expect(evaluatePolicy({ runId: 'r1', qualifiedName: 'github.createIssue', args: { title: 't' } }).decision).toBe('approval_required');
    expect(evaluatePolicy({ runId: 'r1', qualifiedName: 'shell.run', args: { command: 'echo hi' } }).decision).toBe('approval_required');
  });
});
