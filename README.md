# DeskFormat

DeskFormat is a personal browser-based formatter workspace inspired by FreeFormatter, with a cleaner interface and local-first utilities.

## Tools

- Quartz cron expression generator and explainer
- JSON formatter, minifier, and validator
- XML and HTML formatter/minifier
- URL, Base64, and HTML entity encoder/decoder
- Case converter
- Regex tester
- SHA-1 and SHA-256 hash generator
- HEX to RGB/HSL color converter

## Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal.

## Build

```bash
npm run build
```

The production build is configured as a static Next.js export and writes the site to `out/`.

## Cloudflare Pages

Use these build settings:

- Framework preset: Next.js / Static Next.js
- Build command: `npm run build`
- Build output directory: `out`
- Root directory: leave blank
- Node.js version: `22.13.0` or newer

If Cloudflare tries to run `bunx opennextjs-cloudflare build`, the project is using the SSR/OpenNext build path. Change the Pages build command back to `npm run build` and the output directory to `out`.

## Notes

The tools run in the browser. DeskFormat does not upload pasted values to a server.
