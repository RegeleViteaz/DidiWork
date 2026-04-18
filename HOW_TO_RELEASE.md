# How to build and release the Windows app

You don't install anything on your PC. GitHub compiles the app for you in the cloud.

## First-time setup (5 minutes, one time only)

1. Push your project to GitHub (you already did this with `RegeleViteaz/DidiWork`)
2. Make sure this file exists in your repo: `.github/workflows/build.yml`
3. On GitHub, go to your repo → **Settings** → **Actions** → **General** → scroll to **Workflow permissions** → select **"Read and write permissions"** → Save
   - This lets the workflow create releases automatically

That's it for setup.

## Every time you want a new `.exe`

### Method A — Publish an official release (recommended)

Bump the version in two places:
- `package.json` → `"version": "1.0.0"` → `"1.0.1"`
- `src-tauri/tauri.conf.json` → `"version": "1.0.0"` → `"1.0.1"`

Commit and push. Then create and push a version tag:

```bash
git tag v1.0.1
git push origin v1.0.1
```

Go to your repo's **Actions** tab. A workflow named "Build Windows app" starts. Wait ~10 minutes.

When it finishes green, go to your repo's **Releases** tab. A new release appears with the `.exe` file attached. **That's your download link to share.**

### Method B — Test build without a release (no tag)

On GitHub, go to **Actions** → **Build Windows app** → **Run workflow** button → click **Run workflow**.

After ~10 min, go to the workflow run page, scroll down to **Artifacts** section, download `checklist-revision-windows.zip`. Unzip to get the `.exe`.

This doesn't create a public release — useful for testing.

## Distributing the `.exe`

Share the Releases page URL (looks like `https://github.com/YOU/YOUR-REPO/releases`). Users click the download link, run the `.exe`, app installs.

**First time users will see a Windows SmartScreen warning** (blue box). They click "More info" → "Run anyway". This is normal for any `.exe` that isn't code-signed. Signing costs ~$200-400/year, not worth it until you have many users.

## Data on the user's machine

Once installed, each user's data lives in their own local storage. Nothing is shared between users, nothing goes to a cloud.

To move data between machines, users use the app's **EXPORT JSON** / **IMPORT JSON** buttons.
