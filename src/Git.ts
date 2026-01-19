import { execSync } from "node:child_process";

export class Git {
  public isGitRepository(): boolean {
    try {
      execSync("git rev-parse --git-dir");
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
    execSync("git fetch --tags");
  }

  public hasUncommittedChanges(): boolean {
    const result = execSync("git status --short --untracked-files=no")
      .toString()
      .trim();

    return result.length !== 0;
  }

  public createBranch(branchName: string, startPoint: string): void {
    execSync(`git checkout -B ${branchName} ${startPoint}`);
  }

  public pushOrigin(branchName: string): void {
    execSync(`git push origin ${branchName}`);
  }

  public getChangedTrackedFiles(): string[] {
    const result = execSync("git status --porcelain --untracked-files=no")
      .toString()
      .trim();
    return this.toStringArray(result);
  }

  public createTag(tagName: string, message: string): void {
    execSync(`git tag -a ${tagName} -m "${message}"`);
  }

  public commit(path: string, type: string, message: string): void {
    execSync(
      `git add ${path} && git commit -m "${type}: ${message} [skip ci]"`,
    );
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
