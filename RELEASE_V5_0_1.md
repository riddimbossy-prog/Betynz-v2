# Betynz v5.0.2 — clean provider reset build fix

## Fixed

- Adds a root pre-build cleanup step that removes every retired app directory except `apps/web`.
- Automatically removes a leftover a retired provider app directory folder before Render runs the engine tests.
- Removes known unified-provider launcher and smoke-test files from earlier releases.
- Keeps API-Football as the sole football provider.
- Bumps the application and PWA cache to v5.0.2.

## Why the previous deployment failed

Copying the v5.0.0 files over an existing Git repository did not delete the old a retired provider app directory directory. The API-Football-only reset test correctly rejected the mixed repository. v5.0.2 cleans the repository automatically during `npm run build`.
