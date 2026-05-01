import {
  CycleDetectedError,
  DEFAULT_DEPTH_CAP,
  DepthLimitError,
  RecipeGraph,
  RecipeNode,
  detectCycleFrom,
  isSelfReference,
} from './cycle-detector';

function nodes(...names: string[]): Map<string, RecipeNode> {
  const m = new Map<string, RecipeNode>();
  for (const n of names) m.set(n, { id: n, name: n });
  return m;
}

function graph(adj: Record<string, string[]>): RecipeGraph {
  const g = new Map<string, Set<string>>();
  for (const [k, v] of Object.entries(adj)) g.set(k, new Set(v));
  return g;
}

describe('detectCycleFrom', () => {
  it('returns null for a leaf (no children)', () => {
    expect(detectCycleFrom('A', graph({}), nodes('A'))).toBeNull();
  });

  it('returns null for a single edge with no cycle', () => {
    expect(detectCycleFrom('A', graph({ A: ['B'] }), nodes('A', 'B'))).toBeNull();
  });

  it('returns null for a deep linear chain (A→B→C→D)', () => {
    expect(
      detectCycleFrom('A', graph({ A: ['B'], B: ['C'], C: ['D'] }), nodes('A', 'B', 'C', 'D')),
    ).toBeNull();
  });

  it('returns null for a DAG with branches', () => {
    expect(
      detectCycleFrom(
        'A',
        graph({ A: ['B', 'C'], B: ['D'], C: ['D'] }),
        nodes('A', 'B', 'C', 'D'),
      ),
    ).toBeNull();
  });

  it('detects a direct cycle A→B→A', () => {
    const hit = detectCycleFrom('A', graph({ A: ['B'], B: ['A'] }), nodes('A', 'B'));
    expect(hit?.code).toBe('CYCLE');
    expect(hit?.node1Id).toBe('A');
    expect(hit?.direction).toContain('A -> B -> A');
  });

  it('detects an indirect cycle A→B→C→A', () => {
    const hit = detectCycleFrom(
      'A',
      graph({ A: ['B'], B: ['C'], C: ['A'] }),
      nodes('A', 'B', 'C'),
    );
    expect(hit?.code).toBe('CYCLE');
    expect(hit?.direction).toContain('A -> B -> C -> A');
  });

  it('detects a self-loop A→A as a cycle', () => {
    const hit = detectCycleFrom('A', graph({ A: ['A'] }), nodes('A'));
    expect(hit?.code).toBe('CYCLE');
    expect(hit?.node1Id).toBe('A');
  });

  it('detects a cycle when reachable through a non-cyclic branch', () => {
    // A → B (no cycle); A → C → D → C (cycle through C-D-C)
    const hit = detectCycleFrom(
      'A',
      graph({ A: ['B', 'C'], B: [], C: ['D'], D: ['C'] }),
      nodes('A', 'B', 'C', 'D'),
    );
    expect(hit?.code).toBe('CYCLE');
    expect(hit?.direction).toContain('C -> D -> C');
  });

  it('throws DepthLimitError when chain exceeds the cap', () => {
    // 12-node linear chain, cap = 10
    const ids = Array.from({ length: 12 }, (_, i) => `N${i}`);
    const adj: Record<string, string[]> = {};
    for (let i = 0; i < ids.length - 1; i++) adj[ids[i]] = [ids[i + 1]];
    expect(() =>
      detectCycleFrom(ids[0], graph(adj), nodes(...ids), { depthCap: 10 }),
    ).toThrow(DepthLimitError);
  });

  it('respects custom depthCap', () => {
    const ids = ['A', 'B', 'C'];
    expect(() =>
      detectCycleFrom(
        'A',
        graph({ A: ['B'], B: ['C'] }),
        nodes(...ids),
        { depthCap: 2 },
      ),
    ).toThrow(DepthLimitError);
  });

  it('uses DEFAULT_DEPTH_CAP=10 when not provided', () => {
    expect(DEFAULT_DEPTH_CAP).toBe(10);
  });

  it('cycle detection wins over depth-cap when the cycle is shorter than the cap', () => {
    // A→B→A (length 2) with default cap 10: should report CYCLE, not depth.
    const hit = detectCycleFrom('A', graph({ A: ['B'], B: ['A'] }), nodes('A', 'B'));
    expect(hit?.code).toBe('CYCLE');
  });

  it('handles a graph where the start node is not in the adjacency map', () => {
    expect(detectCycleFrom('Orphan', graph({}), nodes('Orphan'))).toBeNull();
  });

  it('CycleDetectedError carries the hit', () => {
    const hit = {
      code: 'CYCLE' as const,
      node1Id: 'a',
      node1Name: 'A',
      node2Id: 'b',
      node2Name: 'B',
      direction: 'A -> B -> A',
    };
    const err = new CycleDetectedError(hit);
    expect(err.hit).toEqual(hit);
    expect(err.message).toContain('A -> B -> A');
  });
});

describe('isSelfReference', () => {
  it('returns CycleHit when subRecipe ids include the recipe itself', () => {
    const hit = isSelfReference('R1', ['X', 'R1', 'Y'], nodes('R1'));
    expect(hit?.node1Id).toBe('R1');
    expect(hit?.direction).toContain('self-reference');
  });

  it('returns null when no self-reference', () => {
    expect(isSelfReference('R1', ['X', 'Y'], nodes('R1'))).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(isSelfReference('R1', [], nodes('R1'))).toBeNull();
  });
});
