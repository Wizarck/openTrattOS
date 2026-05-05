import { PrintAdapterRegistry } from './registry';
import type { PrintAdapter, PrintJob, PrintResult } from './adapter';

class StubAdapter implements PrintAdapter {
  constructor(public readonly id: string) {}
  readonly accepts = ['pdf'] as const;
  async print(_job: PrintJob): Promise<PrintResult> {
    return { ok: true };
  }
}

describe('PrintAdapterRegistry', () => {
  it('registers + looks up adapters by id', () => {
    const reg = new PrintAdapterRegistry();
    const a = new StubAdapter('ipp');
    reg.register(a);
    expect(reg.has('ipp')).toBe(true);
    expect(reg.get('ipp')).toBe(a);
  });

  it('throws on duplicate registration', () => {
    const reg = new PrintAdapterRegistry();
    reg.register(new StubAdapter('ipp'));
    expect(() => reg.register(new StubAdapter('ipp'))).toThrow(/already registered/);
  });

  it('returns undefined for unknown ids', () => {
    const reg = new PrintAdapterRegistry();
    expect(reg.get('nonexistent')).toBeUndefined();
    expect(reg.has('nonexistent')).toBe(false);
  });

  it('lists all registered adapters', () => {
    const reg = new PrintAdapterRegistry();
    reg.register(new StubAdapter('ipp'));
    reg.register(new StubAdapter('zebra-zpl'));
    expect(reg.list().map((a) => a.id).sort()).toEqual(['ipp', 'zebra-zpl']);
  });

  it('unregisters cleanly', () => {
    const reg = new PrintAdapterRegistry();
    reg.register(new StubAdapter('ipp'));
    expect(reg.unregister('ipp')).toBe(true);
    expect(reg.has('ipp')).toBe(false);
    expect(reg.unregister('ipp')).toBe(false);
  });
});
