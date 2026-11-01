// Stores job outputs on disk and serves them under /files/<bundle>/<name>.
//
// A bundle id is 128 random bits, unrelated to the job id (which a client may choose), so output
// URLs can't be guessed. Bundles are deleted after the job retention period plus an hour, which keeps
// every URL in a job result valid for as long as the job itself [S8].

import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BUNDLE = /^[0-9a-f]{32}$/;
const NAME = /^[a-z0-9][a-z0-9-]{0,60}\.(svg|pdf)$/;

export class FileStore {
  constructor(
    private readonly dir: string,
    private readonly publicOrigin: string,
  ) {}

  async newBundle(): Promise<Bundle> {
    const id = randomBytes(16).toString("hex");
    const path = join(this.dir, id);
    await mkdir(path, { recursive: true });
    return new Bundle(id, path, `${this.publicOrigin}/files/${id}`);
  }

  /** Returns the file and its content type, or undefined for anything not stored by newBundle(). */
  async read(bundle: string, name: string): Promise<{ body: Buffer; type: string } | undefined> {
    if (!BUNDLE.test(bundle) || !NAME.test(name)) return undefined;
    try {
      const body = await readFile(join(this.dir, bundle, name));
      return { body, type: name.endsWith(".svg") ? "image/svg+xml" : "application/pdf" };
    } catch {
      return undefined;
    }
  }

  /** Deletes bundles older than maxAgeSeconds. Returns how many were removed. */
  async sweep(maxAgeSeconds: number): Promise<number> {
    let removed = 0;
    let entries: string[];
    try {
      entries = await readdir(this.dir);
    } catch {
      return 0;
    }
    const cutoff = Date.now() - maxAgeSeconds * 1000;
    for (const entry of entries) {
      if (!BUNDLE.test(entry)) continue;
      const path = join(this.dir, entry);
      const info = await stat(path).catch(() => undefined);
      if (info && info.mtimeMs < cutoff) {
        await rm(path, { recursive: true, force: true });
        removed++;
      }
    }
    return removed;
  }
}

export class Bundle {
  constructor(
    readonly id: string,
    private readonly path: string,
    private readonly baseUrl: string,
  ) {}

  async put(name: string, body: string | Buffer): Promise<string> {
    if (!NAME.test(name)) throw new Error(`bad file name ${name}`);
    await writeFile(join(this.path, name), body);
    return `${this.baseUrl}/${name}`;
  }
}
