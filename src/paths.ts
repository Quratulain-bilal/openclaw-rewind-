import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function expandTilde(p: string): string {
  if (!p) return p;
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

export function resolveOpenClawRoot(override?: string): string {
  const raw = override ?? process.env.OPENCLAW_HOME ?? "~/.openclaw";
  return resolve(expandTilde(raw));
}

export function snapshotsDir(sessionFile: string): string {
  return sessionFile.replace(/\.jsonl$/i, "") + ".rewind";
}
