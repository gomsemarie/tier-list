import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default tseslint.config([
  globalIgnores(["**/dist", "**/node_modules"]),

  // Client — React app
  {
    files: ["packages/client/src/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
  },
  {
    // shadcn/ui components co-locate variant helpers with the component.
    files: ["packages/client/src/components/ui/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },

  // Client tooling (vite.config.ts) — Node
  {
    files: ["packages/client/*.{ts,js}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // Shared library + Node server (isomorphic / Node)
  {
    files: ["packages/shared/**/*.ts", "packages/server/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
]);
