# Deploy Betynz v5.0.2 on one Render service

1. Extract the ZIP.
2. In the GitHub repository, keep only the hidden `.git` folder and remove the previous project files.
3. Copy the contents of `betynz-api-football-only-v5.0.2` into the repository root.
4. Commit and push to GitHub.
5. Confirm Render has the private `API_FOOTBALL_KEY` value.
6. In Render choose **Manual Deploy → Clear build cache & deploy**.
7. Open `/api/health` and confirm version `5.0.2` and provider `API_FOOTBALL`.
8. Open Market Route, PPG Route, Convergence and Consensus. They may show progress briefly but must not remain permanently on `Loading…`.
9. Hard-refresh the browser with `Ctrl + Shift + R`.

No new Supabase migration is required. The repository contains one root `render.yaml` and one web service.
