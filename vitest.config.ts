import { defineConfig } from "vitest/config";

/**
 * Only the rules tests use this. They talk to the Firestore emulator
 * over the network, so they are slower than a unit test and they must
 * not run in parallel against one shared emulator — two files clearing
 * the database from under each other is not a failure worth debugging.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
});
