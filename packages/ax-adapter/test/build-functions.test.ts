import { describe, expect, it } from 'vitest';
import { toAxFunctionName } from '../src/build-functions';

describe('toAxFunctionName', () => {
  it('makes names unique across namespaces', () => {
    expect(toAxFunctionName('repo.readFile')).toBe('repo_readFile');
    expect(toAxFunctionName('github.readFile')).toBe('github_readFile');
    expect(toAxFunctionName('docs.search')).toBe('docs_search');
  });
});
