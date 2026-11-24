# Exo Product Plan

**Product goal:** Carry a developer's browser context into a local code change that the developer reviews, approves, and can verify.

## Integrated product path

1. Share an issue or pull request from the Chrome side panel with a selected local repository.
2. Submit a text or voice request to the Node Native Messaging host.
3. Filter tracked source files and send bounded context to OpenRouter using the configured model.
4. Validate the returned unified diff against repository paths and the current commit.
5. Present the original issue, request, exact patch, selected test profile, base commit, and exact provider payload for review.
6. Consume a single-use approval bound to the patch and test-profile hashes.
7. Run baseline and patched worktrees in local Windows Docker Desktop containers with network disabled.
8. Derive a verdict from exit status, recognized test counts, changed test files, and red-to-green behavior.
9. Record local receipts and evidence. Let the user apply a passing patch to the original repository, then roll back the exact applied diff if it remains unchanged.

## Phase status

### Phase 1 — Browser and host foundation

**Implementation:** Present. Runtime installation and Chrome integration have not been validated in this environment.

- Manifest V3 side panel and explicit GitHub capture.
- Bounded, versioned Native Messaging protocol.
- Local repository registry, issue context, task state, and receipts.
- Windows install and uninstall scripts.

### Phase 2 — Read-only context and proposals

**Implementation:** Present. OpenRouter calls and proposal parsing have not been validated with a configured account.

- Current-user DPAPI credential storage for the OpenRouter key.
- Bounded tracked-file selection with sensitive-path filtering.
- Full provider payload disclosure in the review panel.
- Structured JSON proposal with summary, unified patch, test profile, and reply draft.
- Patch targets restricted to shared source files and safe new code/test files.

### Phase 3 — Review-bound approval and execution

**Implementation:** Present. Docker Desktop and test-profile behavior require validation on the user's machine.

- One-time approval bound to exact patch and profile hashes.
- Clean-tree and base-commit checks before execution.
- Baseline and fixed detached worktrees.
- Literal argv test profiles run in local Windows Docker Desktop with no network, read-only container root, bounded resources, and a five-minute timeout.
- Local-only images, disabled image pulls, and no credentials passed into the test container.
- Fail closed when Docker is unavailable or not a local Windows named-pipe endpoint.

### Phase 4 — Evidence and recovery

**Implementation:** Present. End-to-end outcomes remain unvalidated.

- Test output, recognized count, exit code, verdict, and unsent reply draft.
- `verified` requires baseline failure, patched success, recognized test counts, and a changed test file; other passing results are `passed_unproven`.
- Append-only local receipts for proposal, approval, execution, apply, and rollback events.
- Separate apply action for passing patches and rollback guarded by repository state hashes.
- No remote send, push, purchase, or deploy operation.

### Phase 5 — Reliability, portability, and interoperability

**Remaining:**

- Validate the complete Chrome → host → OpenRouter → Docker → apply/rollback path on a clean Windows machine.
- Add installers and encrypted credential storage for other operating systems.
- Add MCP server/client interoperability if required for the selected event track.
- Build repeatable safety and reliability evaluations, publish sample sizes and failures, and compare with a documented manual baseline.
- Improve test output parsing and support common report artifacts without overstating verification.
- Add user-facing task history, cleanup controls, and recovery for interrupted worktree execution.

## Safety invariants

- Page and repository text are untrusted input.
- Page capture happens only after the user selects Share.
- OpenRouter receives no local API key. The provider payload is visible before approval to execute any local code.
- Proposal generation has no write or run tools.
- Approval applies to one exact patch and profile, once.
- The original repository must be clean and remain at the reviewed commit before apply.
- Tests run only in local Docker Desktop with network disabled and writes limited to the scratch worktree.
- Exo does not claim `verified` without recognized red-to-green test evidence.
- Rollback stops if repository changes no longer match what Exo applied.

## Known limits

- Windows is the only supported host installation and credential-storage platform.
- User-provided Docker images and literal test profiles must be configured and downloaded first.
- Docker receives the target repository's `node_modules` read-only when it is a real directory; Windows-native dependencies may not work in Linux containers.
- The current patch validator supports bounded text diffs to existing files and safe new source/test files, not deletions, renames, or binary changes.
- Test output recognition is intentionally conservative. Unsupported formats can pass but remain `passed_unproven`.
- Repositories with configured Git content filters, symlinks, or submodules are rejected to avoid running repository hooks/filters on the host.
- Full product runtime integration has not been validated in this workspace.
