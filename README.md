# Social Studio

[![CI](https://github.com/TemelGunaydin/SocialStudio/actions/workflows/ci.yml/badge.svg)](https://github.com/TemelGunaydin/SocialStudio/actions/workflows/ci.yml) · [Türkçe rehber](docs/quick-start-tr.md) · [MIT license](LICENSE)

**Manage your social accounts, prepare posts, and publish from one place.**

Social Studio runs on your computer and opens in your browser. Write what you want to share, choose the accounts, add a video or image, and review your post. You can also let AI write the text or choose suitable media from your folder.

It is designed for one person managing their own accounts. You can connect more than one account on the same platform, such as a personal X account and a business X account.

> The app is currently in Turkish. This guide includes the exact button and page names you will see. A [Turkish getting-started guide](docs/quick-start-tr.md) is also available.

**Account setup:** [YouTube](#youtube-google-cloud-and-oauth) · [Instagram](#instagram-meta-developer-and-oauth) · [TikTok](#tiktok-developer-and-oauth) · [Türkçe adım adım kurulum](docs/platform-setup-tr.md)

## What can it do?

| Platform | What you can publish | Automatic publishing |
| --- | --- | --- |
| Twitter / X | Text, with one image or one video | Publish now, schedule a post, or enable recurring posts |
| YouTube | A video with a title, description, and optional custom thumbnail | Publish now, upload now for YouTube to publish later, or enable recurring posts |
| TikTok | A video or a single photo with a caption | Publish now or approve an individual scheduled post; no recurring flow |
| Instagram | A JPEG image post or an MP4 Reel | Publish now, schedule a post, or enable recurring Reels |
| LinkedIn | Prepare text and preview a video in the previous-draft tools | Copy the text and finish the upload on LinkedIn yourself |

You can also:

- Generate English text from your notes, audience, and preferred tone. You can write your notes in another language.
- Choose an OpenAI model, including Luna, and select a separate image model.
- Give AI an image/video folder to choose from, using filenames and your notes.
- Move successfully shared folder media into `paylasildi/` automatically.
- Keep separate drafts, media selections, and publication states for each account.

**You control publishing.** Creating a draft does not publish it. Recurring X/YouTube/Instagram Reels publishing starts only after you explicitly enable it.

## Start the app

Install [Node.js 22.13 or newer](https://nodejs.org/) and [Git](https://git-scm.com/downloads), then run these commands in a terminal:

```sh
git clone https://github.com/TemelGunaydin/SocialStudio.git
cd SocialStudio
npm start
```

No `npm install` is needed.

1. Open the **complete setup link** printed in the terminal. On the first run, it includes `#setup=...`; opening only `localhost:3000` is not enough to create your password.
2. Choose a password for your dashboard and save it somewhere safe.
3. Keep the terminal running while you use the app. Press **Ctrl+C** in that terminal to stop it. Run `npm start` to open it again.

You can prepare manual drafts before adding any API keys or connecting accounts.

**Mac users:** A ready-to-download Mac app is not available yet. Developers can [build a Mac app](docs/advanced-usage.md#building-the-mac-package-developers) that opens with a double-click.

## Connect AI and your social accounts

An **API connection** lets Social Studio communicate with another service with your permission. These connections use your own provider accounts and may require credits, billing setup, or approval.

1. Open **API ve modeller** (API and models). Add your OpenAI API key if you want AI features. Choose a text model and an image model. For example, you can select Luna for text and GPT Image Mini for images, if your API account has access.
2. Open **Sosyal hesaplar** and click **Bağlantıyı hazırla** for the platform. Its three-step guide links to the developer portal, provides a copyable redirect URL, and lets you save your app credentials and start OAuth.
3. Approve access on the provider page. Use **Başka hesap ekle** to add another account. For YouTube, select the Google account and channel each time; each channel keeps its own authorization.

You do not enter your social account passwords into Social Studio. You approve access on the provider's own page. Leaving a saved credential field blank keeps its current value.

The instructions below take you from creating a developer app to seeing your account in Social Studio. You configure one developer app per platform, then authorize each social account separately. For X, use the [X setup guide](docs/x-setup.md). The same instructions for YouTube, Instagram, and TikTok are available in [Turkish](docs/platform-setup-tr.md).

### Before you connect: addresses and permissions

- **OAuth** is the provider's permission screen: you sign in there and allow Social Studio to use your account.
- **Redirect URL / callback URL** is the address the provider sends you back to after approval. Copy it from **Sosyal hesaplar > platform > Bağlantıyı hazırla > Adresi kopyala**. If already configured, open **3 adımda kurulum rehberi** instead.
- **Client ID / Client key and Client secret** identify your developer app. Copy them into the matching fields in Social Studio. These are different from your social account password. The app obtains and renews account access tokens for you.
- **Scope** means a permission, such as uploading a video. Each platform section lists the exact permissions this app uses.

Always copy the address shown by your running panel. `localhost` and `127.0.0.1`, different ports, `http` and `https`, and an extra trailing slash are different addresses. The addresses below are examples, not values to paste unchanged.

### Set up HTTPS for Instagram and TikTok

YouTube can connect on `http://localhost:3000`. This project's Instagram and TikTok web connections use an HTTPS address. Instagram posts/Reels and TikTok photos also need that address to be reachable by the provider so it can download the selected media. An existing HTTPS address for this dashboard can be shared by all three platforms.

1. Finish the local first-run setup and choose your dashboard password.
2. Point a domain you control, such as `studio.example.com`, to the running app through an HTTPS reverse proxy or tunnel. This forwards requests from your public address to the local Node server. Use a valid HTTPS certificate. For TikTok photos, choose a domain you can verify with TikTok.
3. Stop the app. Open the active profile's `.env` file: in the project folder when running from source, or `~/Library/Application Support/Social Studio/.env` for the packaged Mac app. Change only the base address as shown below; keep `HOST=127.0.0.1` and your existing `PORT`.

   ```dotenv
   PUBLIC_BASE_URL=https://studio.example.com
   ```

4. Restart the app and sign in through that same HTTPS address. Changing `.env` alone does not create a domain, certificate, or tunnel. The proxy must preserve the public `Host` and allow the app's requests and uploads through.
5. Copy the new callback address from each platform's setup guide and update it in its developer portal. If you later change the domain, repeat this step for connected platforms.
6. Allow providers to reach `/api/social/delivery/` without an extra proxy login or browser challenge. The app protects each selected media file with a signed link that expires after one hour; normal dashboard pages still require your login.

For proxy timeouts, media requests, and private-network limitations, see the [HTTPS setup details](docs/platform-setup-tr.md#instagram-ve-tiktok-fotoğrafları-için-herkese-açık-https).

### YouTube: Google Cloud and OAuth

You need a Google account with a YouTube channel you can manage. One Google Cloud project and OAuth client can connect multiple accounts or channels.

1. **Create a project.** Open [Google Cloud Console](https://console.cloud.google.com/), use the project selector to create or select a project, and keep that project selected throughout setup. A name such as `Social Studio` is enough.
2. **Enable the YouTube API.** Open [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com) and click **Enable**.
3. **Prepare the permission screen.** Open **Google Auth Platform > Branding** and, if prompted, **Get Started**. Enter the app name, support email, and contact email. For personal Gmail accounts, choose **External** under **Audience**. While the app is in **Testing**, add every Google account you will use under **Audience > Test users > Add users**. [Google's consent-screen guide](https://developers.google.com/workspace/guides/configure-oauth-consent)
4. **Add the permissions.** In **Data Access > Add or Remove Scopes**, add and save the three scopes below. If searching does not find them, enter their full URLs manually.

   | Scope | Why Social Studio requests it |
   | --- | --- |
   | `https://www.googleapis.com/auth/youtube.readonly` | Find the channel you authorized and read its video state |
   | `https://www.googleapis.com/auth/youtube.upload` | Upload your selected video |
   | `https://www.googleapis.com/auth/youtube.force-ssl` | Edit an uploaded video's schedule or cancel that schedule; Google's permission also covers other video, comment, and caption actions |

5. **Create the OAuth client.** Open **Clients > Create client**, select **Web application**, and enter a name. In **Authorized redirect URIs**, paste the address copied from **Sosyal hesaplar > YouTube > Bağlantıyı hazırla**. A local example is `http://localhost:3000/api/social/oauth/youtube/callback`. Use the HTTPS version shown by your panel if you configured HTTPS. This server-side connection does not require an Authorized JavaScript origin.
6. **Copy the credentials.** Create the client and copy **Client ID** into Social Studio's **OAuth Client ID** field, and **Client secret** into **Client secret**. A Google API key or service-account JSON file does not replace these OAuth credentials. [Google's web OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server)
7. **Connect the channel.** Click **Kaydet ve hesabı bağla**. On Google's page, choose the account and, if offered, the YouTube/Brand channel. Review and grant all requested permissions. When you return, check that the intended channel appears under **Sosyal hesaplar**.
8. **Add more channels.** Click **YouTube > Başka hesap ekle** and repeat the sign-in for the next channel. Use the same client credentials. Reconnecting the same channel refreshes its authorization; it does not remove your other channels.

**Check the connection:** Open **İçerik stüdyosu**, choose that channel, select a short MP4, and review the title, description, and visibility. For an initial upload, choose private visibility. You can then use **Yayın zamanı > Tarih ve saat seç > YouTube’a yükle ve planla** for a public release at a future time; see [scheduling](#make-your-first-post) below.

**Testing versus Production:** With this app's permissions, Google's External/Testing refresh tokens expire after seven days. Reconnect when needed, or move the OAuth app to Production and complete any verification Google requires for your audience and permissions. Production does not guarantee permanent access. [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)

### Instagram: Meta Developer and OAuth

You need an Instagram **Business** or **Creator** professional account. Our integration uses **Instagram API with Instagram Login**. A Facebook Page is not required for this connection method.

1. **Prepare the Instagram account.** In Instagram settings, find the account type/professional account controls and switch to **Business** or **Creator** if needed. Repeat for each account you want to connect.
2. **Create a Meta app.** Open [Meta for Developers](https://developers.facebook.com/apps/) and choose **Create App**. Complete the app name and contact information. Select the Instagram API use case/product that provides **Instagram API with Instagram Login**. If the wizard asks for an app type, choose the type supporting that product, commonly **Business**. Meta's menu names can vary by app configuration.
3. **Add your test accounts.** While developing, add the Instagram account through the app's Instagram test-account or **App roles / Instagram Tester** controls. Sign into that Instagram account and accept any tester invitation in its app/website permission settings. Adding an invitation without accepting it may leave the account unable to authorize.
4. **Configure the return address.** In the Instagram product's **API setup / Business login** settings, add the exact HTTPS callback from **Sosyal hesaplar > Instagram > Bağlantıyı hazırla**. Example: `https://studio.example.com/api/social/oauth/instagram/callback`. Complete any requested website, privacy-policy, or data-deletion details with real information for your app.
5. **Check the permissions.** This app uses `instagram_business_basic` and `instagram_business_content_publish`. They cover the professional account connection and content publishing. Use the Instagram Login product, whose permissions match these names. [Meta's official Instagram API collection](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login)
6. **Copy the Instagram credentials.** From the Instagram product setup, copy **Instagram App ID** and **Instagram App Secret** into the same-named fields in Social Studio. Do not substitute credentials from a different Facebook Login setup. Click **Kaydet ve hesabı bağla**.
7. **Authorize the account.** Sign in on Instagram, grant the requested permissions, and check the account name when you return to **Sosyal hesaplar**. For another professional account, click **Instagram > Başka hesap ekle** and repeat. Each account has its own stored authorization.

**Check publishing:** In **İçerik stüdyosu**, choose the Instagram account and **Gönderi** for a JPEG image or **Reels** for an MP4 video. Select a file through **Klasörden / kütüphaneden seç**, review the caption, and publish only when ready. Both formats require the [HTTPS media delivery](#set-up-https-for-instagram-and-tiktok) configured above. Instagram downloads and processes the file before publishing it.

**Beyond your test accounts:** Connecting accounts outside the app's assigned roles can require **App Review / Advanced Access** and any business verification Meta requests. Complete the requirements shown in your app dashboard. [Meta's Instagram Login guide](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)

### TikTok: Developer and OAuth

**Read this before applying for public posting:** TikTok's Direct Post rules exclude tools intended only to upload to accounts you or your team manages. Social Studio is a personal dashboard, so connecting an account or passing a private test does not guarantee approval for public API posting. [TikTok's intended-use rules](https://developers.tiktok.com/docs/en/content-sharing-guidelines)

1. **Create a developer app.** Sign into [TikTok for Developers](https://developers.tiktok.com/apps/), open **Manage apps > Connect an app**, and fill in the app details. Select **Web** for this project's current OAuth flow, even if Social Studio runs on your Mac. Enter your real HTTPS website address. [TikTok app registration](https://developers.tiktok.com/docs/en/getting-started-create-an-app)
2. **Start with a Sandbox.** Switch the app to **Sandbox > Create Sandbox**. Under **Sandbox settings > Target users > Add account**, sign into each TikTok account you want to test. Up to 10 target accounts can be added; appearing in the list can take up to an hour. These are test accounts, not public-posting approval. [Sandbox guide](https://developers.tiktok.com/docs/en/add-a-sandbox)
3. **Enable login and publishing.** Under **Products > Add products**, add **Login Kit** and **Content Posting API**. Enable its **Direct Post** configuration. Configure `user.info.basic` for the account identity and `video.publish` for publishing. The app and the authorizing user must both have the required publishing permission. [Direct Post setup](https://developers.tiktok.com/docs/en/content-posting-api-get-started)
4. **Register the callback.** In **Login Kit > Web**, add the exact address from **Sosyal hesaplar > TikTok > Bağlantıyı hazırla**. Example: `https://studio.example.com/api/social/oauth/tiktok/callback`. TikTok Web requires HTTPS and a static callback without query parameters or a `#` fragment. Save with **Apply changes** in Sandbox. [Web OAuth guide](https://developers.tiktok.com/docs/en/login-kit-web)
5. **Connect from Social Studio.** Copy **Client key** and **Client secret** from the relevant environment's **Credentials** section into the matching panel fields. Click **Kaydet ve hesabı bağla**, sign into the intended TikTok account, and grant both requested permissions. The account should appear in **Sosyal hesaplar**.
6. **Add another account.** Click **TikTok > Başka hesap ekle**. Use the same developer app and authorize the second account. If TikTok automatically selects the first account, switch your TikTok browser session to the second one before starting again. In Sandbox, add it to **Target users** first.
7. **Verify your domain for photos.** Open **URL properties** in TikTok's app settings and verify the domain serving your media, preferably with the DNS record TikTok provides. Alternatively, verify a URL prefix such as `https://studio.example.com/api/social/delivery/`; that method can require hosting TikTok's verification file, which this dashboard does not automatically do. Photo URLs must be publicly reachable HTTPS URLs without redirects. Our video upload sends the file directly; photos use this verified delivery address. [Media verification guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide)
8. **Test one post.** Choose the account and an MP4 or single JPEG/WebP photo in **İçerik stüdyosu**. Click **Hesap bilgilerini yenile**, select the audience, and confirm music use. For video, wait for the preview duration to load. Set commercial-content and AI disclosures when applicable. Review everything before choosing **Şimdi paylaş** or approving a schedule.

**Private tests:** Unaudited clients can post only with **SELF_ONLY** visibility, and the posting account must be private at that time. They are limited to five posting users in a 24-hour period, even though a Sandbox can contain more target accounts. [Test publishing limits](https://developers.tiktok.com/docs/en/content-sharing-guidelines)

**Public posting:** When ready to apply, import your Sandbox settings into **Production > Draft**, complete website/privacy-policy/terms URL verification, and submit the requested explanation and an end-to-end demo video for app review. Removing Direct Post's private-only restriction also requires its audit. Describe the real intended use; the private-tool restriction above still applies. [App review steps](https://developers.tiktok.com/docs/en/getting-started-create-an-app), [Direct Post audit](https://developers.tiktok.com/docs/en/content-posting-api-get-started)

TikTok schedules run on this computer after you approve each post. Keep it awake, online, and running Social Studio at the chosen time. TikTok is not included in the recurring automatic flow.

### Common account setup problems

| What you see | What to do |
| --- | --- |
| Redirect/callback mismatch | Copy the full address from the panel again. Check the scheme, domain, port, path, and trailing slash in the provider settings. |
| YouTube denies a test account | Add that Google account to **Audience > Test users** in the same Cloud project as your OAuth client. |
| YouTube stops working after about a week | External/Testing authorizations expire after seven days. Reconnect or complete the appropriate Production setup. |
| Instagram cannot authorize an account | Check professional account type, accepted tester role, Instagram Login credentials, and publishing permission. |
| Instagram or TikTok cannot download a photo/video | Check the HTTPS address and signed media delivery route. Extra proxy login/challenge pages prevent the provider from downloading it. TikTok photos also need verified URL ownership. |
| TikTok cannot publish publicly | Sandbox/unaudited access does not allow public Direct Post. Check the review restrictions above. |
| Adding a second account reconnects the first | Switch to the intended account on the provider's sign-in page/browser session and repeat **Başka hesap ekle**. |

Never paste client secrets or access tokens into GitHub issues or screenshots. If a credential is accidentally shared, replace it in the provider portal and update the panel.

## Make your first post

1. Open **İçerik stüdyosu** (Content studio).
2. In **Bağlam ve paylaşım notların**, explain what you want to say. Include the facts, audience, and tone. AI-generated posts are always in English, even if your notes are in another language. For example:

   > My app turns voice notes into text. Write in English for content creators. Keep it short and friendly. Do not invent features or promise results.

3. Choose an AI model and the platforms or accounts to prepare drafts for.
4. Click **Taslakları oluştur**. Leave **Metinleri AI ile hazırla** checked to generate text, or uncheck it to write your own.
5. In each account's editor, check the text. Use **Klasörden / kütüphaneden seç** to browse media, scan a folder, search filenames, and select a preview. **Dosya yükle** uploads one image/video, **AI medya seçsin** chooses compatible library media, and **Görsel üret** generates an image. Instagram has a **Gönderi / Reels** selector. YouTube uses MP4 for the video and JPEG/PNG for an optional cover.
6. Check the selected account, media preview, and any visibility or disclosure settings. Click **Taslağı kaydet** to save or choose **Şimdi paylaş** / **Tarih ve saat seç** in the visible **Yayın zamanı** section. For a future post, pick an Istanbul date/time and click **Onayla ve planla**, or **YouTube’a yükle ve planla** for YouTube.

X AI posts are short, in English, and contain no hashtags. YouTube titles/descriptions and LinkedIn AI drafts are also written in English.

TikTok AI captions are written in English, with an opening hook, emoji-led feature lines, a call to action, any supplied link, and a final hashtag line. Each content line is separated by a blank line. The structure uses your own product facts; it does not copy a fixed product example.

For TikTok, refresh the account information, choose the audience, and confirm music use before publishing. Set commercial-content and AI disclosures when they apply.

**Scheduling uses Istanbul time (UTC+3).**

| Platform | Where the plan runs | Must this computer stay on? |
| --- | --- | --- |
| YouTube | The video uploads privately now with YouTube’s `publishAt`; YouTube makes it public at the chosen time | No, after upload and schedule confirmation |
| X, Instagram posts/Reels, TikTok | The dashboard sends the approved post through the platform API when due | Yes, keep the app running and the computer awake and online |

Choose at least **5 minutes ahead for YouTube** or **30 seconds ahead for other platforms**. Video processing can delay YouTube publication. If the app was off for a local scheduled post, it sends the post when reopened. Existing YouTube plans made by earlier app versions remain in the local queue.

Open **Paylaşım kuyruğu**, filter by **Planlandı**, and open a post to change its time or cancel. Canceling a YouTube plan leaves the uploaded video private; rescheduling updates that same video. YouTube schedules keep running if the dashboard closes or the account is disconnected. Reconnect the same channel to manage them. Older YouTube connections may need reauthorization for the additional video-editing permission.

YouTube status is checked after uploading, on app startup, when due, and when you click **YouTube durumunu yenile**. Pending processing or uncertain results are checked again about every five minutes while the app is running. Folder originals are archived only after public publication is confirmed and all their other posts have completed. Failed or uncertain uploads are never automatically uploaded again.

Find all your drafts and publication states in **Paylaşım kuyruğu** (Post queue).

## Use an image/video folder

Open **Medya kütüphanesi** (Media library), click **Klasör seç**, browse to your media folder, and click **Bu klasörü seç**. The folder path fills in automatically. Click **Klasörü tara** to import its media. You can also enter a path manually, for example on a Mac:

```text
/Users/YourName/Movies/SocialStudio
```

Use a folder on the computer running Social Studio. On Windows, use your Windows folder path. The app imports MP4 videos up to **100 MB** and JPEG/PNG/WebP images up to **5 MB** from that folder. It does not scan subfolders or convert files. Each platform shows compatible formats: Instagram image posts require JPEG; TikTok photos require JPEG/WebP; YouTube covers require JPEG/PNG.

Give files useful names, such as `voice-notes-demo.mp4`. **AI chooses using filenames and your notes. It does not view images, watch videos, or transcribe audio.**

The file flow is:

1. Scanning creates a private copy for previews and publishing. The original stays in its folder.
2. You or AI choose media for your posts.
3. Once **all posts using that imported media, including YouTube covers** have published successfully, the original moves into the folder's `paylasildi/` subfolder. A unique prefix prevents overwriting another file.

If a post is still a draft, failed, or uncertain, the original stays in place. An archive error does not undo a successful publication; the library shows the error and lets you retry the move. Files uploaded directly through the browser have no source folder to move from.

## Let it publish regularly

For recurring **X, YouTube, and Instagram Reels** posts:

1. Add videos to the library or connect a video folder.
2. Open **Otomatik akış** (Automatic flow).
3. Enter your notes, select a model and connected accounts, and choose an interval from 1 to 168 hours.
4. Check YouTube visibility and content settings, allow automatic publishing, and click **Onayla ve akışı başlat**.

The first run happens **after the selected interval**, not immediately. Each run selects an unused video, writes text for each account, publishes, and archives the source when every target succeeds. The app rescans the saved folder on each run.

Keep your computer and app running. Use **Otomatik akışı durdur** to stop future runs. Instagram publishes the chosen video as a Reel and also shares it to the profile feed. TikTok stays outside this recurring flow because each post needs its own settings and consent.

## Costs, privacy, and platform limits

- **AI and platform API usage may cost money.** Text generation, image generation, and AI video selection use your OpenAI account. Recurring flows can keep generating charges while enabled. Review provider billing and limits; the app does not enforce a spending cap.
- **Instagram and TikTok photos need public HTTPS media delivery.** The app creates a signed URL for only the selected asset, valid for one hour. Set up your own HTTPS address as described in the [API setup guide](docs/platform-setup-tr.md). Instagram requires a professional Business/Creator account; TikTok also requires domain or URL-prefix verification for photos.
- **A connection does not guarantee publication.** Your provider account must have the required API permissions. YouTube account permissions, processing, and API policies still apply. TikTok requires posting approval and may not approve a private tool for managing your own accounts. See [provider setup and restrictions](docs/advanced-usage.md#developer-api-setup-and-provider-limits).
- **Local storage does not mean everything stays offline.** Drafts and settings are stored on your computer. AI requests send the relevant notes, project information, and filenames to OpenAI. Publishing sends the selected text and media to the chosen platform.
- **Keep a backup.** Stop the app and back up both `.env` and `data/` in the project folder. The packaged Mac app stores its separate profile in `~/Library/Application Support/Social Studio/`. See [backup and upgrade details](docs/advanced-usage.md#upgrading-an-existing-installation).

## If something does not work

| Problem | What to check |
| --- | --- |
| First setup page will not let me choose a password | Use the complete link printed by `npm start`, including `#setup=...` |
| AI generation fails | Check your API key, provider billing, and access to the selected model in **API ve modeller** |
| Account connection fails | Make sure the developer credentials belong to the same app and the callback address matches exactly |
| A video is missing from the library | Check its folder path, MP4 format, and the 100 MB limit, then scan again |
| A scheduled post did not run | For X/Instagram/TikTok, keep the computer awake and app running. For YouTube, refresh its status and check video processing / permissions |
| A post says **Kontrol gerekli** | Check your social account first; the publication may have succeeded before the connection was lost |

## More help

- [Türkçe başlangıç rehberi](docs/quick-start-tr.md)
- [Advanced setup, Mac app builds, phone access, and previous workflows](docs/advanced-usage.md)
- [YouTube, Instagram, TikTok, and X API setup](docs/platform-setup-tr.md)
- [X account setup in Turkish](docs/x-setup.md)
- [Contributing and local tests](CONTRIBUTING.md)
- [Security and private vulnerability reports](SECURITY.md)

Social Studio is available under the [MIT license](LICENSE). The license does not include provider accounts, API access, or credits.
