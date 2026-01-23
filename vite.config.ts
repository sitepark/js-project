import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { readFileSync } from "fs";
import dts from "vite-plugin-dts";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [dts()],
  build: {
    ssr: true,
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        cli: resolve(__dirname, "src/cli.ts"),
      },
      name: "js-project",
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
