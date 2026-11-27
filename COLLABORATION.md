# Parallel Development & Git Rules (For Both Antigravity Agents)

This repository is developed in parallel by two collaborators using separate Antigravity instances. Follow these rules strictly to prevent code overwrites and merge conflicts:

## 1. Never Work or Push Directly on `main`
- Always create a feature branch off the latest `main` before editing any code:
  ```bash
  git checkout main
  git pull origin main
  git checkout -b feat/<your-feature-name>
  ```
- **Never run `git push --force` on `main`.**

## 2. Isolate Changes by Module
- Put new features in dedicated files under `src/` (for example, `src/zombieManager.ts`, `src/weather.ts`, `src/shop.ts`).
- Keep edits to shared entry files (`src/main.ts`, `src/player.ts`, `index.html`) minimal—only add small hooks or imports.

## 3. Sync & Build Before Pushing
- Before pushing your branch, sync with `main` and verify the TypeScript/Vite build passes:
  ```bash
  git fetch origin
  git merge origin/main
  npm run build
  ```
- Resolve any merge conflicts locally on your feature branch before pushing.

## 4. Merge via GitHub Pull Requests
- Push your feature branch:
  ```bash
  git push -u origin feat/<your-feature-name>
  ```
- Open a Pull Request into `main` on GitHub so changes can be reviewed and merged cleanly.
