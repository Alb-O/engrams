import { command, positional, flag, option, string, optional } from "cmd-ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { info, success, warn, fail } from "../../logging";
import {
  getModulePaths,
  findProjectRoot,
  parseRepoUrl,
  getEngramName,
  getSupportedDomains,
} from "../utils";
import { submoduleAddFromCache, cloneFromCache, isCached } from "../cache";
import {
  readIndex,
  writeIndex,
  parseEngramToml,
} from "../index-ref";
import { ENGRAMS_DIR, MANIFEST_FILENAME } from "../../constants";

export const add = command({
  name: "add",
  description: "Add an engram from a git repository",
  args: {
    repo: positional({
      type: string,
      displayName: "repo",
      description: "Repository (owner/repo, domain:owner/repo, or full URL)",
    }),
    name: option({
      type: optional(string),
      long: "name",
      short: "n",
      description: "Custom name for the engram (defaults to repo name)",
    }),
    global: flag({
      long: "global",
      short: "g",
      description: "Install globally instead of in project",
    }),
    clone: flag({
      long: "clone",
      short: "c",
      description:
        "Clone instead of adding as submodule (default in git repos is submodule)",
    }),
    force: flag({
      long: "force",
      short: "f",
      description: "Force add, removing existing engram if present",
    }),
    noCache: flag({
      long: "no-cache",
      description: "Skip the bare repo cache, clone directly from remote",
    }),
  },
  handler: async ({ repo, name, global: isGlobal, clone, force, noCache }) => {
    const parsed = parseRepoUrl(repo);
    if (!parsed) {
      fail(`Invalid repository format: ${repo}\nFormats: owner/repo, domain:owner/repo, or full URL\nSupported domains: ${getSupportedDomains().join(", ")}`);
      process.exit(1);
    }

    const engramName = name || getEngramName(parsed.repo);
    const projectRoot = findProjectRoot();
    const paths = getModulePaths(projectRoot || undefined);

    if (isGlobal) {
      const targetDir = path.join(paths.global, engramName);
      return handleAdd({ parsed, engramName, projectRoot, targetDir, isGlobal, clone, force, noCache });
    }

    if (!projectRoot) {
      fail("Not in a project directory\nUse --global to install globally, or run from a git repository");
      process.exit(1);
    }

    const targetDir = path.join(paths.local!, engramName);
    return handleAdd({ parsed, engramName, projectRoot, targetDir, isGlobal, clone, force, noCache });
  },
});

interface AddParams {
  parsed: ReturnType<typeof parseRepoUrl> & {};
  engramName: string;
  projectRoot: string | null;
  targetDir: string;
  isGlobal: boolean;
  clone: boolean;
  force: boolean;
  noCache: boolean;
}

async function handleAdd({ parsed, engramName, projectRoot, targetDir, isGlobal, clone, force, noCache }: AddParams) {
  if (force && !isGlobal && projectRoot) {
    const relativePath = path.relative(projectRoot, targetDir);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      fail(`Force cleanup refused: target path escapes project root\n  Project root: ${projectRoot}\n  Target: ${targetDir}`);
      process.exit(1);
    }

    info(`Force removing existing engram: ${relativePath}`);

    const deinitResult = Bun.spawnSync(["git", "submodule", "deinit", "-f", relativePath], {
      cwd: projectRoot,
      stderr: "pipe",
    });
    if (!deinitResult.success) {
      const stderr = deinitResult.stderr?.toString().trim();
      if (stderr && !stderr.includes("did not match any file")) {
        warn(`git submodule deinit: ${stderr}`);
      }
    }

    const rmResult = Bun.spawnSync(["git", "rm", "-f", relativePath], {
      cwd: projectRoot,
      stderr: "pipe",
    });
    if (!rmResult.success) {
      const stderr = rmResult.stderr?.toString().trim();
      if (stderr && !stderr.includes("did not match any file")) {
        warn(`git rm: ${stderr}`);
      }
    }

    const dotGitPath = path.join(projectRoot, ".git");
    const gitDir = resolveGitDir(projectRoot, dotGitPath);
    const gitModulesPath = path.join(gitDir, "modules", relativePath);

    const realGitModulesPath = fs.existsSync(gitModulesPath) ? fs.realpathSync(gitModulesPath) : gitModulesPath;
    if (!realGitModulesPath.startsWith(fs.realpathSync(gitDir))) {
      fail(`Force cleanup refused: git modules path escapes .git directory\n  Git dir: ${gitDir}\n  Modules path: ${gitModulesPath}`);
      process.exit(1);
    }

    if (fs.existsSync(gitModulesPath)) {
      fs.rmSync(gitModulesPath, { recursive: true, force: true });
    }
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    warn(`Cleaned up existing engram state for ${engramName}`);
  }

  if (fs.existsSync(targetDir)) {
    fail(`Engram already exists at ${targetDir}\nUse --force to overwrite`);
    process.exit(1);
  }

  const parentDir = path.dirname(targetDir);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const cached = isCached(parsed.url);
  const addMsg = cached
    ? `Adding ${parsed.owner}/${parsed.repo} as ${engramName}... (using cache)`
    : `Adding ${parsed.owner}/${parsed.repo} as ${engramName}...`;
  info(addMsg);

  try {
    if (!clone && !isGlobal) {
      await addAsSubmodule(parsed, projectRoot!, targetDir, force, noCache, engramName);
    } else {
      await cloneDirect(parsed.url, targetDir, noCache);
    }
  } catch (error) {
    const err = error as Error;
    const hints = [
      `  ${err.message}`,
      "",
      "Troubleshooting:",
      "  - Check if the repository URL is correct and accessible",
      "  - Verify you have network connectivity and auth for the remote",
      "  - Try --no-cache if cache may be corrupted",
    ];
    if (!isGlobal) {
      hints.push("  - Use --clone to clone directly instead of as a submodule");
    }
    hints.push("  - Use --force to overwrite an existing engram");
    fail(`Failed to add engram '${engramName}'\n${hints.join("\n")}`);
    process.exit(1);
  }
}

function resolveGitDir(projectRoot: string, dotGitPath: string): string {
  if (!fs.existsSync(dotGitPath) || !fs.statSync(dotGitPath).isFile()) {
    return dotGitPath;
  }
  const gitFileContent = fs.readFileSync(dotGitPath, "utf-8").trim();
  const match = gitFileContent.match(/^gitdir:\s*(.+)$/);
  if (match) {
    return path.resolve(projectRoot, match[1]);
  }
  return dotGitPath;
}

async function addAsSubmodule(
  parsed: NonNullable<ReturnType<typeof parseRepoUrl>>,
  projectRoot: string,
  targetDir: string,
  force: boolean,
  noCache: boolean,
  engramName: string,
) {
  const relativePath = path.relative(projectRoot, targetDir);
  if (noCache) {
    const args = ["git", "submodule", "add"];
    if (force) args.push("--force");
    args.push(parsed.url, relativePath);
    const result = Bun.spawnSync(args, { cwd: projectRoot, stdout: "inherit", stderr: "pipe" });
    if (!result.success) {
      const stderr = result.stderr?.toString().trim();
      throw new Error(
        `git submodule add failed for ${parsed.url}${stderr ? `:\n  ${stderr}` : ""}`,
      );
    }
  } else {
    await submoduleAddFromCache(parsed.url, relativePath, projectRoot, { force });
  }
  success(`Added as submodule: ${targetDir}`);
  updateIndexAfterAdd(projectRoot, engramName, parsed.url);
}

async function cloneDirect(url: string, targetDir: string, noCache: boolean) {
  if (noCache) {
    const result = Bun.spawnSync(["git", "clone", url, targetDir], { stdout: "inherit", stderr: "pipe" });
    if (!result.success) {
      const stderr = result.stderr?.toString().trim();
      throw new Error(`git clone failed for ${url}${stderr ? `:\n  ${stderr}` : ""}`);
    }
  } else {
    await cloneFromCache(url, targetDir);
  }
  success(`Cloned to: ${targetDir}`);
}

/**
 * Update the engram index after adding a new engram
 */
function updateIndexAfterAdd(
  projectRoot: string,
  engramName: string,
  url: string,
): void {
  const tomlPath = path.join(projectRoot, ENGRAMS_DIR, engramName, MANIFEST_FILENAME);

  if (!fs.existsSync(tomlPath)) {
    info(`No ${MANIFEST_FILENAME} found, skipping index update`);
    return;
  }

  const entry = parseEngramToml(tomlPath);
  if (!entry) {
    info(`Could not parse ${MANIFEST_FILENAME}, skipping index update`);
    return;
  }

  entry.url = url;

  const index = readIndex(projectRoot) || {};
  index[engramName] = entry;

  writeIndex(projectRoot, index);
  info("Updated refs/engrams/index");
}
