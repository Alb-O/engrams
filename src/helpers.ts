// Re-export all public APIs from focused source files
export type {
  Engram,
  ContextTriggerMatcher,
  FileTreeOptions,
  TriggerConfig,
  CompiledTriggerRegexes,
} from "./types";
export { logWarning, logError } from "./logging";
export {
  expandBraces,
  compileContextTrigger,
  buildContextTriggerMatchers,
} from "./triggers";
export { generateToolName, parseEngram } from "./manifest";
export {
  findEngramFiles,
  discoverEngrams,
  discoverEngramsWithLazy,
  getDefaultEngramPaths,
  readIndexRef,
  getEngramsFromIndex,
} from "./discovery";
export { generateFileTree } from "./file-tree";
