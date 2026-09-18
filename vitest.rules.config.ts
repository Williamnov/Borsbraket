import { defineConfig } from "vitest/config";

/**
 * The rules tests, which talk to the Firestore emulator over the network.
 *
 * Slower than a unit test, and they must not run in parallel against one
 * shared emulator — two files clearing the database from under each other
 * is not a failure worth debugging.
 *
 * `npm run test:rules` starts the emulator around the run. It needs a JRE:
 * the emulator is a Java program, and without one it does not fail, it
 * refuses to start.
 */
export default defineConfig({
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 20_000,
    fileParallelism: false,
  },
});
