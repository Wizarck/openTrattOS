import type { PrintAdapter } from './adapter';

/**
 * Module-level registry of print adapters. apps/api/ registers every adapter
 * it wants to support at boot; the `LabelsService` looks up the adapter by
 * `Org.labelFields.printAdapter.id` at dispatch time.
 *
 * Class-based instead of plain Map so apps/api/ can inject it via NestJS DI.
 */
export class PrintAdapterRegistry {
  private readonly adapters = new Map<string, PrintAdapter>();

  register(adapter: PrintAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(
        `PrintAdapterRegistry: adapter with id "${adapter.id}" already registered`,
      );
    }
    this.adapters.set(adapter.id, adapter);
  }

  unregister(id: string): boolean {
    return this.adapters.delete(id);
  }

  get(id: string): PrintAdapter | undefined {
    return this.adapters.get(id);
  }

  has(id: string): boolean {
    return this.adapters.has(id);
  }

  list(): readonly PrintAdapter[] {
    return [...this.adapters.values()];
  }
}
