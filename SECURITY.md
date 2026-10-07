# Security

Social Studio is a local, single-owner tool, not a public multi-tenant service. Use the latest `main` code; historical versions do not receive separate security backports.

## Report vulnerabilities privately

Use [GitHub private vulnerability reporting](https://github.com/TemelGunaydin/SocialStudio/security/advisories/new). If it is unavailable, open an issue asking for a private contact **without including exploit details or credentials**.

Include the affected version/commit, operating system, impact and reproduction steps using dummy credentials. Never attach `.env`, databases, OAuth tokens, raw server logs or a first-run URL containing `#setup=…`. There is no guaranteed response-time SLA.

## Security boundaries

- The default server listens only on `127.0.0.1`. First-owner setup requires the local, single-use setup link. Keep it private.
- Authentication and same-origin checks protect configuration and publishing. Publishing always requires an explicit owner action.
- New owner passwords are salted scrypt hashes. API keys and X OAuth tokens are **not encrypted at rest**: protect your OS account, enable disk encryption and restrict backups. Legacy `.env` passwords remain compatible and may be plaintext.
- New installations disable scheduled paid generation until the owner enables it. Keys are saved locally; saving is not a live credential test.
- URL import accepts public HTTPS HTML pages, checks DNS/redirect destinations and bounds the response. Imported text remains untrusted; source quotes do not prove an AI claim is true. Review all claims before saving or publishing.
- OpenAI receives page text for requested imports and project data for requested generation. X receives approved posts/media and OAuth/account requests. Review each provider's terms and privacy policy.
- The app does not enforce a monetary spending cap. Configure provider-side limits and review billing yourself.

Do not expose this server to the public internet, disable TLS validation, use shared API keys, or grant broader X scopes to work around an error. Tailscale access is for trusted devices only, not a substitute for multi-user isolation.

## macOS distribution

Local packages are ad-hoc signed, **not Developer ID signed or Apple notarized**. This repository currently publishes source code only. Do not disable Gatekeeper globally. Official downloadable consumer packages require a separate signing/notarization release process.

If a secret was committed or shared, revoke/rotate it at the provider first. Deleting a file from the latest commit does not remove it from Git history.
