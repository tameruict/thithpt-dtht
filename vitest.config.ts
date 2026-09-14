import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirror the `@/* -> ./src/*` alias from tsconfig.json so unit tests can import
// modules that use the `@/` path alias (e.g. proxy.ts -> @/lib/supabase/proxy).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Keep the application test run scoped to this project. The cloned
    // ui-ux-pro-max-skill repository and archived artifacts have their own
    // test runners/dependencies and are not part of this app's Vitest suite.
    exclude: ['node_modules/**', 'ui-ux-pro-max-skill/**', 'artifacts/**'],
  },
});
