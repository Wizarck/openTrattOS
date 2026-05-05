import { IppPrintAdapter } from './ipp-adapter';
import type { PrintJob } from './adapter';

interface RecordedCall {
  url: string;
  options?: { headers?: Record<string, string> };
  msg: unknown;
}

function makeIppStub(behavior: 'success' | 'unreachable' | 'rejected' | 'timeout'): {
  module: unknown;
  recorded: RecordedCall[];
} {
  const recorded: RecordedCall[] = [];
  const stub = {
    Printer: class StubPrinter {
      constructor(
        public readonly url: string,
        public readonly options?: { headers?: Record<string, string> },
      ) {}
      execute(_op: string, msg: unknown, cb: (err: Error | null, res?: unknown) => void): void {
        recorded.push({ url: this.url, options: this.options, msg });
        if (behavior === 'success') {
          setImmediate(() =>
            cb(null, {
              statusCode: 'successful-ok',
              'job-attributes-tag': { 'job-id': 12345 },
            }),
          );
        } else if (behavior === 'unreachable') {
          setImmediate(() => cb(new Error('ECONNREFUSED 192.0.2.1:631')));
        } else if (behavior === 'rejected') {
          setImmediate(() => cb(null, { statusCode: 'client-error-not-authorized' }));
        }
        // timeout: never invoke cb
      }
    },
  };
  return { module: stub, recorded };
}

describe('IppPrintAdapter', () => {
  const baseJob: PrintJob = {
    pdf: Buffer.from('%PDF-test'),
    meta: {
      recipeId: 'r-1',
      organizationId: 'o-1',
      locale: 'es',
      pageSize: 'a4',
    },
  };

  it('accepts pdf payloads', () => {
    const adapter = new IppPrintAdapter({ url: 'http://printer.local:631/ipp/print' });
    expect(adapter.accepts).toContain('pdf');
    expect(adapter.id).toBe('ipp');
  });

  it('refuses to dispatch when no PDF payload is provided', async () => {
    const { module: ippStub } = makeIppStub('success');
    const adapter = new IppPrintAdapter(
      { url: 'http://printer.local:631/ipp/print' },
      ippStub as never,
    );
    const result = await adapter.print({ ...baseJob, pdf: undefined });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('UNSUPPORTED_FORMAT');
  });

  it('returns ok + job-id on successful Print-Job', async () => {
    const { module: ippStub, recorded } = makeIppStub('success');
    const adapter = new IppPrintAdapter(
      { url: 'http://printer.local:631/ipp/print', queue: 'kitchen' },
      ippStub as never,
    );
    const result = await adapter.print(baseJob);
    expect(result.ok).toBe(true);
    expect(result.jobId).toBe('12345');
    expect(recorded).toHaveLength(1);
    expect(recorded[0].url).toBe('http://printer.local:631/ipp/print');
    expect((recorded[0].msg as { 'operation-attributes-tag': { 'job-name': string } })[
      'operation-attributes-tag'
    ]['job-name']).toBe('kitchen');
  });

  it('forwards Bearer apiKey via Authorization header', async () => {
    const { module: ippStub, recorded } = makeIppStub('success');
    const adapter = new IppPrintAdapter(
      { url: 'http://printer.local:631/ipp/print', apiKey: 'secret-token' },
      ippStub as never,
    );
    await adapter.print(baseJob);
    expect(recorded[0].options?.headers?.Authorization).toBe('Bearer secret-token');
  });

  it('returns PRINTER_UNREACHABLE when the IPP client errors', async () => {
    const { module: ippStub } = makeIppStub('unreachable');
    const adapter = new IppPrintAdapter(
      { url: 'http://192.0.2.1:631/ipp/print' },
      ippStub as never,
    );
    const result = await adapter.print(baseJob);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PRINTER_UNREACHABLE');
    expect(result.error?.message).toMatch(/ECONNREFUSED/);
  });

  it('returns PRINTER_REJECTED when status is non-success', async () => {
    const { module: ippStub } = makeIppStub('rejected');
    const adapter = new IppPrintAdapter(
      { url: 'http://printer.local:631/ipp/print' },
      ippStub as never,
    );
    const result = await adapter.print(baseJob);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PRINTER_REJECTED');
    expect(result.error?.message).toMatch(/client-error-not-authorized/);
  });

  it('returns PRINTER_TIMEOUT when no response within timeoutMs', async () => {
    const { module: ippStub } = makeIppStub('timeout');
    const adapter = new IppPrintAdapter(
      { url: 'http://stuck.local/ipp/print', timeoutMs: 50 },
      ippStub as never,
    );
    const result = await adapter.print(baseJob);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PRINTER_TIMEOUT');
  });
});
