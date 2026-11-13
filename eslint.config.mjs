import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import explicitExceptions from "eslint-plugin-explicit-exceptions";
import jsdoc from "eslint-plugin-jsdoc";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: { "simple-import-sort": simpleImportSort },
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      curly: ["error", "all"],
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            // Runtime: side effects, external modules, project modules (including src/*).
            ["^\\u0000", "^(?!src/)(?!.*\\u0000$)@?\\w", "^(?!.*\\u0000$)"],
            // Types: external modules, then project modules.
            ["^(?!src/)@?\\w.*\\u0000$", "\\u0000$"],
          ],
        },
      ],
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "*", next: "return" },
        {
          blankLine: "always",
          prev: "*",
          next: [
            "multiline-block-like",
            "multiline-expression",
            "multiline-const",
            "multiline-let",
            "multiline-var",
          ],
        },
        {
          blankLine: "always",
          prev: [
            "multiline-block-like",
            "multiline-expression",
            "multiline-const",
            "multiline-let",
            "multiline-var",
          ],
          next: "*",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "off",
    },
  },
  {
    files: ["**/*.spec.ts"],
    languageOptions: {
      globals: globals.vitest,
    },
  },
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: 'ImportSpecifier[importKind="type"]',
          message: "Use a separate import type declaration instead of an inline type specifier.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.ts"],
    ignores: ["**/*.spec.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { jsdoc, "explicit-exceptions": explicitExceptions },
    settings: {
      jsdoc: {
        mode: "typescript",
      },
    },
    rules: {
      ...explicitExceptions.configs.recommendedTypeChecked.rules,
      "jsdoc/require-throws-type": "error",
      "jsdoc/no-undefined-types": "error",
    },
  },
);
