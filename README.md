# Exo

Speak once. Get things done beyond the tab.

Exo carries a GitHub issue from Chrome into a selected local Git repository. OpenRouter proposes a patch; the user reviews the exact change and test profile before an isolated run. The original repository stays untouched until the user applies a passing patch.

## Product flow

1. Share a GitHub issue or pull request from the Chrome side panel.
2. Select its local Git repository and describe the change by text or voice.
3. Exo sends the issue, request, and a bounded list of tracked source files to OpenRouter. The review panel exposes the full provider payload.
4. Review the exact patch, test profile, container image, command arguments, and base commit.
5. Approve the patch and profile hashes. Exo runs the baseline and patched revisions in separate local Docker containers with no network.
6. Inspect both outputs and the evidence-based verdict. Choose whether to apply a passing patch to the original repository. Exo can roll back its exact applied change if the repository still matches.

Exo cannot send messages, push, purchase, or deploy. Model proposals cannot write files or execute commands.

## Current implementation

- Chrome Manifest V3 side panel with a repository picker and explicit GitHub page sharing.
- Chrome Native Messaging host with versioned, bounded JSON messages.
- Local repository registry, shared issue context, task state, and receipt log under `~/.exo`.
- OpenRouter chat completions API integration. The API key is stored by the Windows host using current-user DPAPI encryption; the key never enters Chrome storage or task receipts.
- File selection excludes common sensitive filename patterns and rejects tracked sensitive-looking paths. The review discloses the exact prompt payload and selected files.
- Model diffs are restricted to reviewed repository paths; path traversal, secret paths, renames, removals, binary changes, and edits to `.exo` are rejected.
- Approval is single-use and bound to the exact patch and committed test-profile hashes.
- Tests run in local Windows Docker Desktop only, with `--network=none`, a read-only container root, resource limits, no credentials passed in, and writes limited to the scratch worktree. Images must already be present locally.
- Git hooks are disabled for host Git operations. Repositories with configured content filters, symlinks, or submodules fail closed.
- Verdicts distinguish a red-to-green changed test (`verified`), a passing run without that evidence (`passed_unproven`), and failure. Test counts must be recognized to claim verification.
- Applying a passing patch and rolling it back are separate user actions. A changed repository prevents rollback.
- Optional speech input has a text fallback. Speech uses the browser speech service.

The complete Chrome + OpenRouter + Docker flow still needs validation in the target machine environment. Windows is the only host installer currently supplied.

## Requirements

- Windows 10 or 11, Node.js 22 or newer, pnpm 9 or newer, Git, Chrome 116 or newer, and Docker Desktop configured for Linux containers.
- A local OpenRouter API key and a model available to that key.
- Each target repository must be a clean Git working tree and include a committed `.exo/profiles.json`.
- The selected test image must already be downloaded. If dependencies are installed in the target repository's `node_modules`, Exo mounts that directory read-only into the test container. Native dependencies built for Windows may not work in a Linux container; use a Linux-compatible local image/dependency setup for those projects.

## Install Exo

1. Clone this repository and run `pnpm install` from its root.
2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension`.
3. Copy the extension ID shown by Chrome.
4. From the Exo project root, register the host for that ID:

   ```powershell
   pnpm host:install -- -ExtensionId <32-character-extension-id>
   ```

5. Add a target repository:

   ```powershell
   pnpm repo add C:\path\to\your\repository
   pnpm repo list
   ```

6. Open Exo from the Chrome toolbar, configure the OpenRouter model and key, then share a GitHub issue with the selected repository.

To remove the Chrome host registration, run `pnpm host:uninstall`. This leaves the local repository registry, encrypted OpenRouter credential, and task history under `~/.exo`.

## Configure a target repository

Add `.exo/profiles.json` to the target repository and commit it. Commands are JSON argument arrays and are never passed through a shell. The container image must already exist locally.

```json
{
  "version": 1,
  "profiles": [
    {
      "id": "unit",
      "name": "Unit tests",
      "image": "node:22-bookworm",
      "cwd": ".",
      "argv": ["npm", "test"],
      "format": "jest"
    }
  ]
}
```

Supported output formats are `tap`, `pytest`, `jest`, `junit`, and `unknown`. A format the verifier cannot count can still pass, but cannot establish a verified red-to-green result. Download images separately with Docker before using Exo; the test container starts with image pulling disabled and no network.

## Local data and provider disclosure

- `~/.exo/config.json`: repository paths and selected model slug.
- `~/.exo/openrouter.credential`: API key encrypted for the current Windows user by DPAPI.
- `~/.exo/shared-context.json`: most recently shared issue and repository identity.
- `~/.exo/tasks/`: proposal, patch, approval state, test outputs, and verdict.
- `~/.exo/receipts.jsonl`: append-only product event log.
- `~/.exo/worktrees/`: temporary worktree metadata is cleaned after execution.

The extension reads a GitHub issue only after the user presses Share. It captures the URL, title, and selected text or issue description (up to 6,000 characters). A proposal sends that context, the user's request, model instructions, selected repository name and commit, test-profile IDs/output formats, and up to 45 bounded tracked source files (90,000 characters total) to OpenRouter. Test commands and container image IDs stay local. Expand **Data sent to OpenRouter** to inspect the exact request content before approving local execution. OpenRouter's API endpoint and request format are documented in its [official chat completions reference](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion).

## Product plan

See [PLAN.md](PLAN.md) for implementation status, safety boundaries, and remaining work.

## License

Not chosen yet.
