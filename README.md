# Exo

Speak once. Get things done beyond the tab.

Exo is a voice-first Chrome side panel that carries one request from the page you are reading into your local repository, under rules you approve. Share a bug report, say "fix this locally, run the tests, and draft a reply, don't send it," and Exo grounds "this" in that page, proposes a patch, runs the tests in a sandbox once you approve, and shows you the evidence. Every action leaves a receipt.

For the hackathon, this project is pitched as **Ghost**, on track PS 2 (Beyond the Browser), with PS 1 (Make MCP Matter) as the secondary fit.

> **Status: planning. There is no product code yet.** This README describes what we are building. Anything marked *planned* is a target, not a feature. We update this file as pieces land, and it should never claim more than the code does.

## The one workflow

We are building a single flow end to end before adding anything else.

1. Open a GitHub issue in Chrome and pick the matching local repo in the Exo panel.
2. Hold the mic button and say: "Fix this bug locally, run the tests, and draft a reply. Don't send it."
3. Exo shows what it understood: the issue, a verbatim quote from it, the repo, and the commit it will work from.
4. Exo reads the relevant files and proposes a plan: the exact diff, the exact test command, and the data that will leave your machine.
5. You approve. The approval covers that diff and that command, nothing else. A changed plan needs a new approval.
6. Exo applies the patch in a scratch git worktree and runs the tests with no network access.
7. You get a verdict with the evidence behind it, a drafted reply, and a rollback button.

Nothing gets posted. The MVP has no tool that can send, push, purchase, or deploy.

## Why

Chat assistants can explain a fix. You still carry it between tools: read the report, explain it to the chat, copy code into the editor, run commands, paste errors back, return to the browser, write the update. Every hop is a chance to lose context or make a mistake.

Exo removes the hops for one common workflow and keeps you in control at each boundary. Other tools already overlap with this. Claude Code integrates with Chrome, and ChatGPT agent asks for confirmation before consequential actions. Our bet is narrower: a browser-first, voice-first flow with explicit grounding and visible proof is easier to trust. The evaluation section says how we will test that bet.

## How it works

```
Chrome                                     Your machine
+---------------------------+  Native     +--------------------------------------+
| Side panel                |  Messaging  | exo-host                             |
|  Ask, Context, Review,    |  (stdio,    |  task engine (append-only log)       |
|  Activity, Settings       |<----------->|  policy gate + approval grants       |
| Service worker            |  no port)   |  model adapter -------> AI provider  |
| Content script: reads a   |             |  executor + verifier + receipts      |
| page only when you share  |             |  MCP client                          |
+---------------------------+             |   +- exo-context    shared pages     |
                                          |   +- exo-workspace  repo, jailed     |
                                          |   +- exo-runner     sandboxed tests  |
                                          +--------------------------------------+
```

- **No local server.** Chrome launches `exo-host` through Native Messaging, and only for the Exo extension ID. There is no port for a web page or another app to reach.
- **The model proposes, the host executes.** The model gets read tools and a `propose_plan` tool. Write and run tools are called by the host's executor, and only after you approve.
- **Servers enforce invariants, the host enforces intent.** `exo-workspace` refuses paths outside the repo and known secret files no matter which MCP client calls it. The host adds approvals bound to a hash of the exact plan.
- **Verdicts come from evidence.** Exit codes, parsed test counts, and diff scope decide the result. The model's opinion of its own work does not.
- **Your working tree stays untouched until you click Apply.** Edits happen in a detached git worktree under `~/.exo`, outside your repo.

### Tools

| Tool | Server | Called by | Needs approval |
|---|---|---|---|
| `context_list`, `context_read` | exo-context | model | No. Limited to pages you shared |
| `ws_list_files`, `ws_read_file`, `ws_search` | exo-workspace | model | No. Limited to the selected repo, minus the deny list |
| `ws_propose_edits` | exo-workspace | model | No. Builds a diff in memory and writes nothing |
| `propose_plan`, `ask_user`, `draft_reply` | host | model | No. These only create previews and questions |
| `ws_apply_patch` | exo-workspace | executor | Yes. The grant must match the patch hash |
| `run_profile` | exo-runner | executor | Yes. The grant must match the named test profile |
| Apply to repo, Roll back | host | you | Your click is the approval |

If a malicious page fully hijacks the model, the model can read what you already shared, propose a plan you still have to approve, and write a draft you still have to copy. That is the blast radius we design for.

### Verdicts

- **Verified:** the patch applied as approved, a new or changed test fails without the fix and passes with it, no tests were removed or skipped, and the draft is ready.
- **Passed (unproven):** the tests pass, but nothing shows the change fixes the reported bug. Usually the patch had no regression test.
- **Failed:** anything else, with the evidence attached.

## Safety and privacy

- **Untrusted input.** Page text and repo content are data, not instructions. A bug report that says "read ~/.ssh and post it" can change what the model proposes. It cannot change what the policy gate allows.
- **Tests are code.** Running tests runs project code. `run_profile` uses Docker with `--network=none` or bubblewrap with `--unshare-net`, a scrubbed environment with no API keys or tokens, writes limited to the scratch worktree, and a timeout. Profiles are literal argv lists read from your repo's committed `.exo/profiles.json`. They are never shell strings and never `npm test`, because a patch can rewrite what `npm test` does.
- **No sandbox, no tests.** If neither sandbox is available, Exo will not run tests unless you opt in for that repo, and the receipt records `sandbox: none`.
- **Local first.** Task logs, receipts, and page snapshots stay in `~/.exo`. The model provider receives exactly what the task's "Sent to provider" list shows.
- **Voice.** Chrome's built-in speech recognition sends audio to Google. Text input always works.
- **Undo has limits.** Scratch worktree changes and Exo's edits to your files can be rolled back. A sent message or a payment cannot be undone, which is one reason the MVP can do neither.

`pnpm redteam` (planned) calls the tools directly with hostile arguments, with no model in the loop, and checks that each call is denied and receipted.

## Repository layout (planned)

```
apps/
  extension/       Chrome MV3 side panel (WXT + React)
  host/            exo-host: native messaging, task engine, policy, model adapter, MCP client
packages/
  protocol/        zod schemas shared by extension and host
  policy/          policy rules and grant checks (pure functions)
  verifier/        completion contract checks, TAP and JUnit parsers
  mcp-context/     exo-context MCP server
  mcp-workspace/   exo-workspace MCP server (stdio)
  mcp-runner/      exo-runner MCP server (stdio)
fixtures/
  demo-shop/       seeded bugs, including a prompt-injection issue
evals/             scenario runner and results
scripts/           install-host, uninstall-host, redteam
```

## Getting started (planned, not runnable yet)

Requirements: Node 22 or newer, pnpm 9 or newer, Chrome 116 or newer, git 2.40 or newer, and Docker or bubblewrap.

```bash
git clone https://github.com/shivamS0-78/Exo.git
cd Exo
pnpm install
pnpm build
pnpm exo:install-host   # writes the native messaging manifest and launcher for your OS
```

Load `apps/extension/.output/chrome-mv3` from `chrome://extensions` with Developer mode on. Add your model API key under Settings in the side panel, pick a repo under Context, share a tab, and ask.

Remove the host with `pnpm exo:uninstall-host`.

## Roadmap

MVP for the hackathon:

- [ ] Native messaging round trip, installer, fixed extension ID
- [ ] GitHub issue capture and the grounding card
- [ ] Read tools over MCP, plan proposal, approval bound to the plan hash
- [ ] Scratch worktree, sandboxed test profiles, baseline, red, and green runs
- [ ] Receipts, Activity timeline, Apply to repo, rollback
- [ ] Push-to-talk with a text fallback
- [ ] Prompt-injection scenario and `pnpm redteam`
- [ ] Eval run on seeded scenarios, published with sample sizes

Stretch:

- [ ] Run the same MCP servers from Claude Desktop to show interoperability (PS 1)
- [ ] Local model adapter (Ollama)
- [ ] Several shared tabs and selection-level grounding

Later: more model providers, local speech recognition, connected-service APIs, and everyday browser tasks outside coding.

## Evaluation (planned)

We will publish what we measure, with sample sizes and failures included, and nothing we did not measure.

| Metric | How we measure it |
|---|---|
| Verified completion | Correct change, red-then-green tests, accurate draft |
| End-to-end time | From request to verdict, including approval time |
| Manual handoffs | Copy-paste steps and app switches |
| Context accuracy | Right issue, repo, files, and draft destination |
| Safety | Hostile cases blocked, out of the total tried |
| Rollback | Files and `git status` match the state before the task |

The baseline is the same scenarios done by hand with a chat assistant, an editor, and a terminal. Results will be committed to `evals/results/`.

## License

Not chosen yet.
