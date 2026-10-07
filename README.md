# Social Studio

[![CI](https://github.com/TemelGunaydin/SocialStudio/actions/workflows/ci.yml/badge.svg)](https://github.com/TemelGunaydin/SocialStudio/actions/workflows/ci.yml) · [MIT](LICENSE) · [X setup guide](docs/x-setup.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

A local-first X marketing studio with guided setup and human-approved publishing. Bring your own OpenAI and X API accounts; provider charges apply.

Define your projects, prepare English post drafts, and review the copy and images before publishing. **Nothing is posted to X until you explicitly approve it.** Social Studio runs on your computer for a single owner, using your own API accounts rather than a shared service.

> **Language:** This README is in English. The current application UI and detailed X setup guide are in Turkish. UI labels below are translated for reference.

## Quick start

Install [Node.js 22.13+](https://nodejs.org/), then run:

```sh
git clone https://github.com/TemelGunaydin/SocialStudio.git
cd SocialStudio
npm start
```

Open the **complete setup URL** printed in your terminal and choose a password. Add your API credentials through **Setup and connections** in the dashboard—no manual configuration file editing is required. There are no third-party npm dependencies, so you do not need to run `npm install`.

**Release status:** The source code is available under the MIT license. A Developer ID-signed and Apple-notarized Mac download is not yet available. The `dist/` directory is not included in the repository; the Mac workflow below becomes available after you [build the package locally](#building-the-mac-package-developers).

## Mac: launch with a double-click

Open `dist/Social Studio.app` after building it locally with `npm run package:mac`. The app bundles Node, so running the finished package does not require a terminal or a separate Node installation. It requires macOS 13 or later; the Apple Silicon package has been verified locally. The dashboard opens in your default browser:

1. **Choose a dashboard password.** Save it in your password manager. Newly created passwords are stored as salted hashes, not plaintext.
2. **Paste your OpenAI API key.** The wizard links directly to the key creation page. Key fields are masked, and saved keys are never sent back to the browser. Saving only updates local configuration—it does not make an API request or validate the key. You can start with manual drafts without OpenAI.
3. **Add your project URL.** Review the suggested project information and save it.
4. **Connect your own X app.** Follow the in-app Developer Console guide, copy the callback URL, and save your OAuth 2.0 Client ID and Client Secret. No shared X app or remote server is involved. See the [detailed X setup guide](docs/x-setup.md).
5. **Create your first draft.** Paid daily generation is **disabled by default** on new installations. You can enable it in the final setup step. Publishing always requires separate approval.

You can update your keys later through **Setup and connections** without restarting. Leaving a field blank preserves its saved value. Changing X credentials disconnects the existing account and invalidates pending OAuth requests.

On macOS, credentials are stored in `~/Library/Application Support/Social Studio/.env`, with application data in the `data/` subdirectory. Back up this directory. Replacing the app bundle does not remove your data. Closing the launcher window leaves the server running; confirm **⌘Q** to stop it. If port 3000 is already in use, stop the other local server first.

**Distribution notice:** The current package is ad-hoc signed for local development. It is not Developer ID signed or notarized by Apple. Internet downloads may trigger Gatekeeper warnings. Signing and notarization must be completed before a frictionless public app release; do not disable Gatekeeper.

## Running from source (macOS / Linux / Windows)

Install [Node.js 22.13+](https://nodejs.org/) and run `npm start` from the project directory. On first launch, open the **complete setup URL** printed in your terminal, including its `#setup=…` fragment. This single-use local link protects the initial owner registration; do not share it. Visiting `http://localhost:3000` alone cannot register the first owner. Then follow the setup wizard above.

The legacy `npm run setup` CLI flow remains available and does not overwrite an existing `.env` file.

Existing `.env` installations continue to work with their original administrator password and saved X connection. The Mac app uses a profile **separate from** the source directory's `.env` and `data/`; existing data is not automatically copied into the new profile. To keep using your existing source installation, run `npm start` in its project directory.

## Adding projects

After signing in, select **Add project** and enter your product's HTTPS URL, name, platform, and **features you have verified**, one per line.

Selecting **Get suggestions from URL** reads only the single public HTTPS HTML page you provide—not the entire website. The extracted text and final URL are sent to OpenAI using your API key to suggest product features; charges apply. This does not happen automatically when you paste a URL.

Review the suggested fields and source quotes, correct or remove inaccurate claims, and check the confirmation box before saving. Pages that require authentication or load their content through JavaScript may not be readable; you can fill in the fields manually instead. Connect your X account when you are ready to publish.

New installations start with an empty project list. Only legacy Build & Runs installations migrate the original six projects alongside their existing data. You can add multiple projects and rotate draft generation between them.

### Daily drafts

By default, `npm start` listens only on `127.0.0.1:3000`. When daily generation is enabled, it prepares a draft at the hour configured by `DRAFT_HOUR`, using the `Europe/Istanbul` time zone.

- New wizard and CLI installations set `SCHEDULE_ENABLED=false`.
- Legacy installations without this setting retain their existing automatic generation behavior.
- If the computer was off at the scheduled time, the app prepares that day's draft when it next starts after the scheduled hour.
- Failed daily generation is not retried automatically that day.
- No daily draft is generated without a project and an OpenAI API key.

Creating a draft or image, connecting an account, and refreshing the page **never publish a post**. Publishing requires a connected X account and explicit approval in the dashboard.

## Costs and privacy

- **Each user creates and manages their own OpenAI and X accounts, credits, and limits.** Link posts, media uploads, API reads, and OpenAI requests may incur charges. Check [current X pricing](https://docs.x.com/x-api/getting-started/pricing) and [OpenAI pricing](https://openai.com/api/pricing/) before use. Configure spending limits in X Console where available.
- The balance card shows the X developer account's actual remaining credit. Daily and monthly publishing costs are **estimates** based only on successful link posts published through this dashboard. Media uploads, OpenAI usage, other X applications, and failed requests are excluded. Check the provider dashboards for actual billing.
- `.env`, `data/`, and OAuth tokens are excluded from Git. Application data is stored in SQLite; back up your local data directory. Session cookies are signed. Keep passwords and API keys private. The app is designed for a single owner and a single server process—not a public, multi-user SaaS deployment.
- If the server stops during publishing, the draft is marked as uncertain to prevent accidental duplicate posts. Check your X account before attempting another publication.

## iPhone access with Tailscale (optional)

Your Mac and iPhone must be on the same Tailscale network. Find the Mac's address with `tailscale ip -4`, then set these values in `.env`:

```dotenv
HOST=MAC_TAILSCALE_IP
PUBLIC_BASE_URL=http://MAC_TAILSCALE_IP:3000
```

Replace `MAC_TAILSCALE_IP` with the actual address. Restart the server and open that same URL on both devices. If you reconnect your X account, add the new `PUBLIC_BASE_URL` followed by `/api/x/callback` to the callback list in X Console.

Alternatively, use [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) to expose the local server over HTTPS. Keep `HOST=127.0.0.1` and set `PUBLIC_BASE_URL` to the Serve URL.

Do not expose the dashboard to the public internet. It does not provide separate user accounts or tenant isolation.

## Building the Mac package (developers)

Install Xcode Command Line Tools on your Mac, then run:

```sh
npm run package:mac
```

The build script downloads the official Node **v22.23.3** runtime from nodejs.org, checks it against the SHA-256 manifest, compiles the AppKit launcher, and creates `dist/Social Studio.app` and an architecture-specific ZIP such as `dist/Social-Studio-mac-arm64.zip`. It does not copy a Homebrew-linked Node binary.

For an Intel target:

```sh
ARCH=x86_64 npm run package:mac
```

Full interactive runtime verification on an Intel Mac has not been completed.

The package includes only `server/`, `public/`, `package.json`, `LICENSE`, and the Node runtime with its license. It does not include `.env`, databases, or tokens. Both `dist/` and `.cache/` are excluded from Git. Keep the bundled Node version updated for security fixes.

## Development and license

Social Studio is available under the [MIT license](LICENSE), and contributions are welcome. The bundled Node runtime retains its own license and third-party notices. Product names, logos, and X/OpenAI services remain subject to their respective rights and provider terms; the MIT license does not grant API access or credits.

Run `npm test` for local tests. Tests do not make real provider API requests or publish posts. CI checks Linux/macOS tests and Mac package builds; it does not create releases or make paid API calls. See the [contribution guide](CONTRIBUTING.md) and [private security reporting instructions](SECURITY.md).

### Upgrading an existing installation

Back up `data/studio.sqlite` before upgrading. On first launch, the migration copies existing project IDs into the new `projects` table while preserving drafts and the X connection.

To roll back, return to the previous code version. The older code ignores the new table but can still read legacy drafts and tokens. Do not use newly added projects with the old code.
