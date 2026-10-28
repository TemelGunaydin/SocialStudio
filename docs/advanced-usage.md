# Advanced setup and previous workflows

[Back to the main README](../README.md) · [Türkçe başlangıç rehberi](quick-start-tr.md)

This page covers developer connections, Mac packaging, backups, phone access, and the previous X/LinkedIn/TikTok tools. For your first post, start with the [main README](../README.md#make-your-first-post).

## Developer API setup and provider limits

Use the dashboard’s three-step connection guide or the [complete Turkish setup guide](platform-setup-tr.md) for exact OAuth steps, multiple YouTube channels, and public HTTPS media delivery.

- **X:** OAuth 2.0 client with read/write, `media.write`, and offline access. Copy the displayed `/api/x/callback` URL to X Console. Each account uses its own token, including refresh. [X setup guide](x-setup.md).
- **YouTube:** Enable YouTube Data API v3 in Google Cloud and create a Web OAuth client. Register the callback shown in settings. Authorization requests upload and channel-read scopes. The app uploads via the [resumable upload protocol](https://developers.google.com/youtube/data/guides/using_resumable_upload_protocol), preserving the reviewed title, description, visibility, children-content setting, and synthetic-content declaration. Uploads from unverified API projects may be restricted to private visibility; uploading does not guarantee immediate processing/public availability.
- **Instagram:** Instagram API with Instagram Login uses `instagram_business_basic` and `instagram_business_content_publish`. Each Business/Creator account has a separate long-lived token, refreshed on use during its final seven days. Expired tokens require reconnecting. JPEG posts and MP4 Reels use container creation, bounded processing checks, and an explicit publish request. Temporary signed media URLs expire after one hour. Accounts outside app roles may require App Review / Advanced Access.
- **TikTok:** Enable Login Kit and Content Posting API and obtain `video.publish` approval. Register the displayed HTTPS callback URL. Current creator privacy options, video duration, interactions, music consent, and commercial/AI disclosures are checked before direct video publication. Single-photo Direct Post uses JPEG/WebP, a signed public HTTPS URL, and a TikTok-verified domain or URL prefix; photos also require creator privacy and consent. [TikTok's guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines) restrict unaudited clients to private posting and state that private utilities for accounts you or your team manage are not an acceptable intended use for approval. This integration cannot guarantee approval or public publishing for this local-only app. Manual sharing remains available in the previous-draft tools.

OAuth connection, copying text, selecting media, and saving a draft do not publish. Local/provider tests use mocked network responses and isolated local profiles. No live paid AI generation or social publication is performed by the test suite.

## Mac: launch with a double-click

There is no signed, notarized public Mac download yet. The following instructions apply after building the app locally.

Open `dist/Social Studio.app` after building it locally with `npm run package:mac`. The app bundles Node, so running the finished package does not require a terminal or a separate Node installation. It requires macOS 13 or later; the Apple Silicon package has been verified locally. The dashboard opens in your default browser:

1. **Choose a dashboard password.** Save it in your password manager. Newly created passwords are stored as salted hashes, not plaintext.
2. **Paste your OpenAI API key in API and models.** The settings page links directly to key creation. Key fields are masked, and saved keys are never sent back to the browser. Saving only updates local configuration - it does not make an API request or validate the key. You can start with manual drafts without OpenAI.
3. **Write your context in Content studio.** Optionally add a project URL, review the suggested project information, and save it.
4. **Connect your own developer apps.** Save X, YouTube, TikTok, or Instagram client credentials in settings, copy the displayed callback URLs, and authorize your accounts from Social accounts. See the [detailed X setup guide](x-setup.md).
5. **Create your first drafts.** Choose target platforms/accounts and a model. Recurring publishing is **disabled by default** and requires explicit opt-in in Automatic flow. Previous daily X drafts remain a separate feature under Previous X drafts.

You can update your keys later through **API and models** without restarting. Leaving a field blank preserves its saved value. Changing X credentials disconnects the existing account and invalidates pending OAuth requests.

On macOS, credentials are stored in `~/Library/Application Support/Social Studio/.env`, with application data in the `data/` subdirectory. Back up this directory. Replacing the app bundle does not remove your data. Source updates do not update an existing app bundle; rebuild it to include the new code. Closing the launcher window leaves the server running; confirm **⌘Q** to stop it. If port 3000 is already in use, stop the other local server first.

**Distribution notice:** The current package is ad-hoc signed for local development. It is not Developer ID signed or notarized by Apple. Internet downloads may trigger Gatekeeper warnings. Signing and notarization must be completed before a frictionless public app release; do not disable Gatekeeper.

## Running from source (macOS / Linux / Windows)

Install [Node.js 22.13+](https://nodejs.org/) and run `npm start` from the project directory. On first launch, open the **complete setup URL** printed in your terminal, including its `#setup=…` fragment. This single-use local link protects the initial owner registration; do not share it. Visiting `http://localhost:3000` alone cannot register the first owner. Then configure **API and models** and **Social accounts** as described above.

The legacy `npm run setup` CLI flow remains available and does not overwrite an existing `.env` file.

Existing `.env` installations continue to work with their original administrator password and saved X connection. The Mac app uses a profile **separate from** the source directory's `.env` and `data/`; existing data is not automatically copied into the new profile. To keep using your existing source installation, run `npm start` in its project directory.

## Adding projects

After signing in, select **Add project** and enter your product's HTTPS URL, name, platform, and **features you have verified**, one per line.

Selecting **Get suggestions from URL** reads only the single public HTTPS HTML page you provide - not the entire website. The extracted text and final URL are sent to OpenAI using your API key to suggest product features; charges apply. This does not happen automatically when you paste a URL.

Review the suggested fields and source quotes, correct or remove inaccurate claims, and check the confirmation box before saving. Pages that require authentication or load their content through JavaScript may not be readable; you can fill in the fields manually instead. Connect your X account when you are ready to publish.

New installations start with an empty project list. Only legacy Build & Runs installations migrate the original six projects alongside their existing data. You can add multiple projects and rotate draft generation between them.

### Previous X drafts: daily generation

By default, `npm start` listens only on `127.0.0.1:3000`. When daily generation is enabled, it prepares a draft at the hour configured by `DRAFT_HOUR`, using the `Europe/Istanbul` time zone.

- New wizard and CLI installations set `SCHEDULE_ENABLED=false`.
- Legacy installations without this setting retain their existing automatic generation behavior.
- If the computer was off at the scheduled time, the app prepares that day's draft when it next starts after the scheduled hour.
- Failed daily generation is not retried automatically that day.
- No daily draft is generated without a project and an OpenAI API key.

In the previous X draft tools, creating a draft or image, selecting a video, connecting an account, and refreshing the page never publish a post. Each legacy publication requires a connected X account and explicit approval. The new multi-platform recurring flow is configured separately.

## Previous X drafts: attach a promotional video

In an editable X draft, select **Choose video** (`Video seç`) and pick an MP4 from your computer, for example from your promotional video folder. One image **or** one video can be attached at a time; **No media** (`Medyasız`) removes the attachment from the post.

- The app accepts MP4 files up to **100 MB** as a local application limit, not a statement of X's maximum. H.264 video with AAC audio is recommended. Basic MP4 container validation is local; X performs final codec, duration, and account-entitlement checks. Videos are not transcoded automatically.
- Selecting a file copies it to the active profile's private `data/videos/` directory and attaches that copy to the draft. The original is never moved or modified. The preview remains available after restarting the app; authenticated range requests support playback/seeking. Keep enough local disk space; replaced copies are not automatically purged.
- Review the text and video in the X preview. **Only Approve and publish** starts X's initialize → chunked upload → finalize → processing checks → post creation workflow. Uploading media and polling X can incur charges not included in the publishing-cost estimate.
- A processing failure or timeout creates no post. Retrying requires another explicit approval. A lost or ambiguous post response is marked uncertain rather than retried automatically; check X before posting again.
- Existing OAuth connections already request `media.write`. If X reports missing permissions, disconnect and authorize again. A connected account alone does not guarantee paid API access or successful video publication.

Video upload/publication is verified with mocked X responses, not a live paid publication. Official protocol: [X chunked media upload](https://docs.x.com/x-api/media/quickstart/media-upload-chunked).

## Previous drafts: LinkedIn manual sharing

Open any existing draft (including one already published to X) and select **LinkedIn draft** (`LinkedIn taslağı`). No LinkedIn developer app, API credentials, or account connection is needed.

1. The initial text is copied from the saved X draft with its product link. Edit it for LinkedIn; the editor allows up to 3,000 characters including links (counted conservatively as UTF-16 units).
2. Optionally select **Rewrite for LinkedIn** (`LinkedIn için yeniden yaz`). This explicitly sends the saved X copy and project details to OpenAI to propose a longer English post. Charges apply; nothing is generated automatically. Check the claims before saving. Opening, manually editing, saving, and copying do not call an AI or social publishing API.
3. Optionally select an MP4 from your computer to preview alongside the text. The video stays in your browser: it is not uploaded or copied to the server. Only its filename is saved as a reminder; reselect the file to preview it after reopening the editor.
4. **Save draft** keeps the LinkedIn text and video filename separately in the local database. It never changes the X text, media, approval, or publication status. Conflicting saves from another tab are rejected rather than silently overwriting text.
5. **Copy text**, then **Open LinkedIn**. Start a post, paste the text, and attach the original video yourself. If browser clipboard access is blocked (for example, on plain-HTTP Tailscale), the editor selects the text for manual copying.

Copying or opening LinkedIn does not publish anything, and Social Studio does not mark the draft as published or include it in X spending estimates. There is no LinkedIn scheduling, browser automation, or automatic upload. Unlike X attachments, LinkedIn videos are not copied into the local server's data directory.

## Previous drafts: TikTok manual sharing

Select **TikTok draft** (`TikTok taslağı`) from an existing draft. No TikTok developer account, API credentials, or account connection is required.

1. Edit the starting X text into a caption, or explicitly request an English TikTok caption with a few relevant hashtags using OpenAI (charges apply). Generated text uses saved project facts and does not analyze the video.
2. Choose an MP4 to preview locally in your browser. Vertical 9:16 is recommended; the app does not crop or re-encode the video. Nothing is uploaded to TikTok or the local server; only a filename reminder is saved, so reselect the file to preview it after reopening.
3. Save the caption separately from X and LinkedIn, then **Copy text** and **Open TikTok**. In TikTok's upload screen, select the original video, paste your caption, review privacy, music rights, and any required promotional/AI disclosures, and publish yourself. The panel uses a conservative 2,200-character caption limit including links; caption URLs may not be clickable.

Opening the editor, choosing a video, saving, and copying never publish or make paid requests. Only explicit AI rewriting calls OpenAI. This legacy manual-handoff workflow does not use the TikTok Content Posting API or track publications. Direct video publication is available in the new Content studio when permitted by TikTok. TikTok handoffs are not counted as X publications or spending.

## Costs and privacy

- **Each user creates and manages their own OpenAI and X accounts, credits, and limits.** Link posts, media uploads, API reads, and OpenAI requests may incur charges. Check [current X pricing](https://docs.x.com/x-api/getting-started/pricing) and [OpenAI pricing](https://openai.com/api/pricing/) before use. Configure spending limits in X Console where available.
- The balance card in Previous X drafts shows the current legacy X connection's actual remaining credit. Daily and monthly publishing costs are **estimates** based only on successful link posts published through the previous X draft tools; new multi-platform posts are excluded from this legacy estimate. Media uploads, OpenAI usage, other X applications, and failed requests are excluded. Check the provider dashboards for actual billing.
- `.env`, `data/`, and OAuth tokens are excluded from Git. Application data is stored in SQLite. Stop the app and back up your complete profile, including `.env` and `data/`; copying only the database does not preserve API credentials or media. Session cookies are signed. Keep passwords and API keys private. The app is designed for a single owner and a single server process - not a public, multi-user SaaS deployment.
- If the server stops during publishing, the draft is marked as uncertain to prevent accidental duplicate posts. Check your X account before attempting another publication.

## iPhone access with Tailscale (optional)

Your Mac and iPhone must be on the same Tailscale network. Find the Mac's address with `tailscale ip -4`, then set these values in `.env`:

```dotenv
HOST=MAC_TAILSCALE_IP
PUBLIC_BASE_URL=http://MAC_TAILSCALE_IP:3000
```

Replace `MAC_TAILSCALE_IP` with the actual address. Restart the server and open that same URL on both devices. If you reconnect your X account, add the new `PUBLIC_BASE_URL` followed by `/api/x/callback` to the callback list in X Console.

Alternatively, use [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) to expose the local server over HTTPS. Keep `HOST=127.0.0.1` and set `PUBLIC_BASE_URL` to the Serve URL.

Tailscale Serve is private to your tailnet and cannot deliver media to Instagram or TikTok. For those features use a public HTTPS reverse proxy as described in the [API guide](platform-setup-tr.md); the dashboard remains a single-owner tool without tenant isolation.

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

Social Studio is available under the [MIT license](../LICENSE), and contributions are welcome. The bundled Node runtime retains its own license and third-party notices. Product names, logos, and X/OpenAI services remain subject to their respective rights and provider terms; the MIT license does not grant API access or credits.

Run `npm test` for local tests. Tests do not make real provider API requests or publish posts. CI checks Linux/macOS tests and Mac package builds; it does not create releases or make paid API calls. See the [contribution guide](../CONTRIBUTING.md) and [private security reporting instructions](../SECURITY.md).

### Upgrading an existing installation

Before upgrading, stop the app and back up the complete profile: `.env` and `data/`. For a Mac app installation, this is `~/Library/Application Support/Social Studio/`. A database-only backup does not include credentials and media. On first launch, the migration copies existing project IDs into the new `projects` table while preserving drafts and the X connection.

The new studio adds `social_accounts`, `media_library`, and `social_posts` tables. LinkedIn and TikTok manual drafts use separate, additive `linkedin_drafts` and `tiktok_drafts` tables. Existing X drafts, media, projects, settings, and tokens are not rewritten. X video attachments reuse the draft's existing media fields. Reopening the database is idempotent.

To roll back, stop Social Studio and return to the previous code version. New studio campaigns and automation are not available in older code. Archiving moves the source video into `paylasildi/`; returning to older code does not reverse that file move. Restore your backup if you also need the original file layout. Older code ignores the additional tables but can still read legacy drafts and tokens; saved manual-platform drafts remain available when you upgrade again. Before using code without video support, set video-bearing X drafts to **No media** in the current app; old code cannot publish `video` attachments. Do not use newly added projects with code predating project support.
