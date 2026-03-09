import type { CoverageOptions } from 'vitest';

type CoverageConfig = CoverageOptions<'v8'>;

export function sharedCoverage(overrides?: Partial<CoverageConfig>): CoverageConfig {
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
    thresholds: {
      lines: 30,
      branches: 20,
      functions: 25,
      statements: 30,
    },
    ...overrides,
  };
}
