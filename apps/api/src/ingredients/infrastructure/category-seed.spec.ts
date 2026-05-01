import { DEFAULT_TAXONOMY, countSeedNodes } from './category-seed';

describe('DEFAULT_TAXONOMY', () => {
  it('has at least 30 nodes (PRD-M1 Appendix A target: 30+)', () => {
    expect(countSeedNodes()).toBeGreaterThanOrEqual(30);
  });

  it('has exactly 35 nodes (4 roots + 31 children)', () => {
    expect(countSeedNodes()).toBe(35);
  });

  it('has 4 root nodes', () => {
    expect(DEFAULT_TAXONOMY.length).toBe(4);
  });

  it('every node has non-empty name, nameEs, nameEn', () => {
    function check(nodes: typeof DEFAULT_TAXONOMY): void {
      for (const n of nodes) {
        expect(n.name).toMatch(/^[a-z][a-z0-9-]*$/);
        expect(n.nameEs.length).toBeGreaterThan(0);
        expect(n.nameEn.length).toBeGreaterThan(0);
        if (n.children) check(n.children);
      }
    }
    check(DEFAULT_TAXONOMY);
  });

  it('has the expected roots (fresh, dry-pantry, beverages, other)', () => {
    expect(DEFAULT_TAXONOMY.map((n) => n.name)).toEqual(['fresh', 'dry-pantry', 'beverages', 'other']);
  });
});
