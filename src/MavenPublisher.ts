import { existsSync } from "node:fs";
import type { BuildProvider } from "./BuildProvider.js";
import type { Project } from "./Project.js";
import maven from "maven";

export interface ExtraFile {
  classifier: string;
  type: string;
  file: string;
}

export interface InstallConfig {
  groupId: string;
  artifactId: string;
  version: string;
  file: string;
  classifier?: string;
  packaging: string;
  generatePom: boolean;
}

export interface DeployConfig extends InstallConfig {
  extraFiles?: ExtraFile[];
}

export interface MavenRepository {
  id: string;
  url: string;
}

const mavenInstallPlugin = "org.apache.maven.plugins:maven-install-plugin";
const mavenDeployPlugin = "org.apache.maven.plugins:maven-deploy-plugin";

export class MavenPublisher {
  constructor(
    private readonly project: Project,
    private readonly buildProvider: BuildProvider,
  ) {}

  private async mavenInstall(config: InstallConfig) {
    const mvn = maven.create();

    const params: Record<string, string> = {
      repositoryId: "nexus",
      groupId: config.groupId,
      artifactId: config.artifactId,
      packaging: config.packaging,
      version: config.version,
      file: config.file,
      generatePom: `${config.generatePom}`,
    };
    if (config.classifier) {
      params.classifier = config.classifier;
    }

    return mvn
      .execute([`${mavenInstallPlugin}:install-file`], params)
      .catch(this.handleMavenError);
  }

  private async mavenDeploy(repository: MavenRepository, config: DeployConfig) {
    const mvn = maven.create();

    const params: Record<string, string> = {
      repositoryId: repository.id,
      url: repository.url,
      groupId: config.groupId,
      artifactId: config.artifactId,
      version: config.version,
      file: config.file,
      packaging: config.packaging,
      generatePom: `${config.generatePom}`,
    };
    if (config.classifier) {
      params.classifier = config.classifier;
    }

    if (config.extraFiles) {
      params["classifiers"] = config.extraFiles
        .map((file) => file.classifier)
        .join(",");
      params["types"] = config.extraFiles.map((file) => file.type).join(",");
      params["files"] = config.extraFiles.map((file) => file.file).join(",");
    }

    return mvn
      .execute([`${mavenDeployPlugin}:deploy-file`], params)
      .catch(this.handleMavenError);
  }

  private handleMavenError(e: any) {
    if (!(e instanceof Error)) {
      e = new Error(
        `child process exited with code ${e.code} and signal ${e.signal}`,
      );
    }
    throw e;
  }

  public async publish(repository: MavenRepository): Promise<void> {
    try {
      const file = this.buildProvider.getPackPath();
      this.buildProvider.pack();
      if (!existsSync(file)) {
        throw new Error(`${file} doesn't exist`);
      }
      await this.mavenInstall({
        groupId: "com.sitepark.frontend",
        artifactId: this.project.getNameWithoutScope(),
        version: this.project.getMavenVersion(),
        generatePom: true,
        packaging: "tar.gz",
        file: file,
      });
      await this.mavenDeploy(repository, {
        groupId: "com.sitepark.frontend",
        artifactId: this.project.getNameWithoutScope(),
        version: this.project.getMavenVersion(),
        generatePom: true,
        packaging: "tar.gz",
        file: file,
      });
    } finally {
      this.buildProvider.removePack();
    }
  }

  public async publishLocal(): Promise<void> {
    try {
      const file = this.buildProvider.getPackPath();
      this.buildProvider.pack();
      if (!existsSync(file)) {
        throw new Error(`${file} doesn't exist`);
      }
      await this.mavenInstall({
        groupId: "com.sitepark.frontend",
        artifactId: this.project.getNameWithoutScope(),
        version: this.project.getMavenVersion(),
        generatePom: true,
        packaging: "tar.gz",
        file: file,
      });
    } finally {
      this.buildProvider.removePack();
    }
  }
}
