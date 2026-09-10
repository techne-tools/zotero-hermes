// @ts-check Let TS check this config file

import zotero from "@zotero-plugin/eslint-config";

export default [
  ...zotero({
    overrides: [
      {
        files: ["**/*.ts"],
        rules: {
          // We disable this rule here because the template
          // contains some unused examples and variables
          "@typescript-eslint/no-unused-vars": "off",
        },
      },
      {
        // Test files legitimately group related suites in one file.
        files: ["test/**/*.ts"],
        rules: {
          "mocha/max-top-level-suites": "off",
        },
      },
    ],
  }),
  {
    // Vendored third-party PDF.js types — not our code, not linted.
    ignores: [".refs/**"],
  },
];
