import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { generateFileTree } from "./file-tree";

describe("generateFileTree", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "engrams-plugin-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("generates flat list of absolute paths", async () => {
    const engramDir = path.join(tempDir, "tree-test");
    await fs.mkdir(path.join(engramDir, "src"), { recursive: true });
    await fs.writeFile(path.join(engramDir, "README.md"), "# Readme");
    await fs.writeFile(path.join(engramDir, "src", "main.ts"), "export {}");
    await fs.writeFile(path.join(engramDir, "src", "utils.ts"), "export {}");

    const tree = await generateFileTree(engramDir);

    expect(tree).toContain(path.join(engramDir, "README.md"));
    expect(tree).toContain(path.join(engramDir, "src", "main.ts"));
    expect(tree).toContain(path.join(engramDir, "src", "utils.ts"));
    // Should NOT have tree characters - it's a flat list now
    expect(tree).not.toMatch(/[├└│]/);
  });

  it("excludes node_modules by default", async () => {
    const engramDir = path.join(tempDir, "exclude-test");
    await fs.mkdir(path.join(engramDir, "node_modules", "some-pkg"), {
      recursive: true,
    });
    await fs.mkdir(path.join(engramDir, "src"), { recursive: true });
    await fs.writeFile(path.join(engramDir, "src", "index.ts"), "export {}");

    const tree = await generateFileTree(engramDir);

    expect(tree).not.toContain("node_modules");
    expect(tree).toContain(path.join(engramDir, "src", "index.ts"));
  });

  it("respects maxDepth option", async () => {
    const engramDir = path.join(tempDir, "depth-test");
    await fs.mkdir(path.join(engramDir, "a", "b", "c", "d"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(engramDir, "a", "b", "c", "d", "deep.ts"),
      "export {}",
    );

    const tree = await generateFileTree(engramDir, { maxDepth: 2 });

    expect(tree).not.toContain("deep.ts");
  });

  it("returns empty string for non-existent directory", async () => {
    const tree = await generateFileTree(path.join(tempDir, "does-not-exist"));
    expect(tree).toBe("");
  });

  it("respects .ignore file with gitignore syntax", async () => {
    const engramDir = path.join(tempDir, "ignore-test");
    await fs.mkdir(path.join(engramDir, "src"), { recursive: true });
    await fs.mkdir(path.join(engramDir, "secrets"), { recursive: true });
    await fs.writeFile(path.join(engramDir, "README.md"), "# Readme");
    await fs.writeFile(path.join(engramDir, "src", "index.ts"), "export {}");
    await fs.writeFile(
      path.join(engramDir, "secrets", "api-key.txt"),
      "secret",
    );
    await fs.writeFile(path.join(engramDir, "debug.log"), "logs");
    // Create .ignore file
    await fs.writeFile(path.join(engramDir, ".ignore"), "secrets/\n*.log\n");

    const tree = await generateFileTree(engramDir);

    expect(tree).toContain(path.join(engramDir, "src", "index.ts"));
    expect(tree).toContain(path.join(engramDir, "README.md"));
    expect(tree).not.toContain("secrets");
    expect(tree).not.toContain("api-key.txt");
    expect(tree).not.toContain("debug.log");
  });

  it("supports negation patterns in .ignore file", async () => {
    const engramDir = path.join(tempDir, "ignore-negation-test");
    await fs.mkdir(path.join(engramDir, "logs"), { recursive: true });
    await fs.writeFile(path.join(engramDir, "logs", "debug.log"), "debug");
    await fs.writeFile(
      path.join(engramDir, "logs", "important.log"),
      "important",
    );
    // Ignore all logs except important.log
    await fs.writeFile(
      path.join(engramDir, ".ignore"),
      "logs/*.log\n!logs/important.log\n",
    );

    const tree = await generateFileTree(engramDir);

    expect(tree).toContain("important.log");
    expect(tree).not.toContain("debug.log");
  });

  it("works without .ignore file", async () => {
    const engramDir = path.join(tempDir, "no-ignore-test");
    await fs.mkdir(path.join(engramDir, "src"), { recursive: true });
    await fs.writeFile(path.join(engramDir, "src", "index.ts"), "export {}");

    const tree = await generateFileTree(engramDir);

    expect(tree).toContain(path.join(engramDir, "src", "index.ts"));
  });

  describe("metadata", () => {
    it("includes inline metadata comments when includeMetadata is true", async () => {
      const engramDir = path.join(tempDir, "metadata-test");
      await fs.mkdir(engramDir, { recursive: true });
      await fs.writeFile(
        path.join(engramDir, "backup.sh"),
        `#!/bin/bash
# oneliner: Database backup utilities

echo "Backing up..."
`,
      );
      await fs.writeFile(
        path.join(engramDir, "process.py"),
        `#!/usr/bin/env python3
# oneliner: Data processing module

import sys
`,
      );

      const tree = await generateFileTree(engramDir, { includeMetadata: true });

      expect(tree).toContain(path.join(engramDir, "backup.sh"));
      expect(tree).toContain("# Database backup utilities");
      expect(tree).toContain(path.join(engramDir, "process.py"));
      expect(tree).toContain("# Data processing module");
    });

    it("does not include metadata when includeMetadata is false", async () => {
      const engramDir = path.join(tempDir, "no-metadata-test");
      await fs.mkdir(engramDir, { recursive: true });
      await fs.writeFile(
        path.join(engramDir, "script.sh"),
        `#!/bin/bash
# oneliner: My Script
echo "Hello"
`,
      );

      const tree = await generateFileTree(engramDir, {
        includeMetadata: false,
      });

      expect(tree).toContain(path.join(engramDir, "script.sh"));
      expect(tree).not.toContain("# My Script");
    });

    it("handles files without metadata gracefully", async () => {
      const engramDir = path.join(tempDir, "mixed-metadata-test");
      await fs.mkdir(engramDir, { recursive: true });
      await fs.writeFile(
        path.join(engramDir, "with-meta.sh"),
        `#!/bin/bash
# oneliner: Has Metadata
echo "hi"
`,
      );
      await fs.writeFile(path.join(engramDir, "no-meta.txt"), "Just text");

      const tree = await generateFileTree(engramDir, { includeMetadata: true });

      expect(tree).toContain(path.join(engramDir, "with-meta.sh"));
      expect(tree).toContain("# Has Metadata");
      expect(tree).toContain(path.join(engramDir, "no-meta.txt"));
    });

    it("includes directory description from .oneliner file", async () => {
      const engramDir = path.join(tempDir, "dir-oneliner-test");
      const subDir = path.join(engramDir, "utils");
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(
        path.join(subDir, ".oneliner"),
        "Utility functions for data processing",
      );
      await fs.writeFile(
        path.join(subDir, "helper.sh"),
        "#!/bin/bash\necho hi",
      );

      const tree = await generateFileTree(engramDir, { includeMetadata: true });

      expect(tree).toContain("utils/");
      expect(tree).toContain("# Utility functions for data processing");
    });

    it("includes directory description from .oneliner.txt file", async () => {
      const engramDir = path.join(tempDir, "dir-oneliner-txt-test");
      const subDir = path.join(engramDir, "scripts");
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(
        path.join(subDir, ".oneliner.txt"),
        "Shell scripts for automation",
      );
      await fs.writeFile(path.join(subDir, "run.sh"), "#!/bin/bash\necho run");

      const tree = await generateFileTree(engramDir, { includeMetadata: true });

      expect(tree).toContain("scripts/");
      expect(tree).toContain("# Shell scripts for automation");
    });

    it("prefers .oneliner over .oneliner.txt", async () => {
      const engramDir = path.join(tempDir, "dir-oneliner-priority-test");
      const subDir = path.join(engramDir, "lib");
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(path.join(subDir, ".oneliner"), "From .oneliner");
      await fs.writeFile(
        path.join(subDir, ".oneliner.txt"),
        "From .oneliner.txt",
      );

      const tree = await generateFileTree(engramDir, { includeMetadata: true });

      expect(tree).toContain("# From .oneliner");
      expect(tree).not.toContain("# From .oneliner.txt");
    });

    it("hides .oneliner files from output", async () => {
      const engramDir = path.join(tempDir, "hide-oneliner-test");
      await fs.mkdir(engramDir, { recursive: true });
      await fs.writeFile(path.join(engramDir, ".oneliner"), "Description");
      await fs.writeFile(
        path.join(engramDir, ".oneliner.txt"),
        "Description txt",
      );
      await fs.writeFile(path.join(engramDir, "script.sh"), "#!/bin/bash");

      const tree = await generateFileTree(engramDir, { includeMetadata: true });

      expect(tree).toContain("script.sh");
      expect(tree).not.toMatch(/\.oneliner/);
    });
  });
});
