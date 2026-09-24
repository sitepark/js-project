import { describe, expect, it, vi } from "vitest";
import { Git } from "../src/Git.js";
import { recordExecSync } from "./support/fixtureHarness.js";

vi.mock("node:child_process");

describe("Git commit()", () => {
  it("should stage a single path", () => {
    const exec = recordExecSync();

    new Git().commit("package.json", "ci(release)", "Release 1.0.0", false);

    expect(exec.commands).toEqual([
      'git add package.json && git commit -m "ci(release): Release 1.0.0"',
    ]);
  });

  it("should stage multiple paths and quote those that need it", () => {
    const exec = recordExecSync();

    new Git().commit(
      [
        "package.json",
        "packages/@scope/a/package.json",
        "apps/my app/package.json",
      ],
      "ci(release)",
      "Release 1.0.0",
    );

    expect(exec.commands).toEqual([
      "git add package.json packages/@scope/a/package.json 'apps/my app/package.json'" +
        ' && git commit -m "ci(release): Release 1.0.0 [skip ci]"',
    ]);
  });
});
