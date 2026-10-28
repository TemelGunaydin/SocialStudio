# Security

Social Studio is a local, single-owner tool, not a public multi-tenant service. Use the latest `main` code; historical versions do not receive separate security backports.

## Report vulnerabilities privately

Use [GitHub private vulnerability reporting](https://github.com/TemelGunaydin/SocialStudio/security/advisories/new). If it is unavailable, open an issue asking for a private contact **without including exploit details or credentials**.

Include the affected version/commit, operating system, impact and reproduction steps using dummy credentials. Never attach `.env`, databases, OAuth tokens, raw server logs or a first-run URL containing `#setup=…`. There is no guaranteed response-time SLA.

## Security boundaries

- The default server listens only on `127.0.0.1`. First-owner setup requires the local, single-use setup link. Keep it private.
- Authentication and same-origin checks protect configuration and publishing. Immediate and scheduled posts require owner approval. Recurring X/YouTube/Instagram Reels posts can publish automatically after the owner explicitly enables that flow.
- New owner passwords are salted scrypt hashes. API keys and social-account OAuth tokens are **not encrypted at rest**: protect your OS account, enable disk encryption and restrict backups. Legacy `.env` passwords remain compatible and may be plaintext.
- New installations disable scheduled paid generation until the owner enables it. Keys are saved locally; saving is not a live credential test.
- URL import accepts public HTTPS HTML pages, checks DNS/redirect destinations and bounds the response. Imported text remains untrusted; source quotes do not prove an AI claim is true. Review all claims before saving or publishing.
- OpenAI receives page text for requested imports, context/project data for generation, and candidate filenames for AI media selection. Enabled recurring flows also send the data needed for their generation requests. X, YouTube, TikTok, and Instagram receive the selected posts/media and account authorization requests. Review each provider's terms and privacy policy.
- The app does not enforce a monetary spending cap. Configure provider-side limits and review billing yourself.

For Instagram and TikTok photos, a public HTTPS reverse proxy must reach the app. Keep the Node listener on loopback, retain owner authentication and same-origin checks, and complete first-owner setup locally before exposing the HTTPS address. The only media access without an owner session is `/api/social/delivery/<asset-id>` with a valid asset-scoped HMAC signature and a one-hour expiration. Treat these temporary URLs as bearer credentials; never log or share their query strings. Normal library/preview endpoints remain authenticated. Do not disable TLS validation or use shared API keys. Tailscale access is for trusted devices only and cannot deliver media to public provider servers.

## macOS distribution

Local packages are ad-hoc signed, **not Developer ID signed or Apple notarized**. This repository currently publishes source code only. Do not disable Gatekeeper globally. Official downloadable consumer packages require a separate signing/notarization release process.

If a secret was committed or shared, revoke/rotate it at the provider first. Deleting a file from the latest commit does not remove it from Git history.
