/**
 * PDF export via the browser's own print pipeline.
 *
 * There is no PDF library here on purpose. A PDF draws raw glyphs, so
 * generating one in code means supplying Arabic contextual shaping and bidi
 * reordering by hand -- which is exactly what the browser already does well.
 * Printing the same markup the Word writer emits keeps the two looking alike
 * and gives real vector text, not a screenshot.
 *
 * The trade-off is that the browser opens its print dialog; the user picks
 * "Save as PDF" to get the file.
 */

import { escapeHtml, stripSiteChrome } from './nass'
import type { BookPage } from './shamela'

/* A4 at 96dpi. The frame needs real dimensions or the browser cannot paginate. */
const A4_WIDTH_PX = 794
const A4_HEIGHT_PX = 1123

/* Backstop for browsers that never fire `afterprint`. */
const CLEANUP_DELAY_MS = 60_000

/**
 * Scheherazade New: a Naskh face with excellent Arabic text quality and wide
 * script coverage. It is linked per-document because a `srcdoc` frame does not
 * inherit the app's stylesheets, so the @font-face has to live here.
 *
 * If the CDN is slow or unreachable the export still proceeds on the fallbacks
 * below rather than hanging -- hence the bounded wait in `printPdf`.
 */
const FONT_FAMILY = 'Scheherazade New'
const FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Scheherazade+New:wght@400;700&display=swap'
const FONT_WAIT_MS = 8_000

const PRINT_STYLES = `
  @page { size: A4; margin: 18mm 16mm; }
  body {
    font-family: '${FONT_FAMILY}', 'Traditional Arabic', 'Amiri', 'Segoe UI', Tahoma, sans-serif;
    font-size: 14pt;
    line-height: 1.9;
    direction: rtl;
    text-align: right;
    color: #000;
    background: #fff;
  }
  h1 {
    font-family: '${FONT_FAMILY}', 'Traditional Arabic', 'Amiri', Tahoma, sans-serif;
    font-size: 20pt;
    color: #1f3864;
    text-align: center;
    margin: 0 0 18pt;
  }
  .page { page-break-after: always; break-after: page; }
  /* Without this the last source page emits a trailing blank sheet. */
  .page:last-child { page-break-after: auto; break-after: auto; }
  .page-heading {
    color: #2b579a;
    border-bottom: 1px solid #ccc;
    padding-bottom: 5px;
    font-size: 12pt;
    margin: 0 0 14pt;
  }
  p { margin: 0 0 10pt; orphans: 2; widows: 2; }
  hr { border: 0; border-top: 1px dotted #ccc; margin: 14pt 0; }
  a { color: inherit; text-decoration: none; }
`

export function buildPrintHtml(title: string, pages: BookPage[]): string {
  const body = pages
    .map(
      (page) => `
        <div class="page">
          <h3 class="page-heading">[ ${escapeHtml(`صفحة ${page.pageNum}`)} ]</h3>
          ${stripSiteChrome(page.html)}
        </div>`,
    )
    .join('')

  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="${FONT_STYLESHEET}">
    <style>${PRINT_STYLES}</style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    ${body}
  </body>
</html>`
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Wait for the web font, but never longer than `FONT_WAIT_MS`.
 *
 * `fonts.ready` on its own is not enough: it can resolve before the
 * @font-face has even been discovered, so we ask for the face explicitly
 * first. Printing before the font lands would reflow the text and shift the
 * pagination, and an unbounded wait would hang the export outright if the
 * font CDN is slow or blocked -- so the race falls through to the local
 * fallbacks instead.
 */
async function waitForFont(doc: Document): Promise<void> {
  const fonts = doc.fonts
  if (!fonts) return

  const requested = fonts
    .load(`1em "${FONT_FAMILY}"`)
    .catch(() => [] as FontFace[])
  const settled = Promise.all([requested, fonts.ready])

  await Promise.race([settled, delay(FONT_WAIT_MS)])
}

/**
 * Paginate `pages` into a PDF via the print dialog.
 *
 * Resolves once the dialog has been requested. The document lives in an
 * off-screen iframe rather than a hidden one: a `display:none` or
 * `visibility:hidden` frame is never laid out, and the browser needs real
 * dimensions to paginate. `srcdoc` keeps the frame same-origin, so we can
 * script and print it.
 */
export async function printPdf(title: string, pages: BookPage[]): Promise<void> {
  if (pages.length === 0) {
    throw new Error('لا توجد صفحات لتصديرها')
  }

  const frame = document.createElement('iframe')
  frame.title = 'معاينة الطباعة'
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText =
    `position:fixed;top:0;left:-10000px;` +
    `width:${A4_WIDTH_PX}px;height:${A4_HEIGHT_PX}px;border:0;`
  document.body.append(frame)

  const drop = () => frame.remove()

  try {
    const loaded = new Promise<void>((resolve) => {
      frame.addEventListener('load', () => resolve(), { once: true })
    })
    frame.srcdoc = buildPrintHtml(title, pages)
    await loaded

    // Any web fonts may still be swapping in; printing first would reflow text.
    const doc = frame.contentDocument
    if (doc) await waitForFont(doc)

    const view = frame.contentWindow
    // Registered before print(), and after the srcdoc navigation -- that swap
    // replaces the window object, so a listener added earlier would be lost.
    view?.addEventListener('afterprint', drop, { once: true })
    view?.focus()
    view?.print()
  } finally {
    // Backstop for browsers that never fire afterprint, and for a load event
    // that never arrives at all -- either way the frame must not leak.
    setTimeout(drop, CLEANUP_DELAY_MS)
  }
}
