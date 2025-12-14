import { command, positional, string, flag } from "cmd-ts";
import * as fs from "node:fs";
import * as path from "node:path";
import * as TOML from "@iarna/toml";
import { info, success, warn, fail, raw, colors } from "../../logging";
import { findProjectRoot, getModulePaths } from "../utils";
import {
  readIndex,
  fetchIndex,
  initSubmodule,
  isSubmoduleInitialized,
} from "../index-ref";
import { CONTENT_DIR, MANIFEST_FILENAME, ENGRAMS_DIR } from "../../constants";
import { cloneWithSparseCheckout } from "../cache";
import { ICON_READY, ICON_INACTIVE } from "../icons";

interface WrapConfig {
  remote: string;
  ref?: string;
  sparse?: string[];
}

interface EngramToml {
  name?: string;
  description?: string;
  wrap?: WrapConfig;
}

/**
 * Check if an engram directory has content (is initialized).
 * For wrapped engrams, checks if content/ directory exists.
 */
function isWrapInitialized(engramDir: string): boolean {
  if (!fs.existsSync(engramDir)) return false;
  
  const contentDir = path.join(engramDir, CONTENT_DIR);
  return fs.existsSync(contentDir);
}

/**
 * Read and parse engram.toml from a directory.
 */
function readEngramToml(engramDir: string): EngramToml | null {
  const tomlPath = path.join(engramDir, MANIFEST_FILENAME);
  if (!fs.existsSync(tomlPath)) return null;
  
  const content = fs.readFileSync(tomlPath, "utf-8");
  return TOML.parse(content) as EngramToml;
}

export const lazyInit = command({
  name: "lazy-init",
  description: "Initialize a lazy engram (wrapped or submodule) on-demand",
  args: {
    name: positional({
      type: string,
      displayName: "name",
      description: "Name of the engram to initialize",
    }),
    fetch: flag({
      long: "fetch",
      short: "f",
      description: "Fetch index from remote first (for submodules)",
    }),
    all: flag({
      long: "all",
      short: "a",
      description: "Initialize all uninitialized engrams",
    }),
  },
  handler: async ({ name, fetch: shouldFetch, all }) => {
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      fail("Not in a project directory");
      process.exit(1);
    }

    const paths = getModulePaths(projectRoot);
    const engramsDir = paths.local;
    if (!engramsDir) {
      fail("No .engrams directory found");
      process.exit(1);
    }

    const engramDir = path.join(engramsDir, name);
    const engramToml = readEngramToml(engramDir);

    if (engramToml?.wrap) {
      if (isWrapInitialized(engramDir)) {
        warn(`Engram '${name}' is already initialized`);
        process.exit(0);
      }

      info(`Initializing wrapped engram: ${name}...`);
      const wrap = engramToml.wrap;

      const index = readIndex(projectRoot);
      const indexEntry = index?.[name];
      const lockedRef = indexEntry?.wrap?.locked;

      const details: string[] = [];
      if (wrap.sparse && wrap.sparse.length > 0) {
        details.push(`Sparse patterns: ${wrap.sparse.join(", ")}`);
      }
      if (lockedRef) {
        details.push(`Locked: ${lockedRef.slice(0, 12)}`);
      } else if (wrap.ref) {
        details.push(`Ref: ${wrap.ref}`);
      }
      if (details.length > 0) {
        info(details.join("\n"));
      }

      const contentDir = path.join(engramDir, CONTENT_DIR);
      cloneWithSparseCheckout(wrap.remote, contentDir, {
        ref: lockedRef || wrap.ref,
        sparse: wrap.sparse,
      });

      const successMsg = engramToml.description
        ? `Initialized: ${engramToml.name}\n  ${engramToml.description}`
        : `Initialized: ${engramToml.name}`;
      success(successMsg);
      return;
    }

    if (shouldFetch) {
      info("Fetching index from remote...");
      const result = fetchIndex(projectRoot);
      if (!result.success) {
        warn(`Could not fetch index: ${result.error}`);
      }
    }

    const index = readIndex(projectRoot);
    if (!index) {
      if (fs.existsSync(engramDir)) {
        fail(`Engram '${name}' has no [wrap] config and no index entry\nAdd a [wrap] section to engram.toml or sync the index`);
      } else {
        fail(`Engram '${name}' not found`);
      }
      process.exit(1);
    }

    if (all) {
      const initialized: string[] = [];
      const failed: string[] = [];
      let skipped = 0;

      for (const engramName of Object.keys(index)) {
        const submodulePath = `${ENGRAMS_DIR}/${engramName}`;

        if (isSubmoduleInitialized(projectRoot, submodulePath)) {
          skipped++;
          continue;
        }

        if (initSubmodule(projectRoot, submodulePath)) {
          initialized.push(engramName);
        } else {
          failed.push(engramName);
        }
      }

      if (initialized.length > 0) {
        success(`Initialized ${initialized.length} engram(s):\n${initialized.map(n => `  ${n}`).join("\n")}`);
      }
      if (failed.length > 0) {
        fail(`Failed to initialize:\n${failed.map(n => `  ${n}`).join("\n")}`);
      }
      if (skipped > 0) {
        info(`${skipped} already initialized`);
      }
      return;
    }

    if (!index[name]) {
      const available = Object.keys(index).map(k => `  - ${k}`).join("\n");
      fail(`Engram '${name}' not found in index\nAvailable engrams:\n${available}`);
      process.exit(1);
    }

    const submodulePath = `${ENGRAMS_DIR}/${name}`;

    if (isSubmoduleInitialized(projectRoot, submodulePath)) {
      warn(`Engram '${name}' is already initialized`);
      process.exit(0);
    }

    info(`Initializing ${name}...`);

    if (initSubmodule(projectRoot, submodulePath)) {
      const entry = index[name];
      const successMsg = entry.description
        ? `Initialized: ${entry.name}\n  ${entry.description}`
        : `Initialized: ${entry.name}`;
      success(successMsg);
    } else {
      fail(`Failed to initialize ${name}`);
      process.exit(1);
    }
  },
});

export const showIndex = command({
  name: "show-index",
  description: "Show the engram index (metadata for lazy loading)",
  args: {
    fetch: flag({
      long: "fetch",
      short: "f",
      description: "Fetch index from remote first",
    }),
    json: flag({
      long: "json",
      description: "Output as JSON",
    }),
  },
  handler: async ({ fetch: shouldFetch, json }) => {
    const projectRoot = findProjectRoot();
    if (!projectRoot) {
      fail("Not in a project directory");
      process.exit(1);
    }

    if (shouldFetch) {
      info("Fetching index from remote...");
      const result = fetchIndex(projectRoot);
      if (!result.success) {
        warn(`Could not fetch index: ${result.error}`);
      }
    }

    const index = readIndex(projectRoot);
    if (!index) {
      fail("No engram index found\nRun 'engram sync' to create the index");
      process.exit(1);
    }

    if (json) {
      raw(JSON.stringify(index, null, 2));
      return;
    }

    raw(colors.bold("Engram Index") + colors.dim(" (refs/engrams/index)\n"));

    const outputLines: string[] = [];
    for (const [name, entry] of Object.entries(index)) {
      const submodulePath = `${ENGRAMS_DIR}/${name}`;
      const initialized = isSubmoduleInitialized(projectRoot, submodulePath);
      const status = initialized
        ? colors.green(ICON_READY)
        : colors.dim(ICON_INACTIVE);

      const lines: string[] = [];
      lines.push(`${status} ${colors.cyan(name)}: ${entry.name}`);
      
      if (entry.description) {
        lines.push(`    ${colors.dim(entry.description)}`);
      }

      if (entry["disclosure-triggers"]) {
        const triggers = entry["disclosure-triggers"];
        const parts: string[] = [];
        if (triggers["user-msg"]?.length) {
          parts.push(`user: ${triggers["user-msg"].join(", ")}`);
        }
        if (triggers["agent-msg"]?.length) {
          parts.push(`agent: ${triggers["agent-msg"].join(", ")}`);
        }
        if (triggers["any-msg"]?.length) {
          parts.push(`any: ${triggers["any-msg"].join(", ")}`);
        }
        if (parts.length) {
          lines.push(`    ${colors.dim("disclosure: " + parts.join(" | "))}`);
        }
      }

      if (entry["activation-triggers"]) {
        const triggers = entry["activation-triggers"];
        const parts: string[] = [];
        if (triggers["user-msg"]?.length) {
          parts.push(`user: ${triggers["user-msg"].join(", ")}`);
        }
        if (triggers["agent-msg"]?.length) {
          parts.push(`agent: ${triggers["agent-msg"].join(", ")}`);
        }
        if (triggers["any-msg"]?.length) {
          parts.push(`any: ${triggers["any-msg"].join(", ")}`);
        }
        if (parts.length) {
          lines.push(`    ${colors.dim("activation: " + parts.join(" | "))}`);
        }
      }
      
      outputLines.push(lines.join("\n"));
    }
    raw(outputLines.join("\n") + colors.dim(`\n\n${ICON_READY} initialized  ${ICON_INACTIVE} not initialized`));
  },
});
