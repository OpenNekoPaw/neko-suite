/**
 * Shared coverage configuration for all vitest packages.
 *
 * All packages use vitest v4.1+ — coverage ENOENT race fixed upstream.
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
    processingConcurrency: 1,
    thresholds: {
      lines: 30,
      branches: 20,
      functions: 25,
      statements: 30,
    },
    ...overrides,
  };
}
