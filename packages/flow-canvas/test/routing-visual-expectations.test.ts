import { describe, expect, it } from 'vitest';
import { visualExpectationsFromRoutingCase } from '../src/routing-visual-expectations';

describe('visualExpectationsFromRoutingCase', () => {
  it('maps trivial short-circuit to fast path', () => {
    const v = visualExpectationsFromRoutingCase({
      path: 'short-circuit',
      allowDirect: true,
      expectFirst: null,
    });
    expect(v.routeTier).toBe('trivial');
    expect(v.mapNodes).toEqual(['message', 'greeting', 'fast']);
    expect(v.mapEdges).toContain('greeting->fast');
    expect(v.delegates).toEqual([]);
  });

  it('maps personal-fact short-circuit', () => {
    const v = visualExpectationsFromRoutingCase({
      path: 'short-circuit',
      allowDirect: false,
    });
    expect(v.routeTier).toBe('personal_fact');
    expect(v.mapNodes).toContain('fact');
    expect(v.mapEdges).toContain('classify->fact');
  });

  it('maps dispatcher case with first delegate', () => {
    const v = visualExpectationsFromRoutingCase({
      path: 'dispatcher',
      expectFirst: 'team.coder',
    });
    expect(v.routeTier).toBe('complex_agentic');
    expect(v.mapNodes).toEqual(['message', 'greeting', 'classify', 'complex', 'loop', 'answer']);
    expect(v.delegates).toEqual(['team.coder']);
    expect(v.mapEdges).toContain('classify->complex');
    expect(v.mapEdges).toContain('loop->answer');
  });

  it('collects expectAny delegates without duplicating expectFirst', () => {
    const v = visualExpectationsFromRoutingCase({
      path: 'dispatcher',
      expectFirst: 'team.coder',
      expectAny: ['team.coder', 'team.researcher'],
    });
    expect(v.delegates).toEqual(['team.coder', 'team.researcher']);
  });
});
