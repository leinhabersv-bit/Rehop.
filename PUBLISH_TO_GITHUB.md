# Publish this local Git repository to GitHub

The project is already a **local Git repository** with an initial commit. The connected GitHub integration available in ChatGPT can write to existing repositories but could not create the new remote itself.

You are signed into the GitHub account `leinhabersv-bit` in ChatGPT. Create a new **empty** repository named `riderescue` under whichever GitHub account should own the project.

## Option A — browser (no GitHub CLI required)

1. Open https://github.com/new.
2. Set **Repository name:** `riderescue`.
3. Choose **Public** for hackathon submissions (or Private initially if your team prefers; change visibility before submission).
4. **Do not** select "Add a README" or "Add .gitignore"; both are already in the local repository.
5. Click **Create repository**.
6. On your computer, extract the ZIP (which includes `.git`) and run:

```bash
cd riderescue
git remote add origin https://github.com/leinhabersv-bit/riderescue.git
git push -u origin main
```

If GitHub asks you to authenticate, use Git Credential Manager or a permitted personal access token; never paste a secret into a chat or commit it.

## Option B — GitHub CLI

If GitHub CLI (`gh`) is installed and authenticated on your own computer:

```bash
cd riderescue
gh repo create leinhabersv-bit/riderescue --public --source=. --remote=origin --push
```

## Invite your three teammates

On the published repo, open **Settings → Collaborators and teams** and invite them by their GitHub usernames. Do not share account passwords or write-access tokens.

## Recommended initial branches

```bash
git checkout -b feat/fe1-journey-setup
git checkout main
git checkout -b feat/fe2-live-tracking
git checkout main
git checkout -b feat/be1-provider-sim
git checkout main
git checkout -b feat/be2-risk-recovery
```

Developers should create branches from `main`, open small PRs, and keep contracts synced. Branch protection and required CI checks should be enabled once the repository is published and team permissions are configured.
