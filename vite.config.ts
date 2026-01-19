import { defineConfig } from "vitest/config";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  plugins: [dts()],
  build: {
    ssr: true,
    lib: {
      entry: resolve(__dirname, "src/cli.ts"),
      name: "js-project",
      fileName: "cli",
      formats: ["es"],
    },
    rollupOptions: {
      external: ["fs", "path", "node:child_process", "child_process"],
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "node_modules/",
        "dist/",
        "test/",
        "**/*.test.ts",
        "**/*.spec.ts",
        "vite.config.ts",
        "src/cli.ts",
      ],
    },
  },
});
