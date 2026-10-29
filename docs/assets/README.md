# Documentation images

These assets belong to this repository and are referenced with relative paths so they also render in forks and local checkouts.

| File | Source and purpose |
| --- | --- |
| `social-studio-logo.png` | Original logo generated with the built-in Imagegen tool, with a transparent background. Its colors come from `public/studio.css`. |
| `studio-overview.png` | Browser capture of the content studio, with a manually prepared English draft and the generated logo selected as media. |
| `social-accounts.png` | Browser capture showing multiple example accounts and the account/setup controls. |
| `youtube-setup.png` | Browser capture of Social Studio's YouTube connection dialog. |
| `instagram-setup.png` | Browser capture of Social Studio's Instagram connection dialog. |
| `tiktok-setup.png` | Browser capture of Social Studio's TikTok connection dialog. |

The screenshots show the actual application at commit `4cbebcd`, running in an isolated temporary profile. All account names, drafts, credentials, and the `studio.example.com` address are fixtures. The example HTTPS origin was routed only to the local test server. No provider login, AI API call, or publication was performed. Secret inputs were empty, external API access was disabled, and the temporary profile was removed after capture. These are Social Studio screens, not screenshots of provider developer consoles.

The desktop captures use a 1440 × 1120 viewport. Setup images show only the relevant dialog at its original size. The logo is displayed at a smaller size by the README; its original PNG and transparency are preserved.

## Logo generation prompt

Generated using the built-in Imagegen tool with `transparent_background: true`. No reference image was supplied. Final prompt:

```text
Use case: logo-brand.
Asset type: a polished, original repository logo for Social Studio, a personal social-media publishing dashboard that brings multiple accounts, content creation, a media library, and scheduling together.
Primary request: create ONE distinctive compact symbol, not a presentation board. The symbol should suggest a flowing letter S made from two interlocking rounded publishing cards, with a subtle forward-motion cutout. Make it exceptionally clear and recognizable at small sizes.
Style: refined flat geometric brand design with precise curves and consistent visual weight. Color palette derived from the actual app: deep petrol #122c36, fresh mint #a7edc9, with a restrained violet #6745bd accent. Use a deep-petrol rounded-square tile containing the mint symbol so the logo reads on both white and dark GitHub themes. Generous transparent padding around the tile, which fills about 80% of the square composition.
Background: genuine alpha transparency outside the rounded-square tile.
Text: none. No wordmark, no slogans, no letters besides the abstract S-shaped symbol.
Constraints: one centered finished logo only; no third-party platform marks; no mockup, no watermark, no extra icons, no gradients, no glow, no shadows, no 3D. Crisp professional edges, balanced negative space.
```
