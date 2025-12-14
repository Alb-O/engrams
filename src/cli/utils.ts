import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { ENGRAMS_DIR } from "../constants";

export interface ModulePaths {
  global: string;
  local: string | null;
}

export function getModulePaths(projectRoot?: string): ModulePaths {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  const globalPath = xdgConfigHome
    ? path.join(xdgConfigHome, "engrams")
    : path.join(os.homedir(), ".config", "engrams");

  return {
    global: globalPath,
    local: projectRoot ? path.join(projectRoot, ENGRAMS_DIR) : null,
  };
}

export function findProjectRoot(): string | null {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const gitDir = path.join(dir, ".git");
    const openmodulesDir = path.join(dir, ENGRAMS_DIR);
    if (existsSync(gitDir) || existsSync(openmodulesDir)) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

// Domain aliases for shorthand syntax (like nix flakes)
const DOMAIN_ALIASES: Record<string, string> = {
  github: "github.com",
  gh: "github.com",
  gitlab: "gitlab.com",
  gl: "gitlab.com",
  codeberg: "codeberg.org",
  cb: "codeberg.org",
  sourcehut: "git.sr.ht",
  srht: "git.sr.ht",
};

const MAX_INPUT_LENGTH = 2048;
const VALID_NAME_PATTERN = /^[\w][\w.-]*$/;

function validateOwnerRepo(owner: string, repo: string): boolean {
  if (!owner || !repo) return false;
  if (owner.length > 100 || repo.length > 100) return false;
  if (!VALID_NAME_PATTERN.test(owner) || !VALID_NAME_PATTERN.test(repo)) return false;
  if (owner.startsWith(".") || owner.startsWith("-")) return false;
  if (repo.startsWith(".") || repo.startsWith("-")) return false;
  return true;
}

export function parseRepoUrl(
  input: string,
): { owner: string; repo: string; url: string } | null {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_INPUT_LENGTH) return null;

  // Handle full URLs (https or git@)
  const urlMatch = trimmed.match(
    /(?:https?:\/\/|git@)([^/:]+)[/:]([^/]+)\/([^/.\s]+)/,
  );
  if (urlMatch) {
    const domain = urlMatch[1];
    const owner = urlMatch[2];
    const repo = urlMatch[3].replace(/\.git$/, "");
    if (!validateOwnerRepo(owner, repo)) return null;
    return {
      owner,
      repo,
      url: `https://${domain}/${owner}/${repo}.git`,
    };
  }

  // Handle domain-prefixed shorthand: domain:owner/repo
  const domainMatch = trimmed.match(/^([a-z]+):([^/]+)\/([^/]+)$/);
  if (domainMatch) {
    const alias = domainMatch[1];
    const owner = domainMatch[2];
    const repo = domainMatch[3];
    const domain = DOMAIN_ALIASES[alias];
    if (!domain) {
      return null; // Unknown domain alias
    }
    if (!validateOwnerRepo(owner, repo)) return null;
    return {
      owner,
      repo,
      url: `https://${domain}/${owner}/${repo}.git`,
    };
  }

  // Handle simple shorthand: owner/repo (defaults to GitHub)
  const shortMatch = trimmed.match(/^([^/:]+)\/([^/:]+)$/);
  if (shortMatch) {
    const owner = shortMatch[1];
    const repo = shortMatch[2];
    if (!validateOwnerRepo(owner, repo)) return null;
    return {
      owner,
      repo,
      url: `https://github.com/${owner}/${repo}.git`,
    };
  }

  return null;
}

export function getSupportedDomains(): string[] {
  return Object.keys(DOMAIN_ALIASES);
}

export function getEngramName(repo: string): string {
  // Strip eg. prefix if present for cleaner engram names
  return repo.replace(/^eg\./, "");
}

/**
 * Shortens a path by replacing the home directory with ~
 */
export function shortenPath(filePath: string): string {
  const home = os.homedir();
  if (filePath.startsWith(home)) {
    return "~" + filePath.slice(home.length);
  }
  return filePath;
}
