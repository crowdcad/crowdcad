import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Discourage direct Firebase imports outside the service adapters.
    // Use '@/lib/services' instead so the backend stays swappable.
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["firebase/firestore", "firebase/auth", "firebase/storage"],
              message:
                "Import from '@/lib/services' instead of Firebase directly. " +
                "Exception: files inside src/lib/services/firebase/ may import Firebase.",
            },
          ],
        },
      ],
    },
    ignores: ["src/lib/services/firebase/**"],
  },
  {
    // TAK live tracking (optional, in development) is one module. Code
    // outside it may import only its public entry (src/features/tak/index.ts),
    // and only dynamically or as types; see docs/tak-integration/plan.md.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/features/tak/**"],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src",
              from: "./src/features/tak",
              except: ["./index.ts"],
              message: "Import TAK code only through '@/features/tak' (its public entry).",
            },
          ],
        },
      ],
      // A static value import would put TAK code in the page's bundle; load it
      // with import('@/features/tak') or next/dynamic instead. Types are fine.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/tak", "@/features/tak/*"],
              allowTypeImports: true,
              message: "Load TAK code with a dynamic import (import('@/features/tak') or next/dynamic); only `import type` may be static.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
