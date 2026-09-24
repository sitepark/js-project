import { beforeEach, describe, expect, it, vi } from "vitest";
import { releaseCommand } from "../../src/commands/release.js";
import { ReleaseManagementFactory } from "../../src/ReleaseManagementFactory.js";

vi.mock("../../src/Workspace.js", () => ({
  Workspace: { forCwd: vi.fn(() => ({ getRoot: () => ({}) })) },
}));
vi.mock("../../src/BuildProvider.js", () => ({
  BuildProvider: vi.fn(),
}));
vi.mock("../../src/NodePublisherProvider.js", () => ({
  NodePublisherProvider: vi.fn(),
}));
vi.mock("../../src/ReleaseManagementFactory.js", () => ({
  ReleaseManagementFactory: { forCwd: vi.fn() },
}));

describe("releaseCommand", () => {
  const release = vi.fn<() => Promise<string>>();

  beforeEach(() => {
    release.mockReset();
    vi.mocked(ReleaseManagementFactory.forCwd).mockReturnValue({
      release,
    } as unknown as ReturnType<typeof ReleaseManagementFactory.forCwd>);
  });

  it("should resolve when the release succeeds", async () => {
    release.mockResolvedValue("1.2.0");

    await expect(releaseCommand("pnpm")).resolves.toBeUndefined();
    expect(release).toHaveBeenCalledOnce();
  });

  it("should reject with the error of a failing release step", async () => {
    release.mockRejectedValue(new Error("publish failed"));

    await expect(releaseCommand("pnpm")).rejects.toThrow("publish failed");
  });
});
