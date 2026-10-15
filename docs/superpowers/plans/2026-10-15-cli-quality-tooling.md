# CLI Quality Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add ShellCheck, Hurl, Lighthouse, and Trivy as isolated quality checks without making `npm run check` network-dependent.

**Architecture:** Complex workflow shell moves into versioned `.github/scripts/*.sh` files. Deterministic checks run on pull requests and pushes; public Hurl/Lighthouse checks run after successful publication, daily, or manually. Readwise plans, generated data, and publish semantics remain unchanged.

**Tech Stack:** Bash, ShellCheck, Hurl, Lighthouse CLI, Trivy, Node 24, GitHub Actions, existing TypeScript/Node test runner.

## Global Constraints

- Keep `npm run check` unchanged and network-free.
- Never put Readwise, Resend, or GitHub tokens in Hurl fixtures or reports.
- Trivy excludes `.git`, `.tmp`, `.worktrees`, `node_modules`, and `dist`.
- Lighthouse is report-only initially; Hurl and Trivy are hard checks.
- Do not modify generated browser data, Readwise tags, plans, journals, or secrets.
- Pin external tool versions in `.github/quality/tool-versions.env`; do not use `latest` in CI.

## Tasks

### Task 1: Extract maintainable workflow shell

**Files:** `.github/scripts/*.sh`, `.github/workflows/*.yml`, `test/remote-maintenance.test.ts`

- Add scripts for parent-context resolution, maintenance-run context writing, git push/rebase retries, and the priority maintenance retry loop.
- Use explicit arguments/environment variables and fail on missing inputs.
- Replace only complex/repeated inline blocks; preserve workflow order, artifacts, permissions, retries, and `workflow_run` chain behavior.
- Add `npm run quality:shell` to run ShellCheck on `.github/scripts/*.sh`.
- Verify with the existing remote-maintenance tests and ShellCheck.

### Task 2: Add deterministic local Hurl smoke tests

**Files:** `quality/hurl/site.hurl`, `.github/scripts/run-local-hurl.sh`, `package.json`

- Assert HTTP 200 and expected content for the root, manifest, service worker, `data/data.js`, `data/score.js`, and the frontend entry.
- Start a loopback static server after compilation, run Hurl with `base_url=http://127.0.0.1:4173`, and always terminate the server.
- Expose `npm run quality:hurl:local`.

### Task 3: Add PR/push quality workflow

**Files:** `.github/workflows/quality.yml`, `.github/quality/tool-versions.env`, `.trivyignore`

- Trigger on pull requests and pushes to `main` for source, workflow, package, site, PWA, and `quality/**` changes.
- Run `npm ci`, `npm run check`, ShellCheck, local Hurl smoke tests, and Trivy filesystem scanning.
- Run Trivy with `vuln,misconfig,secret`, `HIGH,CRITICAL`, and exit code 1; add only verified exceptions to `.trivyignore`.

### Task 4: Add public site quality workflow

**Files:** `.github/workflows/site-quality.yml`, `quality/hurl/site.hurl`

- Trigger daily, manually, and after successful `Refresh Readwise data` runs.
- Test `https://timoerlemans.github.io/top-articles/` with Hurl.
- Run Lighthouse for performance, accessibility, best-practices, and PWA; upload JSON/HTML artifacts for 14 days without score gating.

### Task 5: Document and verify

**Files:** `README.md`, `AGENTS.md`

- Document local commands, required tools, workflow separation, secret restrictions, Trivy exclusions, and report-only Lighthouse behavior.
- Run `npm run check`, `npm run quality:shell`, `npm run quality:hurl:local`, workflow YAML parsing, and focused workflow tests.
- Confirm no generated data/config/readwise files changed.
