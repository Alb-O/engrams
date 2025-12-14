import { describe, it, expect } from "bun:test";
import { parseRepoUrl, getSupportedDomains, getEngramName, shortenPath } from "./utils";

describe("parseRepoUrl", () => {
  describe("simple shorthand (owner/repo)", () => {
    it("parses valid owner/repo format", () => {
      const result = parseRepoUrl("owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://github.com/owner/repo.git",
      });
    });

    it("handles repo names with dots", () => {
      const result = parseRepoUrl("owner/eg.my-engram");
      expect(result).toEqual({
        owner: "owner",
        repo: "eg.my-engram",
        url: "https://github.com/owner/eg.my-engram.git",
      });
    });

    it("handles repo names with hyphens", () => {
      const result = parseRepoUrl("my-org/my-repo");
      expect(result).toEqual({
        owner: "my-org",
        repo: "my-repo",
        url: "https://github.com/my-org/my-repo.git",
      });
    });

    it("handles underscores in names", () => {
      const result = parseRepoUrl("my_org/my_repo");
      expect(result).toEqual({
        owner: "my_org",
        repo: "my_repo",
        url: "https://github.com/my_org/my_repo.git",
      });
    });
  });

  describe("domain-prefixed shorthand (domain:owner/repo)", () => {
    it("parses github: prefix", () => {
      const result = parseRepoUrl("github:owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://github.com/owner/repo.git",
      });
    });

    it("parses gh: prefix", () => {
      const result = parseRepoUrl("gh:owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://github.com/owner/repo.git",
      });
    });

    it("parses gitlab: prefix", () => {
      const result = parseRepoUrl("gitlab:owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://gitlab.com/owner/repo.git",
      });
    });

    it("parses gl: prefix", () => {
      const result = parseRepoUrl("gl:owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://gitlab.com/owner/repo.git",
      });
    });

    it("parses codeberg: prefix", () => {
      const result = parseRepoUrl("codeberg:owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://codeberg.org/owner/repo.git",
      });
    });

    it("parses cb: prefix", () => {
      const result = parseRepoUrl("cb:owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://codeberg.org/owner/repo.git",
      });
    });

    it("parses sourcehut: prefix", () => {
      const result = parseRepoUrl("sourcehut:owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://git.sr.ht/owner/repo.git",
      });
    });

    it("parses srht: prefix", () => {
      const result = parseRepoUrl("srht:owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://git.sr.ht/owner/repo.git",
      });
    });

    it("rejects unknown domain prefix", () => {
      expect(parseRepoUrl("unknown:owner/repo")).toBeNull();
      expect(parseRepoUrl("bitbucket:owner/repo")).toBeNull();
    });
  });

  describe("full URLs", () => {
    it("parses https URL", () => {
      const result = parseRepoUrl("https://github.com/owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://github.com/owner/repo.git",
      });
    });

    it("parses https URL with .git suffix", () => {
      const result = parseRepoUrl("https://github.com/owner/repo.git");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://github.com/owner/repo.git",
      });
    });

    it("parses git@ SSH URL", () => {
      const result = parseRepoUrl("git@github.com:owner/repo.git");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://github.com/owner/repo.git",
      });
    });

    it("parses URLs from other domains", () => {
      const result = parseRepoUrl("https://gitlab.com/mygroup/myproject");
      expect(result).toEqual({
        owner: "mygroup",
        repo: "myproject",
        url: "https://gitlab.com/mygroup/myproject.git",
      });
    });

    it("parses http URLs (upgrades to https)", () => {
      const result = parseRepoUrl("http://github.com/owner/repo");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://github.com/owner/repo.git",
      });
    });
  });

  describe("input validation", () => {
    it("rejects null input", () => {
      expect(parseRepoUrl(null as unknown as string)).toBeNull();
    });

    it("rejects undefined input", () => {
      expect(parseRepoUrl(undefined as unknown as string)).toBeNull();
    });

    it("rejects empty string", () => {
      expect(parseRepoUrl("")).toBeNull();
    });

    it("rejects whitespace-only input", () => {
      expect(parseRepoUrl("   ")).toBeNull();
    });

    it("trims whitespace from input", () => {
      const result = parseRepoUrl("  owner/repo  ");
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        url: "https://github.com/owner/repo.git",
      });
    });

    it("rejects excessively long input", () => {
      const longInput = "a".repeat(3000) + "/repo";
      expect(parseRepoUrl(longInput)).toBeNull();
    });

    it("rejects owner starting with hyphen", () => {
      expect(parseRepoUrl("-owner/repo")).toBeNull();
    });

    it("rejects repo starting with hyphen", () => {
      expect(parseRepoUrl("owner/-repo")).toBeNull();
    });

    it("rejects owner starting with dot", () => {
      expect(parseRepoUrl(".owner/repo")).toBeNull();
    });

    it("rejects repo starting with dot", () => {
      expect(parseRepoUrl("owner/.repo")).toBeNull();
    });

    it("rejects names with special characters", () => {
      expect(parseRepoUrl("owner$/repo")).toBeNull();
      expect(parseRepoUrl("owner/repo@")).toBeNull();
      expect(parseRepoUrl("owner!/repo")).toBeNull();
    });

    it("rejects single word without slash", () => {
      expect(parseRepoUrl("justarepo")).toBeNull();
    });

    it("rejects path with too many segments", () => {
      expect(parseRepoUrl("a/b/c/d")).toBeNull();
    });
  });
});

describe("getSupportedDomains", () => {
  it("returns all domain aliases", () => {
    const domains = getSupportedDomains();
    expect(domains).toContain("github");
    expect(domains).toContain("gh");
    expect(domains).toContain("gitlab");
    expect(domains).toContain("gl");
    expect(domains).toContain("codeberg");
    expect(domains).toContain("cb");
    expect(domains).toContain("sourcehut");
    expect(domains).toContain("srht");
  });
});

describe("getEngramName", () => {
  it("strips eg. prefix from repo name", () => {
    expect(getEngramName("eg.my-engram")).toBe("my-engram");
  });

  it("preserves name without eg. prefix", () => {
    expect(getEngramName("my-engram")).toBe("my-engram");
  });

  it("only strips leading eg. prefix", () => {
    expect(getEngramName("my-eg.engram")).toBe("my-eg.engram");
  });
});

describe("shortenPath", () => {
  it("replaces home directory with ~", () => {
    const home = process.env.HOME || require("os").homedir();
    expect(shortenPath(`${home}/some/path`)).toBe("~/some/path");
  });

  it("returns path unchanged if not in home directory", () => {
    expect(shortenPath("/tmp/some/path")).toBe("/tmp/some/path");
  });
});
