import { defineConfig } from "vitest/config";
import { resolve } from "path";
import { readFileSync } from "fs";
import dts from "vite-plugin-dts";

const pkg = JSON.parse(readFileSync("./package.json", "utf8"));

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    dts({
      outDir: "dist/types",
      include: ["src/**/*"],
    }),
  ],
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
    reporters: ["junit", "default"],
    outputFile: "./build/junit-report.xml",
    include: ["test/**/*.test.ts"],
    coverage: {
      reportsDirectory: "./build/coverage",
      reporter: [["cobertura", { file: "cobertura-coverage.xml" }], "text"],
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
