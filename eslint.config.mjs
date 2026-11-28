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
    // Icons come from '@/components/ui/icons', not lucide-react.
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "lucide-react",
              message: "Import icons from '@/components/ui/icons' (same names) so they switch to the compact glyphs in condensed mode.",
            },
          ],
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
    // The icon module is the one place that wraps lucide-react.
    files: ["src/components/ui/icons/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // No HeroUI press feedback (ripple, press scale, hover/press background)
    // on dropdown chevrons or modal close buttons: see src/lib/heroStatic.ts
    // and "Dropdown chevrons and modal close buttons" in docs/COMPONENTS.md.
    files: ["src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='Autocomplete']:not(:has(JSXAttribute[name.name='selectorButtonProps'] Identifier[name='staticSelectorButtonProps']))",
          message: "Give every Autocomplete selectorButtonProps={staticSelectorButtonProps} from '@/lib/heroStatic' (no press animation on the chevron).",
        },
        {
          selector: "JSXOpeningElement[name.name='Modal']:not(:has(JSXAttribute[name.name='hideCloseButton'])):not(:has(Identifier[name='STATIC_CLOSE_BUTTON_CLASS']))",
          message: "Give every Modal hideCloseButton, or classNames={{ closeButton: STATIC_CLOSE_BUTTON_CLASS }} from '@/lib/heroStatic' (no press animation on the X).",
        },
      ],
    },
  },
];

export default eslintConfig;
