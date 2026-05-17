import { defineConfig } from 'vitest/config';
import { sharedCoverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/extension/src/**/*.test.ts', 'packages/webview/src/**/*.test.ts'],
    // 全仓 Turbo 并发测试时，这个包的 worker 启动容易超时，收敛为单文件串行执行以提升稳定性。
    fileParallelism: false,
    coverage: sharedCoverage(),
  },
});
