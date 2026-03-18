import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules", ".next", "dist"],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
);
