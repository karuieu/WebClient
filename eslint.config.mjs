import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * Use FlatCompat until eslint-config-next publishes native flat config; invoke ESLint directly instead of
 * next lint.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const STORAGE_MESSAGE =
  "Browser storage may hold only settings, layout sizes, the account profile and already-encrypted data, " +
  "never conversation plaintext. If this file stores one of those, add it to browserStorageFiles in eslint.config.mjs.";

const ZERO_DELAY_TIMER =
  "CallExpression:matches([callee.name='setTimeout'], [callee.property.name='setTimeout'])" +
  ":matches([arguments.1.value=0], :not([arguments.1]))";
const ZERO_DELAY_MESSAGE =
  "A zero-delay timer hides an ordering fault: the reader of some state runs before its writer. " +
  "Fix the order, or let the reader subscribe to the change instead of waiting a tick.";

// The files that may use localStorage or sessionStorage, and what each one keeps.
const browserStorageFiles = [
  // Per-account settings: mode switches and choices, no content.
  "lib/artifacts/artifacts.ts",
  "lib/chat/chatTitle.ts",
  "lib/connectors/toolApproval.ts",
  "lib/models/providers.ts",
  "lib/models/reasoning.ts",
  "lib/ui/tabTitle.ts",
  // The memory switches (auto, live writes); the memory text itself is stored encrypted on the server.
  "lib/chat/memory.ts",
  // Display preferences: theme, dismissed announcement, panel visibility and widths, sidebar mode.
  "lib/ui/theme.ts",
  "lib/ui/announcement.ts",
  "components/app/AppShell.tsx",
  "components/app/sidebarHistory.ts",
  "components/app/project/ProjectWorkspace.tsx",
  "components/app/chat/ArtifactPanel.tsx",
  // A one-time flag that makes the chat list reload.
  "components/wired/useLibrary.tsx",
  // The signed-in profile (id, e-mail, names, plan): account data, not conversations.
  "lib/account/session.ts",
  // The connector list, encrypted with the account key before it is written.
  "lib/connectors/userConnectors.ts",
];

// Layers: lib holds logic and must not know the screens; the kit is a copy of design-kit's pure look and may
// reach only the few helpers design-kit has an equivalent of (cx, theme, the site URL) and the motion presets.
const LAYER_MESSAGE =
  "Breaks the layer boundary. lib/ must not import from components/ or app/ (move the shared type or function " +
  "into lib/); components/kit/ may import only kit files, components/motion, lib/ui/cx, lib/ui/theme and app/siteUrl.";

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

      // A comment that excuses a shortcut gets copied along with the shortcut. Fix the cause instead.
      "no-warning-comments": [
        "error",
        { terms: ["todo", "fixme", "hack", "xxx", "workaround", "for now", "temporary", "quick fix"], location: "anywhere" },
      ],

      // A zero-delay timer moves code behind whatever it was racing, so the race stays and nobody sees it.
      "no-restricted-syntax": ["error", { selector: ZERO_DELAY_TIMER, message: ZERO_DELAY_MESSAGE }],

      "no-restricted-globals": [
        "error",
        { name: "localStorage", message: STORAGE_MESSAGE },
        { name: "sessionStorage", message: STORAGE_MESSAGE },
      ],
      "no-restricted-properties": [
        "error",
        ...["window", "globalThis", "self"].flatMap((object) =>
          ["localStorage", "sessionStorage"].map((property) => ({ object, property, message: STORAGE_MESSAGE }))
        ),
      ],
    },
  },
  {
    files: browserStorageFiles,
    rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
  },
  {
    files: ["lib/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@/components/**", "@/app/**"], message: LAYER_MESSAGE }] }],
    },
  },
  {
    files: ["components/kit/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            // Regexes, because a gitignore pattern cannot re-include a file under an excluded folder.
            { regex: "^@/lib/(?!ui/(cx|theme)$)", message: LAYER_MESSAGE },
            { regex: "^@/app/(?!siteUrl$)", message: LAYER_MESSAGE },
            { regex: "^@/components/(?!kit/|motion(/|$))", message: LAYER_MESSAGE },
            { regex: "^\\.\\./", message: LAYER_MESSAGE },
          ],
        },
      ],
    },
  },
]

export default config;
