import { command, flag } from "cmd-ts";
import * as fs from "fs";
import * as path from "path";
import pc from "picocolors";
import { getModulePaths, findProjectRoot } from "../utils";

interface ModuleInfo {
  name: string;
  path: string;
  scope: "global" | "local";
  hasToml: boolean;
}

function scanModules(dir: string, scope: "global" | "local"): ModuleInfo[] {
  const modules: ModuleInfo[] = [];
  
  if (!fs.existsSync(dir)) {
    return modules;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const modulePath = path.join(dir, entry.name);
      const tomlPath = path.join(modulePath, "openmodule.toml");
      modules.push({
        name: entry.name,
        path: modulePath,
        scope,
        hasToml: fs.existsSync(tomlPath),
      });
    }
  }

  return modules;
}

export const list = command({
  name: "list",
  description: "List installed openmodules",
  args: {
    global: flag({
      long: "global",
      short: "g",
      description: "Show only global modules",
    }),
    local: flag({
      long: "local",
      short: "l",
      description: "Show only local modules",
    }),
  },
  handler: async ({ global: globalOnly, local: localOnly }) => {
    const projectRoot = findProjectRoot();
    const paths = getModulePaths(projectRoot || undefined);

    const modules: ModuleInfo[] = [];

    if (!localOnly) {
      modules.push(...scanModules(paths.global, "global"));
    }

    if (!globalOnly && paths.local) {
      modules.push(...scanModules(paths.local, "local"));
    }

    if (modules.length === 0) {
      console.log(pc.dim("No modules installed"));
      if (!projectRoot && !globalOnly) {
        console.log(pc.dim("(Not in a project directory - showing global modules only)"));
      }
      return;
    }

    // Group by scope
    const globalModules = modules.filter((m) => m.scope === "global");
    const localModules = modules.filter((m) => m.scope === "local");

    if (globalModules.length > 0 && !localOnly) {
      console.log(pc.bold("\nGlobal modules") + pc.dim(` (${paths.global})`));
      for (const mod of globalModules) {
        const status = mod.hasToml ? pc.green("✓") : pc.yellow("?");
        console.log(`  ${status} ${mod.name}`);
      }
    }

    if (localModules.length > 0 && !globalOnly) {
      console.log(pc.bold("\nLocal modules") + pc.dim(` (${paths.local})`));
      for (const mod of localModules) {
        const status = mod.hasToml ? pc.green("✓") : pc.yellow("?");
        console.log(`  ${status} ${mod.name}`);
      }
    }

    console.log("");
    console.log(pc.dim(`${pc.green("✓")} = has openmodule.toml, ${pc.yellow("?")} = missing openmodule.toml`));
  },
});
