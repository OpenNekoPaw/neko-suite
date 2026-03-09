/**
 * Shared coverage configuration for all vitest packages.
 *
 * NOTE: `thresholds` are commented out until vitest versions are unified
 * across the monorepo (currently mixed v1/v2/v3/v4). Once all packages
 * use vitest v3+, uncomment thresholds to enforce coverage gates.
 */
export function sharedCoverage(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    provider: 'v8',
    reporter: ['text', 'json-summary', 'html'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/index.ts',
      '**/types.ts',
      '**/__mocks__/**',
      '**/generated/**',
    ],
    // TODO(P1): Enable after unifying vitest versions across monorepo
    // thresholds: {
    //   lines: 30,
    //   branches: 20,
    //   functions: 25,
    //   statements: 30,
    // },
    ...overrides,
  };
}
