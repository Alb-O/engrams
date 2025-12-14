import { command, flag } from "cmd-ts";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { info, success, fail } from "../../logging";
import { installPlugin, getBundledPluginPath } from "../cache";
import { findProjectRoot } from "../utils";
import { configureAutoFetch, fetchIndex, indexExists } from "../index-ref";
import { ENGRAMS_DIR } from "../../constants";

export const init = command({
  name: "init",
  description:
    "Install the engrams plugin to the current project or globally",
  args: {
    global: flag({
      long: "global",
      short: "g",
      description: "Install globally to ~/.config/opencode/plugin/",
    }),
    force: flag({
      long: "force",
      short: "f",
      description: "Force reinstall even if already installed",
    }),
  },
  handler: async ({ global: isGlobal, force }) => {
    if (!getBundledPluginPath()) {
      fail("Could not find bundled plugin\nThe CLI may not be properly installed");
      process.exit(1);
    }

    let targetDir: string;

    if (isGlobal) {
      const xdgConfigHome = process.env.XDG_CONFIG_HOME;
      targetDir = xdgConfigHome
        ? path.join(xdgConfigHome, "opencode")
        : path.join(os.homedir(), ".config", "opencode");
    } else {
      const projectRoot = findProjectRoot();
      if (!projectRoot) {
        fail("Not in a project directory\nUse --global to install globally, or run from a git repository");
        process.exit(1);
      }
      targetDir = projectRoot;
    }

    const result = installPlugin(targetDir, { force });

    if ("error" in result) {
      fail(result.error);
      process.exit(1);
    }

    if (result.installed) {
      success(`Plugin installed\n  ${result.path}`);
    } else {
      success(`Plugin already installed\nUse --force to reinstall\n  ${result.path}`);
    }

    const openmodulesDir = path.join(targetDir, ENGRAMS_DIR);
    if (!fs.existsSync(openmodulesDir)) {
      fs.mkdirSync(openmodulesDir, { recursive: true });
      info(`Created ${openmodulesDir}/`);
    }

    if (!isGlobal) {
      if (configureAutoFetch(targetDir)) {
        info("Configured auto-fetch for refs/engrams/*");

        if (!indexExists(targetDir) && fetchIndex(targetDir).success) {
          info("Fetched engram index from remote");
        }
      }
    }
  },
});
