# AGENTS.md

Vite + React 19 SPA for downloading books from [shamela.ws](https://shamela.ws) in several formats. Pure client-side — **there is no backend**. UI is Arabic and right-to-left.

Export formats: **doc, pdf, txt, json**.

## Commands

```bash
npm run dev        # vite dev server
npm run build      # tsc -b && vite build  — the ONLY thing that typechecks
npm run lint       # eslint .  (flat config, non-type-aware)
npm run preview    # serve dist/
```

- **No test script and no test runner installed.** Do not add one unprompted; verify with `npm run lint` + typecheck.
- **No `typecheck` script.** `tsconfig.json` is a solution file with `"files": []`, so `npx tsc --noEmit` at the root typechecks *nothing*. Use `npx tsc -b` (covers both `tsconfig.app.json` → `src/` and `tsconfig.node.json` → `vite.config.ts`).
- Dev server uses Vite's default port **5173** and silently falls back to the next free port if taken — in this workspace 5173 is already occupied, so the app commonly lands on **5174**. Always read the port off the Vite banner instead of assuming. The sibling repos in `~/TsGopher` use 3000/3001.
- **Verifying DOM-dependent code (no test runner):** serve a throwaway module from the dev server and read the result out of headless Chrome.
  ```bash
  # smoke.html at repo root: <pre id="out"> + <script type="module" src="/src/smoke.ts">
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
    --virtual-time-budget=45000 --dump-dom "http://localhost:5174/smoke.html"
  ```
  Node has no `DOMParser`, so nothing here is unit-testable outside the browser. There is no `timeout` command on macOS — background the browser and poll the PID instead. Delete the harness files when done; the repo has no test framework to keep them in.

## Shamela site facts (verified by hand — re-verify if the site changes)

Everything is fetched from the browser via a Vite dev proxy (see CORS below), so these are the contract the scraper depends on.

- **Page URL is `/book/:bookId/:pageId`.** The last segment is an internal **page id, not the printed page number**. Book `30089`: URL page `5` → `data-page-id="5" data-page-num="9"`. The id↔num offset is **per-book**, so never derive one from the other; read `data-page-num` if you need the printed number.
- **Book text lives in `div.nass`.** Served markup is `<div class="nass margin-top-10" data-page-id="…" data-page-num="…">`. Prefer the parsed-DOM path (`DOMParser` + `querySelector('div.nass')`) over regex — the raw HTML also contains `.nass` inside an inline `<style>` block and inside JS template strings used by the site's own prev/next AJAX, which a naive regex will match instead.
- **Out-of-range pages return HTTP 404** (small page, no `.nass`). So always check `res.ok`, and use "stop at first 404" as the end-of-book condition.
- **The index page's last page link is NOT the end of the book.** `/book/30089` links only `/book/30089/1` and `/book/30089/558`, but that book actually runs to **979** pages (980 → 404). Truncating at the index link silently loses ~40% of the book. Binary-searching for the first 404 is the reliable page-count method.
- **No total-page count is exposed** anywhere on `/book/:id` — don't go looking for one.
- `/book/:id` does give metadata: title in `<title>` (`… - المكتبة الشاملة`) and `<h1 class="size-20">`.
- The site paginates with its own `data-next-id` / `data-prev-id` attributes and an AJAX endpoint. Treat those as the authoritative adjacency signal; don't assume page ids are contiguous.
- `robots.txt` returns 404 (it doesn't exist). Scraping volume stays a judgement call — keep requests sequential and low-rate.
- **shamela.ws sends no `Access-Control-Allow-Origin`.** A direct cross-origin `fetch` from the page is blocked. All requests must go through the Vite dev proxy to `/shamela` (rewrite to `https://shamela.ws`, strip the prefix). **This does not survive a static production build** — there is no backend, so `dist/` has no working data path. Fine for a dev tool; a real deploy needs a proxy service or the no-backend constraint has to be revisited.

## Downloads

- **`.doc` export is HTML-in-a-`application/msword` Blob, not real DOCX** — implemented in `src/lib/export-doc.ts`. The parts that actually matter and are easy to drop: the **`\ufeff` BOM prefix** (without it Word mangles the Arabic), the `xmlns:o` / `xmlns:w` / `xmlns=…REC-html40` attributes on `<html>`, an inline `<style>` with `direction: rtl; text-align: right;`, an Arabic font stack (`'Traditional Arabic', 'Amiri', …`), and a page break per source page. Verified output starts `ef bb bf 3c 68 74 6d 6c` (BOM + `<html`).
- **A `.page` CSS class, not inline `page-break` styles.** The stylesheet carries `.page { page-break-after: always }` plus `.page:last-child { page-break-after: auto }` so the last page doesn't emit a trailing blank sheet. Counting the literal string `page-break-after: always` therefore yields 1, not one-per-page — don't mistake that for a bug.
- **Shamela's page chrome must be stripped before export.** Served `.nass` markup interleaves per-paragraph anchors and "copy" buttons (`a.btn_tag`, `span.anchor`); they are meaningless in a Word file. `stripSiteChrome` drops them, plus `script`/`style`/`.fa`.
- **Never verify the BOM with `await blob.text()`** — `TextDecoder` silently strips a leading BOM, so it reads back as clean and proves nothing. Use `new Uint8Array(await blob.arrayBuffer())` and check bytes `ef bb bf`.
- **No PDF library is installed.** Adding one is a real dependency decision — confirm before pulling in jsPDF/html2pdf, and remember embedded Arabic fonts are the hard part (subsetting + RTL shaping).
- Fetching 979 pages sequentially will be slow and may trip rate limits — `src/lib/export-book.ts` therefore reports progress, honours an `AbortSignal`, rate-limits to ~120ms between requests, and tolerates individual page failures instead of aborting the whole export.

## State of the scaffold

- **Not a git repository** — zero commits, no branches, no CI. Don't attempt git workflows or assume a remote/PR flow.
- `README.md` is **unmodified Vite template boilerplate** and describes none of this project. Ignore it as project documentation; trust `package.json` + the tsconfigs.
- The template leftovers are gone: `src/App.css`, `src/assets/*`, and the "Get started" `App.tsx` were all replaced. `src/index.css` is now just `@import 'tailwindcss'`. **Do not restore the template's CSS** — Tailwind's preflight would fight it anyway.
- `src/lib/` is the app's real logic: `shamela.ts` (fetch/parse/page-count), `export-doc.ts` (the `.doc` writer), `export-book.ts` (the sequential export loop). `App.tsx` holds state and the RTL UI and must **only export the component** — helpers and types go in `src/lib/`.

## Design system

- **Tailwind v4 is installed** (`tailwindcss` + `@tailwindcss/vite`). It is **CSS-first**: no `tailwind.config.js`, and the only setup is the plugin in `vite.config.ts` plus `@import 'tailwindcss'` in `src/index.css`. Don't add a v3-style config file.
- **shadcn/ui is not installed yet** and there is no `components.json` — that's the next step, not a broken state.
- The **`@/` alias is configured** in both `tsconfig.app.json` (`compilerOptions.paths`) and `vite.config.ts` (`resolve.alias`), so shadcn's generated `components.json` works as-is. Setting only one produces "cannot resolve" errors that look like a broken install.
- shadcn ships Radix primitives, which are direction-aware — `index.html` already sets `lang="ar" dir="rtl"`, so they mirror correctly. Don't hand-flip with `left/right` utilities; use logical properties (`ms-`/`me-`, `ps-`/`pe-`, `start`/`end`).
- `public/` is served at the web root — the template uses an SVG sprite via `<use href="/icons.svg#id">`.

## TypeScript constraints (both tsconfigs)

- **`strict` is NOT enabled** — there is no `"strict": true` anywhere. Don't assume strict null checks; don't add them as a drive-by change.
- **`erasableSyntaxOnly: true`** — `enum`, `namespace`, parameter properties, and `declare`d class-field emit are all compile errors. Use `as const` objects + union types instead of `enum`. This is why the format list should be a union type, not an `enum`.
- **`verbatimModuleSyntax: true`** — every type-only import must be `import type { X }`; a plain `import { X }` for a type survives to runtime and breaks the build.
- `noUnusedLocals` / `noUnusedParameters` are on, so an unused import fails `npm run build` even if lint passes.
- `allowImportingTsExtensions` is on and `main.tsx` imports `./App.tsx` with the extension — extensioned imports are valid here.
- **`baseUrl` is deprecated in TypeScript 6 and errors out.** Don't add it for path aliases — `paths` entries resolve relative to the tsconfig file without it, which is how `@/*` is mapped here.

## Lint

- `eslint.config.js` is **flat config** (ESLint 10). No `.eslintrc`, no `--ext` flag.
- Only `dist` is globally ignored, so everything else in the repo gets linted.
- `reactRefresh.configs.vite` is enabled: a component file that also exports plain functions/constants trips `react-refresh/only-export-components`. This is a routine fight with shadcn's pattern of colocating a component's variants in the same file — put helpers, `cva` variant maps, and types in a sibling module.
- Only `globals.browser` is defined — no Node globals in `src/`.
