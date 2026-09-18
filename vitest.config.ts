import { defineConfig } from "vitest/config";

/**
 * The fast tests: pure functions, no emulator, no network.
 *
 * Deliberately a separate config from the rules tests. Those need the
 * Firestore emulator wrapped around them, and a single config covering
 * both means `npm test` fails for anyone without a JRE — which trains
 * people to ignore it.
 */
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
