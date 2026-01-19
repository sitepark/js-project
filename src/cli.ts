#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { publishCommand } from "./commands/publish.js";
import { releaseCommand } from "./commands/release.js";
import { releaseVersionCommand } from "./commands/releaseVersion.js";
import { startHotfixCommand } from "./commands/startHotfix.js";
import { verifyReleaseCommand } from "./commands/verifyRelease.js";
import { versionCommand } from "./commands/version.js";

function defaultPackageManager(): string {
  if (process.env.JS_PROJECT_PACKAGE_MANAGER === undefined) {
    throw new Error(
      "JS_PROJECT_PACKAGE_MANAGER environment variable is not set"
    );
  }
  return process.env.JS_PROJECT_PACKAGE_MANAGER;
}

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

yargs(hideBin(process.argv))
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
    }
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
    }
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
        verifyReleaseCommand(argv.packageManager ?? defaultPackageManager());
      } catch (error) {
        handleError(error, argv.verbose);
      }
    }
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
        startHotfixCommand(
          argv.packageManager ?? defaultPackageManager(),
          argv.tag
        );
      } catch (error) {
        handleError(error, argv.verbose);
      }
    }
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
        releaseCommand(argv.packageManager ?? defaultPackageManager());
      } catch (error) {
        handleError(error, argv.verbose);
      }
    }
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
    (argv) => {
      try {
        publishCommand(argv.packageManager ?? defaultPackageManager());
      } catch (error) {
        handleError(error, argv.verbose);
      }
    }
  )
  .demandCommand(1, "Please specify a command")
  .strict()
  .help()
  .parse();
