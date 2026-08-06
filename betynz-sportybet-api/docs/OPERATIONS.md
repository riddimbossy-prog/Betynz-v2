# Operations and safeguards

- Server-to-server only: keep the private key out of browser JavaScript.
- SportyBet-only allowlist: upstream hosts must be `sportybet.com` or a subdomain.
- No account cookies, login automation, CAPTCHA bypass or private customer data.
- Cache upcoming/live data briefly and results longer.
- Rate-limit public callers and restrict CORS to Betynz domains.
- Missing fields stay null; the parser does not invent odds, scores or markets.
- SRL filtering is applied in Betynz Web before engine analysis.

The API exposes diagnostics without exposing secrets or raw authentication values.
