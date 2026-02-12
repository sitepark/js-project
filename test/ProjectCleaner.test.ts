import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import type { Project } from "../src/Project.js";
import { ProjectCleaner } from "../src/ProjectCleaner.js";

vi.mock("node:fs/promises");

describe("ProjectCleaner", () => {
  let mockProject: Project;
  let projectCleaner: ProjectCleaner;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProject = {
      getBuildPath: vi.fn().mockReturnValue("/test/project/build"),
    } as unknown as Project;

    projectCleaner = new ProjectCleaner(mockProject);

    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("clean", () => {
    it("should successfully delete the build directory", async () => {
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await projectCleaner.clean();

      expect(mockProject.getBuildPath).toHaveBeenCalled();
      expect(fs.rm).toHaveBeenCalledWith("/test/project/build", {
        recursive: true,
        force: true,
      });
      expect(consoleSpy).toHaveBeenCalledWith("Deleted: /test/project/build");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should handle errors when deletion fails", async () => {
      const error = new Error("Permission denied");
      vi.mocked(fs.rm).mockRejectedValue(error);

      await projectCleaner.clean();

      expect(mockProject.getBuildPath).toHaveBeenCalled();
      expect(fs.rm).toHaveBeenCalledWith("/test/project/build", {
        recursive: true,
        force: true,
      });
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "Failed to delete /test/project/build:",
        error,
      );
    });

    it("should use the correct build path from project", async () => {
      const customBuildPath = "/custom/build/path";
      vi.mocked(mockProject.getBuildPath).mockReturnValue(customBuildPath);
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await projectCleaner.clean();

      expect(mockProject.getBuildPath).toHaveBeenCalled();
      expect(fs.rm).toHaveBeenCalledWith(customBuildPath, {
        recursive: true,
        force: true,
      });
      expect(consoleSpy).toHaveBeenCalledWith(`Deleted: ${customBuildPath}`);
    });
  });
});
