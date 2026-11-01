// The GitHub reader: URL checks, README cleaning, hints, and the API calls it makes (mocked).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanReadme, extractColors, extractKeywords, parseRepoUrl, readRepo, RepoError } from "../src/pipeline/repo.js";

afterEach(() => vi.unstubAllGlobals());

describe("parseRepoUrl", () => {
  it("accepts github.com repos only", () => {
    expect(parseRepoUrl("https://github.com/berkingurcan/stellar-agent-search")).toEqual({ owner: "berkingurcan", repo: "stellar-agent-search" });
    expect(parseRepoUrl("https://github.com/a/b.git/")).toEqual({ owner: "a", repo: "b" });
    for (const bad of ["http://github.com/a/b", "https://gitlab.com/a/b", "https://github.com/a", "https://github.com/a/b/tree/main", "https://github.com/../x"]) {
      expect(() => parseRepoUrl(bad), bad).toThrow(RepoError);
    }
  });
});

describe("text helpers", () => {
  it("cleans a README down to prose", () => {
    const text = cleanReadme("# Title\n[![CI](https://img.shields.io/x)](y)\n<p align=center><img src=a></p>\n```js\nsecret()\n```\nA [link](https://x.y) here.\n| a | b |\n|---|---|");
    expect(text).toBe("# Title\nA link here.\n| a | b |");
  });

  it("weights name and description words above README words", () => {
    expect(extractKeywords(["scraper", "web scraper for markdown", "the the markdown"]).slice(0, 2)).toEqual(["scraper", "markdown"]);
  });

  it("finds repeated brand colours", () => {
    expect(extractColors("primary: '#ff6600', accent: #FF6600; #123456 #ffffff")).toEqual(["#FF6600", "#123456"]);
  });
});

describe("readRepo", () => {
  it("builds a digest from the API, with the token only in the GitHub request", async () => {
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, auth: new Headers(init.headers).get("authorization") });
        if (url.endsWith("/repos/acme/rocket")) return Response.json({ name: "rocket", full_name: "acme/rocket", description: "Launch web apps fast", topics: ["deploy", "cloud"], language: "Go", homepage: null, private: false, default_branch: "main", html_url: "https://github.com/acme/rocket" });
        if (url.includes("/readme")) return new Response("# Rocket\nRocket deploys your app to the cloud in seconds. Brand colour #E11D48.");
        if (url.includes("/contents?ref=main")) return Response.json([{ name: "go.mod", type: "file" }, { name: "tailwind.config.js", type: "file" }, { name: "cmd", type: "dir" }]);
        if (url.includes("/contents/go.mod")) return new Response("module github.com/acme/rocket\n");
        if (url.includes("/contents/tailwind.config.js")) return new Response("colors: { brand: '#E11D48', ink: '#0F172A' }");
        return new Response("not found", { status: 404 });
      }),
    );
    const digest = await readRepo("https://github.com/acme/rocket", { token: "ghp_test" });
    expect(digest).toMatchObject({ owner: "acme", repo: "rocket", description: "Launch web apps fast", topics: ["deploy", "cloud"], language: "Go", colorHints: ["#E11D48", "#0F172A"] });
    expect(digest.keywords).toContain("rocket");
    expect(calls.every((call) => call.url.startsWith("https://api.github.com/") && call.auth === "Bearer ghp_test")).toBe(true);
  });

  it("explains a missing or private repo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(readRepo("https://github.com/acme/secret")).rejects.toThrow(/not found, or it is private/);
  });
});
