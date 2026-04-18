# Instructions for Claude Code

Read this file completely before doing anything. Then execute the tasks in order. Ask me for confirmation only when a step requires a decision or credentials I haven't provided.

## Who I am

I'm a non-technical user. I've asked you to do all the setup for me. When I need to click something in a browser, spell it out exactly. When you can do something in a terminal, do it yourself.

## Shell note

I'm on Windows, probably using PowerShell or Git Bash (whichever WebStorm's terminal opens by default). Most commands below are written in bash syntax that works in Git Bash. If you detect PowerShell and a command fails because of shell syntax, translate it and tell me what you changed. Don't get stuck on syntax.

## Goal

I have an existing GitHub repo: **`RegeleViteaz/DidiWork`**.

This project is a React + Vite + Tauri 2 desktop app called "Checklist de révision". I want to release Windows `.exe` versions by pushing a git tag, with **GitHub Actions doing all the compilation in the cloud**. I never want to install Rust or Visual Studio Build Tools on my PC.

The project is already scaffolded with:
- React app in `src/`
- Tauri 2 wrapper in `src-tauri/`
- GitHub Actions workflow at `.github/workflows/build.yml`
- `HOW_TO_RELEASE.md` with release docs
- Everything needed for a first release

Your job is to get the first successful release published and give me a working download URL.

---

## Step 0 — Orient yourself

You're running inside WebStorm's terminal, in the root of the user's `DidiWork` project. **Use the current working directory** (`.`) — don't use absolute paths like `/path/to/something`.

First, verify where you are:

```bash
pwd
ls -la
```

Expect to see `package.json`, `src/`, `src-tauri/`, `.github/`, etc. If you don't see these, tell me — we're in the wrong folder.

Verify required tools:

```bash
node --version     # need 18+, 20 preferred
npm --version
git --version
gh --version       # GitHub CLI — might not be installed yet
```

If `gh` is missing, install it via the user's package manager before continuing:
- Windows with winget: `winget install --id GitHub.cli`
- Windows with scoop: `scoop install gh`
- If neither is available, tell me and stop — I'll install it manually.

After installing `gh`, run `gh auth status`. If not logged in:

```bash
gh auth login
```

Choose **GitHub.com → HTTPS → Yes (authenticate Git with GitHub credentials) → Login with a web browser**. This opens the browser, I paste a code, and we're done. This also sets up `git` authentication automatically — no PAT handling.

**Confirm to me:** "Pre-flight checks pass: I'm in `<path>`, Node `<version>`, `gh` authenticated as `<username>`."

---

## Step 1 — Verify local state

Only care about the web build — we're not compiling Rust locally, ever.

```bash
npm install
npm run build
```

If either fails, show me the error and stop. Don't try to auto-fix except for trivial things (like missing peer dependency).

Verify the scaffold I care about exists:

```bash
ls .github/workflows/build.yml
ls src-tauri/tauri.conf.json
ls src-tauri/Cargo.toml
ls src-tauri/icons/icon.ico
```

If any file is missing, tell me and stop — the zip extraction may have gone wrong.

**Confirm to me:** "Web build succeeds. Tauri scaffold intact."

---

## Step 2 — Sync with GitHub

Check git state:

```bash
git status
git remote -v
git branch --show-current
git log --oneline -3
```

Verify the remote is `https://github.com/RegeleViteaz/DidiWork.git` (or `.git` stripped). If not, stop and tell me the actual remote so we can decide what to do.

Remember the current branch name for later — it might be `main` or `master`.

**Before committing anything, pull the latest remote state** to avoid conflicts:

```bash
git fetch origin
git pull --rebase origin <branch-name>
```

If the rebase conflicts, stop and show me the conflict — I may need to decide. Don't auto-resolve.

Now check what's changed locally:

```bash
git status
```

You should see new files under `.github/`, `src-tauri/`, plus modifications to `package.json`, `vite.config.js`, `src/App.jsx`, `src/index.css`, `src/main.jsx`. If you see `node_modules/` or `dist/` appearing in git status, STOP — `.gitignore` is broken and we'd commit junk.

Stage only what we want, then commit:

```bash
git add .github/ src-tauri/ package.json vite.config.js src/ index.html tailwind.config.js postcss.config.js .gitignore README.md HOW_TO_RELEASE.md CLAUDE.md CLAUDE_CODE_INSTRUCTIONS.md
git status
```

Verify the list looks right before committing. If anything unexpected is staged, un-stage it and tell me.

```bash
git commit -m "Add Tauri desktop wrapper + GitHub Actions build pipeline"
git push origin <branch-name>
```

If push fails because of auth, `gh auth login` should have already set things up. If it still fails, show me the error.

**Confirm to me:** "Pushed commit `<sha>` to GitHub."

---

## Step 3 — One-time GitHub settings (I do this in my browser)

Print this message to me:

> I need you to do one thing in your browser before I continue:
>
> 1. Open `https://github.com/RegeleViteaz/DidiWork/settings/actions`
> 2. Scroll to **Workflow permissions** near the bottom
> 3. Click the radio button **Read and write permissions**
> 4. Click **Save**
> 5. Come back and tell me "done"

Wait for me to reply "done" before continuing.

---

## Step 4 — Test the build (no tag, no release yet)

Trigger the workflow manually via `gh`:

```bash
gh workflow run build.yml
```

Wait a few seconds, then grab the run ID of the run we just triggered. Note: `sleep` works on Git Bash / WSL but not native Windows cmd. If you're in PowerShell, use `Start-Sleep -Seconds 5`. If you're in cmd, use `timeout /t 5`. Or just wait manually.

```bash
# Wait ~5 seconds for GitHub to register the run
RUN_ID=$(gh run list --workflow=build.yml --limit 1 --json databaseId --jq '.[0].databaseId')
echo "Run ID: $RUN_ID"
```

On Windows PowerShell, the syntax is different — use:
```powershell
$RUN_ID = (gh run list --workflow=build.yml --limit 1 --json databaseId --jq '.[0].databaseId')
Write-Output "Run ID: $RUN_ID"
```

Now watch it:

```bash
gh run watch $RUN_ID
```

This blocks until the run finishes. Expect ~8-12 minutes for the first run (Rust compiles everything from scratch).

### If the build succeeds

Download the artifact:

```bash
mkdir -p test-build-output
gh run download $RUN_ID --name checklist-revision-windows --dir test-build-output
ls test-build-output/
```

You should see a file like `Checklist de révision_1.0.0_x64-setup.exe`. Tell me its size and name.

### If the build fails

Read the logs:

```bash
gh run view $RUN_ID --log-failed
```

Common failure modes:
- **"icon file missing"** — `src-tauri/icons/icon.ico` isn't in the repo. Check `git ls-files src-tauri/icons/`. If icons are `.gitignore`'d, fix the ignore and re-add.
- **"cannot resolve tauri"** — `@tauri-apps/cli` not in package.json devDependencies. Add it, commit, push, re-trigger.
- **"rust compile error"** — show me the exact Rust error. Do not try to fix Rust code yourself unless it's an obvious typo in `src-tauri/src/main.rs` or `lib.rs`.
- **"permission denied creating release"** — I missed Step 3. Send me back.

After fixing:

```bash
git add -A && git commit -m "Fix CI: <what you fixed>"
git push origin <branch>
gh workflow run build.yml
# Get new run ID and watch again
```

**Only proceed to Step 5 after the test build succeeded and the artifact is downloadable.**

**Confirm to me:** "Test build succeeded. `.exe` is `<filename>` (<size> MB). Ready to publish v1.0.0?"

---

## Step 5 — Publish v1.0.0

After I confirm, make sure the working tree is clean and up to date:

```bash
git status                             # should say "nothing to commit"
git pull --rebase origin <branch>      # make sure we're on top of remote
```

Create and push the tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Grab the new run ID (different from Step 4's because this was triggered by the tag push). Wait ~5 seconds first:

```bash
RUN_ID=$(gh run list --workflow=build.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $RUN_ID
```

When it finishes green, verify the release exists and has the `.exe` attached. Wait ~15 seconds for asset upload:

```bash
gh release view v1.0.0
```

The output should list an asset ending in `.exe`. If the assets list is empty, wait 30 seconds and check again — upload might still be in flight.

Give me the final URL:

```bash
echo "https://github.com/RegeleViteaz/DidiWork/releases/tag/v1.0.0"
```

**Tell me:** "Release v1.0.0 published. Download URL: `<url>`. You can share this link."

---

## Rules

**Do not:**
- Install Rust, Visual Studio Build Tools, MSVC, or any native compiler on my machine. Everything compiles on GitHub's servers.
- Run `npm run tauri:build` or `cargo build` locally. These require Rust.
- Commit `node_modules`, `dist`, `src-tauri/target`, `src-tauri/gen`.
- Resolve a git merge conflict without asking me first.
- Delete tags or force-push. If you need to redo a release, make a new tag (`v1.0.1`) instead.
- Make architecture changes (swap Tauri for Electron, rewrite `App.jsx`, split files) without asking.

**Do:**
- Fix trivial CI errors (typos, missing dependency entries) and explain what you changed.
- Show me command output so I can follow along.
- Stop and ask if unsure. Small clarifying questions are cheap; silent wrong changes are expensive.

---

## Reference

- `README.md` — project overview (for users who will download the `.exe`)
- `HOW_TO_RELEASE.md` — the target behavior; my "release v1.0.1, v1.0.2…" workflow after this first release works
- `CLAUDE.md` — code conventions for when you later modify `src/App.jsx`
- `.github/workflows/build.yml` — the CI file, don't touch unless CI fails
- `src-tauri/tauri.conf.json` — app name, version, window size, icon paths, installer mode
- `src-tauri/Cargo.toml` — Rust dependencies (don't touch unless Rust build fails)

## If truly stuck

Stop, print what you tried, what failed, what you think is happening, and what you'd try next. Wait for my direction. Don't keep retrying variations of the same thing more than twice.
