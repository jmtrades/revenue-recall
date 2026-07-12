// ESLint 9 flat config — replaces .eslintrc.json (Next 16 removed `next lint`;
// the lint script now runs the ESLint CLI directly with Next's ruleset).
import coreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  ...coreWebVitals,
  {
    ignores: ["node_modules/**", ".next/**", "tests/stubs/**", "next-env.d.ts"],
  },
  {
    // React-Compiler-prep rules that eslint-config-next@16 turns on. They flag
    // long-standing, working patterns (mount-detection effects, session-storage
    // hydration reads) that predate the compiler. Off until we adopt the React
    // Compiler and refactor those patterns as one deliberate change — not as
    // lint-silencing churn inside a framework upgrade.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
];
