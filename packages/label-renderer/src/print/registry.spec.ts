import { PrintAdapterRegistry } from './registry';
import type { PrintAdapter, PrintJob, PrintResult } from './adapter';

class StubAdapter implements PrintAdapter {
  constructor(public readonly id: string, public readonly receivedConfig: Record<string, unknown>) {}
  readonly accepts = ['pdf'] as const;
  async print(_job: PrintJob): Promise<PrintResult> {
    return { ok: true };
  }
}

describe('PrintAdapterRegistry', () => {
  it('registers + builds adapters by id with the org config', () => {
    const reg = new PrintAdapterRegistry();
    reg.register('ipp', (config) => new StubAdapter('ipp', config));
    expect(reg.has('ipp')).toBe(true);
    const built = reg.build('ipp', { url: 'http://printer.local' }) as StubAdapter;
    expect(built).toBeDefined();
    expect(built.id).toBe('ipp');
    expect(built.receivedConfig).toEqual({ url: 'http://printer.local' });
  });

  it('throws on duplicate registration', () => {
    const reg = new PrintAdapterRegistry();
    reg.register('ipp', (config) => new StubAdapter('ipp', config));
    expect(() =>
      reg.register('ipp', (config) => new StubAdapter('ipp', config)),
    ).toThrow(/already registered/);
  });

  it('returns undefined for unknown ids', () => {
    const reg = new PrintAdapterRegistry();
    expect(reg.build('nonexistent', {})).toBeUndefined();
    expect(reg.has('nonexistent')).toBe(false);
  });

  it('lists all registered ids', () => {
    const reg = new PrintAdapterRegistry();
    reg.register('ipp', (config) => new StubAdapter('ipp', config));
    reg.register('zebra-zpl', (config) => new StubAdapter('zebra-zpl', config));
    expect(reg.ids().sort()).toEqual(['ipp', 'zebra-zpl']);
  });

  it('unregisters cleanly', () => {
    const reg = new PrintAdapterRegistry();
    reg.register('ipp', (config) => new StubAdapter('ipp', config));
    expect(reg.unregister('ipp')).toBe(true);
    expect(reg.has('ipp')).toBe(false);
    expect(reg.unregister('ipp')).toBe(false);
  });

  it('produces a fresh adapter instance per build call', () => {
    const reg = new PrintAdapterRegistry();
    reg.register('ipp', (config) => new StubAdapter('ipp', config));
    const a = reg.build('ipp', { url: 'a' });
    const b = reg.build('ipp', { url: 'b' });
    expect(a).not.toBe(b);
  });
});
