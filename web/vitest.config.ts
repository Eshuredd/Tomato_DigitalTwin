import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      exclude: [
        ".next/**",
        "node_modules/**",
        "coverage/**",
        "*.config.*",
        "next-env.d.ts",
        "src/test/**",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/lib/types/**",
      ],
    },
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
