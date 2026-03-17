#!/usr/bin/env node

import yargs, { type ArgumentsCamelCase } from "yargs";
import { hideBin } from "yargs/helpers";
import { publishCommand } from "./commands/publish.js";
import { releaseCommand } from "./commands/release.js";
import { releaseVersionCommand } from "./commands/releaseVersion.js";
import { startHotfixCommand } from "./commands/startHotfix.js";
import { verifyReleaseCommand } from "./commands/verifyRelease.js";
import { versionCommand } from "./commands/version.js";
import { defaultPackageManager } from "./Project.js";
import { cleanCommand } from "./commands/clean.js";
import type { PackageManagerIdentifier } from "./PackageManager.js";
import { publishMavenCommand } from "./commands/publishMaven.js";

declare const __VERSION__: string;

function handleError(error: unknown, verbose: boolean): void {
  if (error instanceof Error) {
    console.error(error.message);
    if (verbose && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
  } else {
    console.error("An unknown error occurred");
  }
  process.exit(1);
}

function getPackageManager(argv: ArgumentsCamelCase): PackageManagerIdentifier {
  const packageManager =
    `${argv.packageManager ?? defaultPackageManager()}`.toLowerCase();
  if (["pnpm", "yarn", "npm"].includes(packageManager)) {
    return packageManager as PackageManagerIdentifier;
  }
  throw new Error(`unknown package manager ${packageManager}`);
}

yargs(hideBin(process.argv))
  .scriptName("js-project")
  .version(__VERSION__)
  .option("verbose", {
    alias: "v",
    type: "boolean",
    description: "Show detailed error messages with stack traces",
    default: false,
    global: true,
  })
  .command(
    "version",
    "Display version information",
    () => {},
    (argv) => {
      try {
        versionCommand();
      } catch (error) {
        handleError(error, argv.verbose);
      }
    },
  )
  .command(
    "releaseVersion",
    "Release a new version",
    () => {},
    (argv) => {
      try {
        releaseVersionCommand();
      } catch (error) {
        handleError(error, argv.verbose);
      }
    },
  )
  .command(
    "verifyRelease",
    "Verify the release",
    (yargs) => {
      return yargs.option("package-manager", {
        describe: "Package manager to use",
        type: "string",
        choices: ["yarn", "npm", "pnpm"],
        demandOption: false,
      });
    },
    (argv) => {
      try {
        verifyReleaseCommand(getPackageManager(argv));
      } catch (error) {
        handleError(error, argv.verbose);
      }
    },
  )
  .command(
    "startHotfix <tag>",
    "Start a hotfix with the specified tag",
    (yargs) => {
      return yargs
        .positional("tag", {
          describe: "Tag for the hotfix",
          type: "string",
          demandOption: true,
        })
        .option("package-manager", {
          describe: "Package manager to use",
          type: "string",
          choices: ["yarn", "npm", "pnpm"],
          demandOption: false,
        });
    },
    (argv) => {
      try {
        startHotfixCommand(getPackageManager(argv), argv.tag);
      } catch (error) {
        handleError(error, argv.verbose);
      }
    },
  )
  .command(
    "release",
    "Execute release",
    (yargs) => {
      return yargs.option("package-manager", {
        describe: "Package manager to use",
        type: "string",
        choices: ["yarn", "npm", "pnpm"],
        demandOption: false,
      });
    },
    (argv) => {
      try {
        releaseCommand(getPackageManager(argv));
      } catch (error) {
        handleError(error, argv.verbose);
      }
    },
  )
  .command(
    "publish",
    "Execute publish",
    (yargs) => {
      return yargs.option("package-manager", {
        describe: "Package manager to use",
        type: "string",
        choices: ["yarn", "npm", "pnpm"],
        demandOption: false,
      });
    },
    async (argv) => {
      try {
        await publishCommand(getPackageManager(argv));
      } catch (error) {
        handleError(error, argv.verbose);
      }
    },
  )
  .command(
    "publishMaven",
    "Publishes packed project to a maven repository",
    (yargs) => {
      return yargs
        .option("package-manager", {
          describe: "Package manager to use",
          type: "string",
          choices: ["yarn", "npm", "pnpm"],
          demandOption: false,
        })
        .option("repository-id", {
          describe:
            "Maven repository-id. See https://maven.apache.org/plugins/maven-deploy-plugin/deploy-file-mojo.html#repositoryId for Details",
          type: "string",
          demandOption: true,
        })
        .option("repository-url", {
          describe: "Url of the Maven repository to publish to",
          type: "string",
          demandOption: true,
        });
    },
    async (argv) => {
      try {
        await publishMavenCommand(
          {
            id: argv.repositoryId,
            url: argv.repositoryUrl,
          },
          getPackageManager(argv),
        );
      } catch (error) {
        handleError(error, argv.verbose);
      }
    },
  )
  .command(
    "clean",
    "Clean build directory",
    () => {},
    async (argv) => {
      try {
        await cleanCommand();
      } catch (error) {
        handleError(error, argv.verbose);
      }
    },
  )
  .demandCommand(1, "Please specify a command")
  .strict()
  .help()
  .parse();
