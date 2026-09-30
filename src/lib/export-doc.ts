/**
 * `.doc` export.
 *
 * Shamela has no docx endpoint, so this is HTML served as
 * `application/msword`. Word opens it, but the details below are what make the
 * Arabic survive the round trip.
 */

import { escapeHtml, stripSiteChrome } from './nass'
import type { BookPage } from './shamela'

const BOM = '\ufeff'

const DOC_STYLES = `
  body {
    font-family: 'Traditional Arabic', 'Amiri', 'Scheherazade New', 'Segoe UI', Tahoma, sans-serif;
    font-size: 14pt;
    line-height: 1.8;
    direction: rtl;
    text-align: right;
  }
  h1 {
    font-family: 'Traditional Arabic', 'Amiri', Tahoma, sans-serif;
    font-size: 20pt;
    color: #1f3864;
    text-align: center;
    margin: 0 0 18pt;
  }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .page-heading {
    color: #2b579a;
    border-bottom: 1px solid #ccc;
    padding-bottom: 5px;
    font-size: 12pt;
    margin: 0 0 14pt;
  }
  p { margin: 0 0 10pt; }
  hr { border: 0; border-top: 1px dotted #ccc; margin: 14pt 0; }
  a { color: inherit; text-decoration: none; }
`

export function buildDocHtml(title: string, pages: BookPage[]): string {
  const body = pages
    .map(
      (page) => `
        <div class="page">
          <h3 class="page-heading">[ ${escapeHtml(`صفحة ${page.pageNum}`)} ]</h3>
          ${stripSiteChrome(page.html)}
        </div>`,
    )
    .join('')

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>${DOC_STYLES}</style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    ${body}
  </body>
</html>`
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function buildDocBlob(title: string, pages: BookPage[]): Blob {
  if (pages.length === 0) {
    throw new Error('لا توجد صفحات لتصديرها')
  }

  // The BOM is what stops Word from mis-decoding the Arabic. Do not drop it.
  return new Blob([BOM + buildDocHtml(title, pages)], {
    type: 'application/msword;charset=utf-8',
  })
}

export function downloadDoc(title: string, pages: BookPage[]): void {
  triggerDownload(`${title}.doc`, buildDocBlob(title, pages))
}
