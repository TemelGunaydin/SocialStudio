# Contributing

Thanks for helping make Social Studio easier to use. The current application and setup guide are in Turkish; issues and pull requests in Turkish or English are welcome.

## Local development

1. Install Node.js 22.13 or newer.
2. Clone the repository. No npm dependencies need installing.
3. Run `npm test`. Tests use temporary data and fake provider responses; do not add real keys to test fixtures.
4. Run `npm start` and open the complete first-run URL shown in your terminal. Set a local owner password and follow the in-app setup guide.

```sh
git clone https://github.com/TemelGunaydin/SocialStudio.git
cd SocialStudio
npm test
npm start
```

macOS packaging requires Xcode Command Line Tools: `npm run package:mac`. It downloads a checksum-verified Node runtime and creates an ad-hoc signed local app under `dist/`. It does not publish a release. Intel and Windows runtime behavior has not been fully verified; the CI jobs state exactly what was tested.

## Pull requests

- Keep changes focused and explain the user problem and how you verified the result.
- Add regression tests for changed behavior. Preserve existing data, X connections and explicit publishing approval.
- Do not introduce live paid API calls into tests or CI. Mock provider responses. Do not publish real posts while testing.
- Preserve first-run protection, local-only defaults, source review and paid-generation opt-in.
- Never commit `.env`, token files, SQLite data, generated media, local logs or built app bundles. Use anonymized examples/screenshots.
- For UI changes, check a narrow phone viewport and keyboard navigation as well as desktop.
- For data migrations, document preservation and rollback limits. Back up your own data before trying a migration.

Contributions are made under the [MIT license](LICENSE). Do not submit code or assets you lack permission to distribute. Node's own license and bundled third-party notices remain included in packaged runtimes.

## Bug reports

Use GitHub issues for ordinary bugs and feature requests. Include the commit, OS/architecture, Node version (source installs), reproduction steps and expected/actual behavior. Remove personal data and keys first. For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public report.
