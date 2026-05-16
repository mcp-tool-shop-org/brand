/**
 * vitest.config.ts — Test suite configuration.
 *
 * Earned in Stage C (Humanization). Closes:
 *   - F-TESTS-B-004 (coverage threshold gate)
 *   - F-TESTS-B-005 (slowTestThreshold for child-process tax visibility)
 *   - F-TESTS-B-009 / F-TESTS-B-012 (stale-temp-dir cleanup via globalTeardown)
 *
 * Notes:
 *   - pool='forks' isolates child_process-spawning tests so a leaked handle
 *     in one test file cannot contaminate another.
 *   - slowTestThreshold is set to 600ms (the default is 300ms). The two
 *     CLI-shell test files (manifest-cmd, verify) genuinely pay a Node-startup
 *     tax of 150-250ms per spawn. 600ms gives a warning before the tax
 *     compounds quietly across new tests.
 *   - Coverage thresholds are calibrated to the current suite state. The
 *     CLI entrypoint (cli.ts) is excluded — it is exercised end-to-end by
 *     the CLI tests but the coverage tool sees only the dispatch shim,
 *     producing noise that does not reflect actual coverage health.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    isolate: true,
    // Tests exceeding this threshold print a warning (does not fail the run).
    // 600ms accommodates the child_process Node-startup tax in
    // manifest-cmd.test.ts and verify.test.ts. Anything above 600ms in a
    // non-CLI test is a real surprise worth investigating.
    slowTestThreshold: 600,
    globalSetup: './tests/_helpers/global-setup.ts',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli.ts', // dispatch shim — exercised end-to-end by CLI tests
        '**/*.d.ts',
        '**/*.test.ts',
      ],
      thresholds: {
        lines: 85,
        branches: 80,
        functions: 85,
        statements: 85,
      },
    },
  },
});
