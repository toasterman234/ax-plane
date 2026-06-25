import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../src/http-tool';

describe('renderTemplate', () => {
  it('substitutes placeholders', () => {
    expect(renderTemplate('https://example.com/{{id}}', { id: 'abc' }, true)).toBe('https://example.com/abc');
  });

  it('renders JSON body templates without encoding', () => {
    expect(renderTemplate('{"text":"{{message}}"}', { message: 'hello world' })).toBe('{"text":"hello world"}');
  });
});
