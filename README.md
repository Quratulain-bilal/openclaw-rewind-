# openclaw-rewind

**Git-like time-travel for AI conversations.** Save snapshots of your [OpenClaw](https://github.com/openclaw/openclaw) sessions, rewind mistakes, branch experiments, and diff turns — all from the command line.

```
$ openclaw-rewind save --label "before refactor"
Saved snapshot e4feda90 (before refactor)
  turns : 42
  hash  : 0decacb38312

$ openclaw-rewind back 1
Rewound to snapshot e4feda90 (1 step back).
```

## Why

LLM sessions are append-only JSONL files. When a conversation goes sideways — wrong tool call, hallucinated path, bad refactor plan — you usually have to start over or hand-edit the file. `openclaw-rewind` treats your session like a git-tracked document: **save, list, rewind, branch, diff.**

No OpenClaw runtime required. Reads and writes `~/.openclaw/agents/*/sessions/*.jsonl` directly.

## Install

```bash
npm install -g @syeda_quratualin/openclaw-rewind
```

Or run without installing:

```bash
npx @syeda_quratualin/openclaw-rewind list
```

## Commands

| Command | Does |
|---|---|
| `sessions` | List all detected sessions across agents |
| `save [--label <text>]` | Snapshot the current session state |
| `list` | Show snapshots for a session (oldest → newest) |
| `back <N>` | Restore the snapshot N steps before the newest |
| `to <id>` | Restore a specific snapshot by id or label |
| `branch <name> <id>` | Create a sibling session file forked from a snapshot |
| `diff <a> <b>` | Compare two snapshots (turns added/removed, hash change) |

All commands accept `--session <id>` to target a specific session. By default the **most recently modified** session is chosen.

## Safety

Every `back` and `to` operation **auto-saves** the current state as `auto-before-restore-<id>` before overwriting. You can always undo a rewind.

## Environment

- `OPENCLAW_HOME` — override the default `~/.openclaw` root.
- `--root <path>` — same, per-invocation.

## Example workflow

```bash
# Mark a known-good point before a risky prompt
openclaw-rewind save --label "clean-baseline"

# ... let the agent run, it goes off the rails ...

# Rewind
openclaw-rewind back 1

# Or fork a branch to try a different direction without losing the current one
openclaw-rewind branch experiment clean-baseline
```

## How it works

Snapshots live alongside the session:

```
~/.openclaw/agents/<agent>/sessions/
  abc123.jsonl              ← the live session
  abc123.rewind/
    e4feda90.jsonl          ← snapshot data (full copy)
    e4feda90.json           ← metadata (label, hash, turn count, timestamp)
```

Copies are cheap — sessions are small JSONL. No database, no daemon.

## License

MIT © [Quratulain Shah](https://github.com/Quratulain-bilal)
