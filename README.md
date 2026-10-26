# Social Studio

[![CI](https://github.com/TemelGunaydin/SocialStudio/actions/workflows/ci.yml/badge.svg)](https://github.com/TemelGunaydin/SocialStudio/actions/workflows/ci.yml) · [Türkçe rehber](docs/quick-start-tr.md) · [MIT license](LICENSE)

**Manage your social accounts, prepare posts, and publish from one place.**

Social Studio runs on your computer and opens in your browser. Write what you want to share, choose the accounts, add a video or image, and review your post. You can also let AI write the text or choose a video from your folder.

It is designed for one person managing their own accounts. You can connect more than one account on the same platform, such as a personal X account and a business X account.

> The app is currently in Turkish. This guide includes the exact button and page names you will see. A [Turkish getting-started guide](docs/quick-start-tr.md) is also available.

## What can it do?

| Platform | What you can publish | Automatic publishing |
| --- | --- | --- |
| Twitter / X | Text, with one image or one video | Publish now, schedule a post, or enable recurring posts |
| YouTube | A video with a title and description | Publish now, schedule a post, or enable recurring posts |
| TikTok | A video with a caption | Publish now or approve an individual scheduled post; no recurring flow |
| LinkedIn | Prepare text and preview a video in the previous-draft tools | Copy the text and finish the upload on LinkedIn yourself |

You can also:

- Generate text from your notes, audience, preferred language, and tone.
- Choose an OpenAI model, including Luna, and select a separate image model.
- Give AI a video folder to choose from, using filenames and your notes.
- Move successfully shared folder videos into `paylasildi/` automatically.
- Keep separate drafts, media selections, and publication states for each account.

**You control publishing.** Creating a draft does not publish it. Recurring X/YouTube publishing starts only after you explicitly enable it.

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
2. On the same page, add the developer app details for each platform you want to use. Copy the **Callback / yönlendirme adresi** shown there into that provider's app settings. This is the address the provider uses to return you to Social Studio after authorization.
3. Open **Sosyal hesaplar** (Social accounts) and connect an account. Repeat to add another account, including another account on the same platform.

You do not enter your social account passwords into Social Studio. You approve access on the provider's own page. Leaving a saved credential field blank keeps its current value.

For connection details, see the [X setup guide in Turkish](docs/x-setup.md) or [advanced API setup](docs/advanced-usage.md#developer-api-setup-and-provider-limits).

## Make your first post

1. Open **İçerik stüdyosu** (Content studio).
2. In **Bağlam ve paylaşım notların**, explain what you want to say. Include the facts, audience, language, and tone. For example:

   > My app turns voice notes into text. Write in Turkish for content creators. Keep it short and friendly. Do not invent features or promise results.

3. Choose an AI model and the platforms or accounts to prepare drafts for.
4. Click **Taslakları oluştur**. Leave **Metinleri AI ile hazırla** checked to generate text, or uncheck it to write your own.
5. In each account's editor, check the text and choose its media. Use **Video yükle** to upload an MP4, **AI video seçsin** to choose from your library, or **Görsel üret** to generate an image. YouTube and TikTok need a video; a generated image is saved to the library and does not become a video.
6. Check the selected account, media preview, and any visibility or disclosure settings. Click **Taslağı kaydet** to save, **Şimdi paylaş** to publish, or **İleri bir zamana planla** to choose a publication time and approve it.

TikTok AI captions are written in English, with an opening hook, emoji-led feature lines, a call to action, any supplied link, and a final hashtag line. Each content line is separated by a blank line. The structure uses your own product facts; it does not copy a fixed product example.

For TikTok, refresh the account information, choose the audience, and confirm music use before publishing. Set commercial-content and AI disclosures when they apply.

**Scheduling uses Istanbul time.** The computer and app must remain running. An approved post that misses its time can publish when you reopen the app. Failed or uncertain posts are not automatically retried; check the platform before trying again.

Find all your drafts and publication states in **Paylaşım kuyruğu** (Post queue).

## Use a video folder

Open **Medya kütüphanesi** (Media library), click **Klasör seç**, browse to your video folder, and click **Bu klasörü seç**. The folder path fills in automatically. Click **Klasörü tara** to import its videos. You can also enter a path manually, for example on a Mac:

```text
/Users/YourName/Movies/SocialStudio
```

Use a folder on the computer running Social Studio. On Windows, use your Windows folder path. The app imports MP4 files up to **100 MB each** from that folder; it does not scan subfolders or convert videos.

Give videos useful names, such as `voice-notes-demo.mp4`. **AI chooses using filenames and your notes. It does not watch or transcribe the video.**

The file flow is:

1. Scanning creates a private copy for previews and publishing. The original stays in its folder.
2. You or AI choose a video for your posts.
3. Once **all posts using that imported video** have published successfully, the original moves into the folder's `paylasildi/` subfolder. A unique prefix prevents overwriting another file.

If a post is still a draft, failed, or uncertain, the original stays in place. An archive error does not undo a successful publication; the library shows the error and lets you retry the move. Files uploaded directly through the browser have no source folder to move from.

## Let it publish regularly

For recurring **X and YouTube** posts:

1. Add videos to the library or connect a video folder.
2. Open **Otomatik akış** (Automatic flow).
3. Enter your notes, select a model and connected accounts, and choose an interval from 1 to 168 hours.
4. Check YouTube visibility and content settings, allow automatic publishing, and click **Onayla ve akışı başlat**.

The first run happens **after the selected interval**, not immediately. Each run selects an unused video, writes text for each account, publishes, and archives the source when every target succeeds. The app rescans the saved folder on each run.

Keep your computer and app running. Use **Otomatik akışı durdur** to stop future runs. TikTok stays outside this recurring flow because each post needs its own settings and consent.

## Costs, privacy, and platform limits

- **AI and platform API usage may cost money.** Text generation, image generation, and AI video selection use your OpenAI account. Recurring flows can keep generating charges while enabled. Review provider billing and limits; the app does not enforce a spending cap.
- **A connection does not guarantee publication.** Your provider account must have the required API permissions. YouTube may restrict uploads from unverified API projects to private visibility. TikTok requires posting approval and may not approve a private tool for managing your own accounts. See [provider setup and restrictions](docs/advanced-usage.md#developer-api-setup-and-provider-limits).
- **Local storage does not mean everything stays offline.** Drafts and settings are stored on your computer. AI requests send the relevant notes, project information, and filenames to OpenAI. Publishing sends the selected text and media to the chosen platform.
- **Keep a backup.** Stop the app and back up both `.env` and `data/` in the project folder. The packaged Mac app stores its separate profile in `~/Library/Application Support/Social Studio/`. See [backup and upgrade details](docs/advanced-usage.md#upgrading-an-existing-installation).

## If something does not work

| Problem | What to check |
| --- | --- |
| First setup page will not let me choose a password | Use the complete link printed by `npm start`, including `#setup=...` |
| AI generation fails | Check your API key, provider billing, and access to the selected model in **API ve modeller** |
| Account connection fails | Make sure the developer credentials belong to the same app and the callback address matches exactly |
| A video is missing from the library | Check its folder path, MP4 format, and the 100 MB limit, then scan again |
| A scheduled post did not run | Keep the computer awake and the app running; check the queue and account permissions |
| A post says **Kontrol gerekli** | Check your social account first; the publication may have succeeded before the connection was lost |

## More help

- [Türkçe başlangıç rehberi](docs/quick-start-tr.md)
- [Advanced setup, Mac app builds, phone access, and previous workflows](docs/advanced-usage.md)
- [X account setup in Turkish](docs/x-setup.md)
- [Contributing and local tests](CONTRIBUTING.md)
- [Security and private vulnerability reports](SECURITY.md)

Social Studio is available under the [MIT license](LICENSE). The license does not include provider accounts, API access, or credits.
