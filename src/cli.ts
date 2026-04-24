#!/usr/bin/env node
import { listSessions, resolveSession } from "./sessions.js";
import {
  branchSnapshot,
  diffSnapshots,
  findSnapshot,
  listSnapshots,
  restoreSnapshot,
  saveSnapshot,
} from "./snapshots.js";

const USAGE = `openclaw-rewind — git-like time-travel for AI conversations

Usage:
  openclaw-rewind save    [--session <id>] [--label <text>]
  openclaw-rewind list    [--session <id>]
  openclaw-rewind sessions
  openclaw-rewind back    <N> [--session <id>]
  openclaw-rewind to      <snapshot-id> [--session <id>]
  openclaw-rewind branch  <name> <snapshot-id> [--session <id>]
  openclaw-rewind diff    <snapshot-a> <snapshot-b> [--session <id>]

Flags:
  --session <id>      Operate on a specific session (default: most recently modified)
  --root    <path>    Override OpenClaw home (default: $OPENCLAW_HOME or ~/.openclaw)
  -h, --help          Show this help
  -v, --version       Show version
`;

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (a === "-h") {
      flags.help = true;
    } else if (a === "-v") {
      flags.version = true;
    } else {
      positional.push(a);
    }
  }
  return { command: positional.shift() ?? "", positional, flags };
}

function strFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function cmdSessions(root?: string): Promise<void> {
  const all = await listSessions(root);
  if (all.length === 0) {
    console.log("No sessions found.");
    return;
  }
  for (const s of all) {
    console.log(
      `${s.sessionId.padEnd(40)}  ${s.agentId.padEnd(20)}  ${formatBytes(s.sizeBytes).padStart(8)}  ${s.modifiedAt.toISOString()}`,
    );
  }
}

async function cmdSave(
  sessionRef: string | undefined,
  label: string | undefined,
  root?: string,
): Promise<void> {
  const session = await resolveSession(sessionRef, root);
  const snap = await saveSnapshot(session, label);
  console.log(`Saved snapshot ${snap.id}${label ? ` (${label})` : ""}`);
  console.log(`  session  : ${session.sessionId}`);
  console.log(`  turns    : ${snap.turnCount}`);
  console.log(`  hash     : ${snap.hash}`);
}

async function cmdList(sessionRef: string | undefined, root?: string): Promise<void> {
  const session = await resolveSession(sessionRef, root);
  const snaps = await listSnapshots(session);
  if (snaps.length === 0) {
    console.log(`No snapshots yet for session ${session.sessionId}. Run 'openclaw-rewind save'.`);
    return;
  }
  console.log(`Session: ${session.sessionId}\n`);
  for (const s of snaps) {
    const label = s.label ? `  [${s.label}]` : "";
    console.log(`  ${s.id}  ${s.createdAt}  turns=${s.turnCount}  hash=${s.hash}${label}`);
  }
}

async function cmdBack(n: number, sessionRef: string | undefined, root?: string): Promise<void> {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`'back' requires a positive integer, got: ${n}`);
  }
  const session = await resolveSession(sessionRef, root);
  const snaps = await listSnapshots(session);
  // snaps is oldest→newest. "back N" means go N steps before the newest,
  // so index = length - 1 - N. "back 1" = second-to-newest snapshot.
  const targetIdx = snaps.length - 1 - n;
  if (targetIdx < 0) {
    throw new Error(
      `Only ${snaps.length} snapshot(s) exist; cannot go back ${n}. Save more first, or use 'to <id>'.`,
    );
  }
  const target = snaps[targetIdx]!;
  await restoreSnapshot(session, target);
  console.log(`Rewound to snapshot ${target.id} (${n} step${n > 1 ? "s" : ""} back).`);
  console.log(`  turns    : ${target.turnCount}`);
  console.log(`  saved    : ${target.createdAt}`);
}

async function cmdTo(ref: string, sessionRef: string | undefined, root?: string): Promise<void> {
  const session = await resolveSession(sessionRef, root);
  const target = await findSnapshot(session, ref);
  await restoreSnapshot(session, target);
  console.log(`Rewound to snapshot ${target.id}.`);
  console.log(`  turns    : ${target.turnCount}`);
}

async function cmdBranch(
  name: string,
  ref: string,
  sessionRef: string | undefined,
  root?: string,
): Promise<void> {
  const session = await resolveSession(sessionRef, root);
  const target = await findSnapshot(session, ref);
  const branchPath = await branchSnapshot(session, target, name);
  console.log(`Created branch '${name}' from snapshot ${target.id}.`);
  console.log(`  path     : ${branchPath}`);
}

async function cmdDiff(
  refA: string,
  refB: string,
  sessionRef: string | undefined,
  root?: string,
): Promise<void> {
  const session = await resolveSession(sessionRef, root);
  const a = await findSnapshot(session, refA);
  const b = await findSnapshot(session, refB);
  const d = diffSnapshots(a, b);
  console.log(`${a.id} → ${b.id}`);
  console.log(`  turns added   : ${d.turnsAdded}`);
  console.log(`  turns removed : ${d.turnsRemoved}`);
  console.log(`  hash changed  : ${d.hashChanged}`);
}

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv);
  if (flags.help || (!command && !flags.version)) {
    console.log(USAGE);
    return;
  }
  if (flags.version) {
    console.log("0.1.0");
    return;
  }
  const session = strFlag(flags, "session");
  const root = strFlag(flags, "root");
  const label = strFlag(flags, "label");

  switch (command) {
    case "sessions":
      await cmdSessions(root);
      return;
    case "save":
      await cmdSave(session, label, root);
      return;
    case "list":
      await cmdList(session, root);
      return;
    case "back": {
      const n = Number.parseInt(positional[0] ?? "", 10);
      await cmdBack(n, session, root);
      return;
    }
    case "to": {
      const ref = positional[0];
      if (!ref) throw new Error("'to' requires a snapshot id");
      await cmdTo(ref, session, root);
      return;
    }
    case "branch": {
      const name = positional[0];
      const ref = positional[1];
      if (!name || !ref) throw new Error("'branch' requires <name> and <snapshot-id>");
      await cmdBranch(name, ref, session, root);
      return;
    }
    case "diff": {
      const a = positional[0];
      const b = positional[1];
      if (!a || !b) throw new Error("'diff' requires two snapshot ids");
      await cmdDiff(a, b, session, root);
      return;
    }
    default:
      console.error(`Unknown command: ${command}\n`);
      console.error(USAGE);
      process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(`openclaw-rewind: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
