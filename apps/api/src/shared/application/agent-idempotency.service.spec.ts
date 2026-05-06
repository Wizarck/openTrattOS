import { computeRequestHash } from './agent-idempotency.service';

describe('computeRequestHash', () => {
  it('produces a stable hex digest', () => {
    const a = computeRequestHash('POST', '/recipes', { name: 'pasta' });
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — identical inputs → identical hash', () => {
    const a = computeRequestHash('POST', '/recipes', { name: 'pasta' });
    const b = computeRequestHash('POST', '/recipes', { name: 'pasta' });
    expect(a).toBe(b);
  });

  it('canonicalises object key order', () => {
    const a = computeRequestHash('POST', '/recipes', { name: 'pasta', portions: 4 });
    const b = computeRequestHash('POST', '/recipes', { portions: 4, name: 'pasta' });
    expect(a).toBe(b);
  });

  it('preserves array order', () => {
    const a = computeRequestHash('POST', '/recipes', { lines: ['x', 'y'] });
    const b = computeRequestHash('POST', '/recipes', { lines: ['y', 'x'] });
    expect(a).not.toBe(b);
  });

  it('canonicalises nested object key order recursively', () => {
    const a = computeRequestHash('POST', '/recipes', {
      meta: { foo: 1, bar: 2 },
      name: 'x',
    });
    const b = computeRequestHash('POST', '/recipes', {
      name: 'x',
      meta: { bar: 2, foo: 1 },
    });
    expect(a).toBe(b);
  });

  it('treats different methods as distinct', () => {
    const a = computeRequestHash('POST', '/recipes', { name: 'x' });
    const b = computeRequestHash('PUT', '/recipes', { name: 'x' });
    expect(a).not.toBe(b);
  });

  it('treats different paths as distinct', () => {
    const a = computeRequestHash('POST', '/recipes', { name: 'x' });
    const b = computeRequestHash('POST', '/menu-items', { name: 'x' });
    expect(a).not.toBe(b);
  });

  it('treats undefined body and null body as distinct from {}', () => {
    const empty = computeRequestHash('POST', '/recipes', {});
    const undef = computeRequestHash('POST', '/recipes', undefined);
    const nul = computeRequestHash('POST', '/recipes', null);
    expect(empty).not.toBe(undef);
    expect(empty).not.toBe(nul);
    expect(undef).not.toBe(nul);
  });

  it('handles primitives', () => {
    const a = computeRequestHash('POST', '/x', 'string-body');
    const b = computeRequestHash('POST', '/x', 42);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
