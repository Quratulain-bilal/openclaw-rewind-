import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { resolveOpenClawRoot } from "./paths.js";

export interface SessionInfo {
  agentId: string;
  sessionId: string;
  path: string;
  sizeBytes: number;
  modifiedAt: Date;
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

export async function listSessions(rootOverride?: string): Promise<SessionInfo[]> {
  const root = resolveOpenClawRoot(rootOverride);
  const agentsDir = join(root, "agents");
  const agents = await safeReaddir(agentsDir);

  const results: SessionInfo[] = [];
  for (const agentId of agents) {
    const sessionsDir = join(agentsDir, agentId, "sessions");
    const files = await safeReaddir(sessionsDir);
    for (const name of files) {
      if (!name.endsWith(".jsonl")) continue;
      const path = join(sessionsDir, name);
      try {
        const s = await stat(path);
        results.push({
          agentId,
          sessionId: name.replace(/\.jsonl$/, ""),
          path,
          sizeBytes: s.size,
          modifiedAt: s.mtime,
        });
      } catch {
        // skip unreadable
      }
    }
  }
  results.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  return results;
}

export async function resolveSession(
  ref: string | undefined,
  rootOverride?: string,
): Promise<SessionInfo> {
  const all = await listSessions(rootOverride);
  if (all.length === 0) {
    throw new Error(
      `No sessions found under ${resolveOpenClawRoot(rootOverride)}/agents/*/sessions/*.jsonl`,
    );
  }
  if (!ref) {
    return all[0]!;
  }
  const match = all.find(
    (s) => s.sessionId === ref || s.sessionId.startsWith(ref) || s.path === ref,
  );
  if (!match) {
    throw new Error(`Session not found: ${ref}`);
  }
  return match;
}
