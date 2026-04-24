import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { snapshotsDir } from "./paths.js";
import type { SessionInfo } from "./sessions.js";

export interface Snapshot {
  id: string;
  label?: string;
  createdAt: string;
  sessionId: string;
  agentId: string;
  turnCount: number;
  hash: string;
  sourceBytes: number;
}

export interface SnapshotEntry extends Snapshot {
  dataPath: string;
  metaPath: string;
}

function shortId(): string {
  return randomBytes(4).toString("hex");
}

async function readJsonl(path: string): Promise<string[]> {
  const text = await readFile(path, "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function hashLines(lines: string[]): string {
  const h = createHash("sha256");
  for (const line of lines) h.update(line);
  return h.digest("hex").slice(0, 12);
}

export async function saveSnapshot(
  session: SessionInfo,
  label?: string,
): Promise<Snapshot> {
  const dir = snapshotsDir(session.path);
  await mkdir(dir, { recursive: true });

  const lines = await readJsonl(session.path);
  const id = shortId();
  const snapshot: Snapshot = {
    id,
    label,
    createdAt: new Date().toISOString(),
    sessionId: session.sessionId,
    agentId: session.agentId,
    turnCount: lines.length,
    hash: hashLines(lines),
    sourceBytes: session.sizeBytes,
  };

  const dataPath = join(dir, `${id}.jsonl`);
  const metaPath = join(dir, `${id}.json`);
  await copyFile(session.path, dataPath);
  await writeFile(metaPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  return snapshot;
}

export async function listSnapshots(session: SessionInfo): Promise<SnapshotEntry[]> {
  const dir = snapshotsDir(session.path);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const entries: SnapshotEntry[] = [];
  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    const metaPath = join(dir, name);
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf8")) as Snapshot;
      entries.push({
        ...meta,
        metaPath,
        dataPath: join(dir, `${meta.id}.jsonl`),
      });
    } catch {
      // skip malformed
    }
  }
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return entries;
}

export async function findSnapshot(
  session: SessionInfo,
  ref: string,
): Promise<SnapshotEntry> {
  const all = await listSnapshots(session);
  const match = all.find((s) => s.id === ref || s.id.startsWith(ref) || s.label === ref);
  if (!match) throw new Error(`Snapshot not found: ${ref}`);
  return match;
}

export async function restoreSnapshot(
  session: SessionInfo,
  snapshot: SnapshotEntry,
): Promise<void> {
  // Auto-save current state as a safety net before overwriting.
  await saveSnapshot(session, `auto-before-restore-${snapshot.id}`);
  await copyFile(snapshot.dataPath, session.path);
}

export async function branchSnapshot(
  session: SessionInfo,
  snapshot: SnapshotEntry,
  branchName: string,
): Promise<string> {
  if (!/^[A-Za-z0-9._-]+$/.test(branchName)) {
    throw new Error(`Invalid branch name: ${branchName}`);
  }
  const branchPath = session.path.replace(/\.jsonl$/i, `.branch-${branchName}.jsonl`);
  await copyFile(snapshot.dataPath, branchPath);
  return branchPath;
}

export function diffSnapshots(a: SnapshotEntry, b: SnapshotEntry): {
  turnsAdded: number;
  turnsRemoved: number;
  hashChanged: boolean;
} {
  return {
    turnsAdded: Math.max(0, b.turnCount - a.turnCount),
    turnsRemoved: Math.max(0, a.turnCount - b.turnCount),
    hashChanged: a.hash !== b.hash,
  };
}
