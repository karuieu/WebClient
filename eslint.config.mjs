import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * Use FlatCompat until eslint-config-next publishes native flat config; invoke ESLint directly instead of
 * next lint.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".next-build/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {


      // Require unknown with type guards rather than any, including at SDK boundaries.
      "@typescript-eslint/no-explicit-any": "error",

      // Empty catches are intentional for best-effort operations, such as draft writes to full storage.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
]

export default config;
