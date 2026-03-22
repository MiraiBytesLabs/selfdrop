import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],

    // Each test file runs in its own worker with a fresh module registry.
    // This is critical because config.js reads env vars at import time —
    // without isolation, a cached config from one test file bleeds into another.
    pool: "forks",
    poolOptions: {
      forks: {
        isolate: true, // fresh module registry per file
        singleFork: false, // each file gets its own fork
      },
    },

    // Run serially — DB files and env vars are per-file but
    // we don't want concurrent forks racing on the filesystem.
    sequence: { concurrent: false },

    testTimeout: 30000,

    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      exclude: ["src/app.js"],
      reporter: ["text", "lcov"],
    },
  },
});
