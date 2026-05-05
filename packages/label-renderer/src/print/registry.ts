import type { PrintAdapter } from './adapter';

/**
 * Factory that constructs a `PrintAdapter` instance from an org's config blob.
 * Each adapter family (IPP, Phomemo, Zebra, …) registers a factory keyed by
 * its stable id.
 */
export type PrintAdapterFactory = (config: Record<string, unknown>) => PrintAdapter;

/**
 * Module-level registry of print adapter factories. apps/api/ registers every
 * adapter family it supports at boot; `LabelsService` looks up the factory by
 * `Org.labelFields.printAdapter.id` and invokes it with the org's config to
 * build a fresh adapter for each dispatch.
 *
 * Factory pattern (instead of holding singleton adapter instances) so that
 * each org's URL / queue / auth flows into the adapter without the registry
 * needing per-org state.
 *
 * Class-based instead of plain Map so apps/api/ can inject it via NestJS DI.
 */
export class PrintAdapterRegistry {
  private readonly factories = new Map<string, PrintAdapterFactory>();

  register(id: string, factory: PrintAdapterFactory): void {
    if (this.factories.has(id)) {
      throw new Error(
        `PrintAdapterRegistry: adapter with id "${id}" already registered`,
      );
    }
    this.factories.set(id, factory);
  }

  unregister(id: string): boolean {
    return this.factories.delete(id);
  }

  /** Builds a fresh adapter from the org's stored config. */
  build(id: string, config: Record<string, unknown>): PrintAdapter | undefined {
    const factory = this.factories.get(id);
    return factory ? factory(config) : undefined;
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  /** Returns the registered ids (for diagnostics / Owner-config UI listings). */
  ids(): string[] {
    return [...this.factories.keys()];
  }
}
