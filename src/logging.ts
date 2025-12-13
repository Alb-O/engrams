import { createConsola } from "consola/basic";
import pkg from "../package.json";

export const logger = createConsola().withTag(pkg.name);

export function logWarning(message: string, ...args: unknown[]) {
  logger.warn(message, ...args);
}

export function logError(message: string, ...args: unknown[]) {
  logger.error(message, ...args);
}

// Re-export logger methods for CLI usage
export const { info, success, warn, error, debug, log, box, start, ready, fail } = logger;
