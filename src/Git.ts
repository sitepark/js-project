import { execSync } from "node:child_process";

export class Git {
  public isGitRepository(): boolean {
    try {
      execSync("git rev-parse --git-dir", {
        stdio: "inherit",
      });
      return true;
    } catch {
      return false;
    }
  }

  public getCurrentBranch(): string {
    const branch = execSync("git rev-parse --abbrev-ref HEAD")
      .toString()
      .trim();
    return branch;
  }

  public isDev(): boolean {
    const version = execSync("git tag -l --points-at HEAD").toString().trim();
    return version === "";
  }

  /**
   * @return string[]
   */
  public getVersions(): string[] {
    this.updateTags();
    const result = execSync(
      "git tag -l --sort=v:refname '[0-9]*.[0-9]*.[0-9]*'",
    )
      .toString()
      .trim();

    return this.toStringArray(result);
  }

  public getVersionsFromMajor(major: number): string[] {
    this.updateTags();
    const result = execSync(
      "git tag -l --sort=v:refname '" + major + ".[0-9]*.[0-9]*'",
    )
      .toString()
      .trim();

    return this.toStringArray(result);
  }

  public getVersionsFromMinor(major: number, minor: number): string[] {
    this.updateTags();
    const result = execSync(
      "git tag -l --sort=v:refname '" + major + "." + minor + ".[0-9]*'",
    )
      .toString()
      .trim();

    return this.toStringArray(result);
  }

  public updateTags() {
    execSync("git fetch --tags", {
      stdio: "inherit",
    });
  }

  public hasUncommittedChanges(): boolean {
    const result = execSync("git status --short --untracked-files=no")
      .toString()
      .trim();

    return result.length !== 0;
  }

  public createBranch(branchName: string, startPoint: string): void {
    execSync(`git checkout -B ${branchName} ${startPoint}`, {
      stdio: "inherit",
    });
  }

  public getChangedTrackedFiles(): string[] {
    const result = execSync("git status --porcelain --untracked-files=no")
      .toString()
      .trim();
    return this.toStringArray(result);
  }

  public createTag(tagName: string, message: string): void {
    execSync(`git tag -a ${tagName} -m "${message}"`, {
      stdio: "inherit",
    });
  }

  public commit(
    path: string,
    type: string,
    message: string,
    skipci: boolean = true,
  ): void {
    const messsage = skipci ? `${message} [skip ci]` : message;
    execSync(`git add ${path} && git commit -m "${type}: ${messsage}"`, {
      stdio: "inherit",
    });
  }

  public push(): void {
    execSync(`git push`, {
      stdio: "inherit",
    });
    execSync(`git push --tags`, {
      stdio: "inherit",
    });
  }

  public pushOrigin(branchName: string): void {
    execSync(`git push -u origin ${branchName}`, {
      stdio: "inherit",
    });
    execSync(`git push --tags`, {
      stdio: "inherit",
    });
  }

  private toStringArray(output: string): string[] {
    if (output.trim().length === 0) {
      return [];
    }
    return output
      .trim()
      .split(/(?:\n|\r\n?)/)
      .map((line) => line.trim());
  }
}
