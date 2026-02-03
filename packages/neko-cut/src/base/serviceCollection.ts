/**
 * Service Collection - Dependency Injection Container
 * VSCode-style service locator pattern
 */

// Service identifier type
export interface ServiceIdentifier<T> {
  readonly id: string;
  readonly _brand: T;
}

// Create a service identifier
export function createServiceId<T>(id: string): ServiceIdentifier<T> {
  return { id } as ServiceIdentifier<T>;
}

/**
 * Service Collection - manages service instances
 */
export class ServiceCollection {
  private readonly services = new Map<string, unknown>();

  /**
   * Register a service instance
   */
  set<T>(id: ServiceIdentifier<T>, instance: T): void {
    this.services.set(id.id, instance);
  }

  /**
   * Get a service instance
   */
  get<T>(id: ServiceIdentifier<T>): T | undefined {
    return this.services.get(id.id) as T | undefined;
  }

  /**
   * Check if a service is registered
   */
  has<T>(id: ServiceIdentifier<T>): boolean {
    return this.services.has(id.id);
  }

  /**
   * Remove a service
   */
  delete<T>(id: ServiceIdentifier<T>): boolean {
    return this.services.delete(id.id);
  }

  /**
   * Clear all services
   */
  clear(): void {
    this.services.clear();
  }
}

// Global service collection instance
let globalServices: ServiceCollection | undefined;

/**
 * Get the global service collection
 */
export function getServices(): ServiceCollection {
  if (!globalServices) {
    globalServices = new ServiceCollection();
  }
  return globalServices;
}

/**
 * Get a service from the global collection
 */
export function getService<T>(id: ServiceIdentifier<T>): T {
  const service = getServices().get(id);
  if (!service) {
    throw new Error(`Service not found: ${id.id}`);
  }
  return service;
}

/**
 * Try to get a service (returns undefined if not found)
 */
export function tryGetService<T>(id: ServiceIdentifier<T>): T | undefined {
  return getServices().get(id);
}

/**
 * Reset the global service collection (for testing)
 */
export function resetServices(): void {
  globalServices?.clear();
  globalServices = undefined;
}
