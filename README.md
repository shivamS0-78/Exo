# Exo

Exo is a Chrome side panel and a small local host. You share the page you are reading, say what you want done, and Exo carries the request into a local git repo. It shows what it understood, proposes a patch, runs your tests in a sandbox once you approve, and drafts a reply. It never sends anything. Every action it takes is written to a receipt you can read.

> **Status: planning.** No code has landed yet. This README describes what we are building and the rules it must follow. The [status table](#status) is the source of truth for what works.

## The workflow

The MVP does one thing, end to end.

1. Open a GitHub issue in Chrome and click **Share tab** in the Exo side panel.
2. Pick the local repo. If its `origin` remote matches the issue's repo, Exo preselects it and says so.
3. Hold the mic button and say: *"Fix this locally, run the tests, and draft a reply. Don't send it."*
4. Exo shows a grounding card: which page "this" means, a verbatim quote from it, the repo, branch and commit. If "this" could mean more than one thing, Exo asks instead of guessing.
5. Exo reads the code (read only) and proposes a plan: the files it wants to change and the test command. You confirm it.
6. Exo shows the exact diff and the exact command. You approve. The approval is bound to a hash of that diff and that command.
7. Exo applies the diff in a separate git worktree, runs the tests in a sandbox with no network, and checks the result against a completion contract.
8. Exo writes a reply from the evidence and puts it in the issue's comment box. It does not click Comment.
9. You get a receipt. **Apply** copies the change into your working tree. **Roll back** undoes it.

Your working tree is untouched until step 9.

## What Exo will not do

- Send, post, push, merge, buy or deploy. The MVP has no tool for any of these, so the model can't call one.
- Read a tab you did not share.
- Read or write outside the selected repo, or touch `.env` files, private keys, `.git/` internals, `.github/` workflows or its own `.exo/` config.
- Run arbitrary shell commands. It runs test profiles you define, as a literal argv you can read.
- Follow instructions found in page or repo text. That text is data. The policy gate decides what runs, not the model.
- Report success because a command exited 0. See [Verification](#verification).

## How it works

```
Chrome
+------------------------------------------------+
| Side panel (MV3)                               |
| Ask | Context | Review | Activity | Settings   |
| Approvals are rendered and clicked only here   |
+-----------------------+------------------------+
                        |
                        |  Native Messaging: JSON over stdio.
                        |  Chrome starts the host for Exo's extension ID only.
                        v
+------------------------------------------------+
| exo-host (local Node.js process)               |
|                                                |
|   task engine     append-only event log        |
|   policy gate     checks every tool call       |
|   grants          tied to approved hashes      |
|   model adapter                                |----> model provider API
|   verifier        completion contract          |
|   receipts        hash-chained JSONL           |
|   MCP client                                   |
+-----+-------------+--------------+-------------+
      |             |              |             |
 exo-context    exo-task     exo-workspace  exo-runner
 in process     in process   stdio          stdio
 shared tabs,   plans,       read, search,  test profiles
 read only      drafts,      preview and    in a sandbox,
                questions    apply edits    no network
                             in a worktree
```

- **Native Messaging, not a localhost server.** There is no port for a web page or another local app to find. Chrome starts the host and only lets the extension IDs listed in the host manifest connect to it.
- **Every capability is an MCP tool.** Browser context, workspace access and test running are separate MCP servers. `exo-host` is a standard MCP client, so the same servers work in other MCP hosts.
- **The model proposes, the host executes.** The model can read and propose. Writing files and running tests are done by the host, after you approve, with exactly what you approved.
- **Servers enforce invariants, the host enforces intent.** `exo-workspace` refuses paths outside its root no matter who calls it. `exo-runner` refuses anything that isn't a defined profile. Approvals and grants live in the host.

## Tools

| Tool | Server | Called by | Approval |
|---|---|---|---|
| `context_list`, `context_read` | exo-context | model | none, shared tabs only |
| `ws_tree`, `ws_read`, `ws_search`, `ws_git_info` | exo-workspace | model | none, inside the repo, deny list applies |
| `ws_preview_edits` | exo-workspace | model | none, computes a diff, writes nothing |
| `propose_plan`, `submit_patch`, `propose_draft`, `ask_user` | exo-task | model | none, these only update the side panel |
| `ws_apply_edits` | exo-workspace | host | grant bound to the diff hash |
| `run_profile` | exo-runner | host | grant bound to the profile's argv |

The model proposes edits as exact `old` and `new` strings per file, not as a unified diff it writes itself. The host renders the diff you review and hashes it, so what you approve is byte for byte what gets applied.

Rollback is not a tool. Only you can trigger it, from the side panel.

## Permissions

| Action | Default |
|---|---|
| Read a shared tab, or a file inside the repo | allowed and logged |
| Compute a plan, a diff or a draft | allowed, shown as a preview |
| Write files in the task worktree, run a test profile | one approval, bound to the exact diff and argv |
| Fill the draft into the shared issue's comment box | part of that approval, never submits |
| Apply to your working tree, roll back | your click |
| Send, post, push, buy, delete, deploy | no tool exists |
| Unknown tools, malformed arguments | denied |

If the diff, the command or the file list changes after you approve, the grant stops matching and the task asks again. Grants are single use and expire after 10 minutes.

## Verification

Tests running is not the same as the bug being fixed. A task is **Verified** only when all of these hold:

1. The applied diff matches the approved hash and only approved files changed.
2. **Red:** with only the new or changed tests applied, the tests fail on the original code. The bug is reproduced.
3. **Green:** with the full diff applied, the whole test profile passes.
4. The test count did not drop, and no `.skip` or `.only` was added.
5. Tests ran in the sandbox: no network, temporary `HOME`, scrubbed environment.
6. The draft exists and was not submitted.
7. The receipt chain is intact.

A patch with no test can reach **Passed, unproven** at best. Any failed check means **Failed**, with the evidence attached.

## Receipts

Every tool call, allowed or denied, appends one line to `~/.exo/tasks/<id>/receipts.jsonl` (wrapped here for reading):

```json
{"seq": 7, "ts": "2026-11-24T12:03:11Z", "actor": "host",
 "server": "exo-runner", "tool": "run_profile", "decision": "allow",
 "grant": "g_01", "args_sha256": "4b1c...", "result_sha256": "9e0a...",
 "reversible": "n/a", "prev": "c2d7...", "sha256": "77fa..."}
```

Each line carries the hash of the line before it, so editing or deleting a line breaks the chain.

## What leaves your machine

- What Exo sends to the model provider: the grounding card, the issue text and the file excerpts the model asked to read. Each request is logged in the task with its size and hash.
- If you use voice, Chrome's speech recognition may send audio to Google. Type instead if you don't want that.
- Nothing else. No telemetry, no screenshots. Task logs, receipts and worktrees stay in `~/.exo/`.

## Stack

- Extension: Chrome MV3 side panel, WXT, React, TypeScript
- Host and MCP servers: Node.js 22+, TypeScript, `@modelcontextprotocol/sdk` over stdio
- Model: one adapter in the MVP (Anthropic Messages API with tool use) behind a provider neutral interface. Exo does not automate consumer chat websites.
- Sandbox: Docker with `--network none`, or bubblewrap on Linux
- Storage: JSONL files under `~/.exo/`
- Schemas: zod, shared by the extension, the host and the servers

## Repo layout

Planned:

```
apps/
  extension/       Chrome MV3 side panel (WXT, React, TypeScript)
  host/            Native Messaging host: task engine, policy gate,
                   model adapter, MCP client, exo CLI
packages/
  protocol/        zod schemas for messages, events and receipts
  policy/          permission classes, grants, deny lists (pure, no I/O)
  mcp-workspace/   MCP server: read, search, preview and apply edits
  mcp-runner/      MCP server: named test profiles in a sandbox
  verify/          completion contract, TAP and JUnit parsers
fixtures/
  demo-shop/       seeded repo with known bugs and matching issue texts
  redteam/         prompt injection pages and hostile tool calls
evals/             scenario runner and results
```

## Setup

Planned. None of these commands exist yet.

Requirements: Chrome 120+, Node.js 22+, pnpm, git, and Docker (or bubblewrap on Linux).

```bash
git clone https://github.com/shivamS0-78/Exo && cd Exo
pnpm install && pnpm build
pnpm exo install-host          # writes the Native Messaging host manifest
pnpm exo key set anthropic     # saved to ~/.exo/config.json with mode 0600
pnpm exo add ~/code/your-repo  # repos Exo may work in
pnpm exo doctor                # checks manifest, Node path, sandbox and key
```

Then open `chrome://extensions`, turn on Developer mode, and load `apps/extension/.output/chrome-mv3` as an unpacked extension.

A repo opts in with `.exo/exo.json`. Exo can't write to this file.

```json
{
  "profiles": {
    "test": {
      "argv": ["node", "--test", "--test-reporter=tap"],
      "reporter": "tap",
      "timeout_s": 120,
      "test_globs": ["test/**/*.test.js"]
    }
  }
}
```

## Sharp edges

Things that will bite whoever builds this:

- A Native Messaging host must never print to stdout. Stdout is the protocol. Log to a file.
- Chrome starts the host without your shell environment. `#!/usr/bin/env node` can fail when Node comes from nvm or Homebrew, and `ANTHROPIC_API_KEY` from your shell profile won't be set. The installer writes absolute paths, and the key lives in `~/.exo/config.json`.
- Messages from the host to the extension are capped at 1 MB. Diffs and logs go out in chunks.
- An unpacked extension's ID depends on its folder unless the manifest has a `key`. The host manifest's `allowed_origins` needs a stable ID.
- The side panel may not show the microphone permission prompt. Grant it once from a normal extension tab.
- The `commands` API fires on key press, not release. Hold to talk works on the panel button. The keyboard shortcut toggles.
- A fresh worktree has no `node_modules`. The seeded demo repos use zero dependency tests. Real repos will need dependencies mounted read only.
- Running a test suite runs arbitrary code from the repo. That is why it happens in the sandbox.

## Status

| Piece | State |
|---|---|
| Native Messaging round trip and installer | not started |
| MCP servers: context, task, workspace, runner | not started |
| Policy gate, grants, receipts | not started |
| Verification: baseline, red, green | not started |
| Side panel: Ask, Context, Review, Activity | not started |
| Voice input with text fallback | not started |
| Seeded scenarios and red team suite | not started |
| Eval results | none yet |

Measured results will go here with sample sizes. No numbers until we have them.

## Roadmap

- **MVP:** Chrome, one model provider, one repo per task, bug report to verified fix, voice with a text fallback, receipts and rollback.
- **Next:** the same MCP servers running inside Claude Desktop as a second host, a local model adapter, more than one shared tab.
- **Later:** posting through the GitHub API with a per-action confirmation, workflows outside coding.

## Hackathon

Primary track: PS 2, Beyond the Browser. Secondary: PS 1, Make MCP Matter. The pitch deck calls the product Ghost. The code calls it Exo.

## License

None yet. Until one is added, default copyright applies.
