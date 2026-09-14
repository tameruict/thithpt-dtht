import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".codex-tmp/**",
    "artifacts/**",
    // The cloned UI-UX Pro Max repository is a design reference/CLI asset,
    // not part of this Next.js application and has its own dependencies.
    "ui-ux-pro-max-skill/**",
    "test-exam-rooms.js",
    "test-exam-rooms.ts",
  ]),
]);

export default eslintConfig;
