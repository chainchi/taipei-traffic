# Workflow notes

## Multi-session git/deploy coordination

This project is also actively edited by the same Claude Code agent running on
the user's PC, sometimes driven remotely from their phone. That session
commits to git but does not always deploy.

Before starting any work on this project:

1. Run `git fetch && git status && git log --oneline -5` (and compare against
   `origin/main`) to check for commits made by the other session since you
   last worked here.
2. If there are committed-but-undeployed changes, deploy them first to
   establish a clean baseline before layering on new work — tell the user
   you're doing this rather than doing it silently. To check whether a commit
   is actually live, compare the local file against the deployed site (e.g.
   `curl https://taipei-traffic-flood.pages.dev/ | grep <marker text>`).
3. Exception: if a commit looks obviously incomplete (e.g. a "wip"-style
   message), ask the user before deploying it live rather than assuming it's
   ready.

Git commits and the Cloudflare deployment are **not linked** — there is no CI
auto-deploy on push (a GitHub Actions workflow for this was tried once and
then reverted — see commit history around Aug 11 2026). Deploying is always a
manual step:

```bash
cd cloudflare-deploy
npx wrangler pages deploy public --project-name=taipei-traffic-flood --branch=main --commit-dirty=true
```
