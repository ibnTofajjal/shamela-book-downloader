/**
 * Shamela (shamela.ws) page fetching and parsing.
 *
 * Everything goes through the Vite dev proxy at /shamela — shamela.ws sends no
 * Access-Control-Allow-Origin, so direct browser fetches are CORS-blocked.
 */

const PROXY = '/shamela'
const TITLE_SUFFIX = ' - المكتبة الشاملة'

/** Printed page label, e.g. the "[صفحة: 9]" heading in a .doc export. */
export type BookPage = {
  pageId: number
  pageNum: number
  html: string
}

export type BookMeta = {
  id: number
  title: string
}

/** Sequential, low-rate fetching. Shamela has no robots.txt and we stay polite. */
async function politeDelay(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120))
}

/**
 * Raw HTML for one page, or null when Shamela 404s.
 * Out-of-range pages return a small 404 page with no `.nass`, which is the
 * only reliable end-of-book signal — the index page's last page link lies.
 */
export async function fetchRawPage(
  bookId: number,
  pageId: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const res = await fetch(`${PROXY}/book/${bookId}/${pageId}`, { signal })
  if (!res.ok) return null
  return res.text()
}

/**
 * Extract the book text from a page.
 *
 * Uses div.nass deliberately: the raw HTML also contains `.nass` in an inline
 * <style> block and in the site's own prev/next AJAX template strings, so a
 * regex over the markup picks the wrong thing up.
 */
export function parsePage(raw: string, fallbackPageId: number): BookPage | null {
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  const content = doc.querySelector('div.nass')
  if (!content) return null

  const numAttr = content.getAttribute('data-page-num')
  const idAttr = content.getAttribute('data-page-id')
  const num = Number(numAttr)

  return {
    pageId: idAttr ? Number(idAttr) : fallbackPageId,
    // URL page ids are not printed page numbers; the offset varies per book.
    pageNum: Number.isFinite(num) && numAttr ? num : fallbackPageId,
    html: content.innerHTML,
  }
}

export async function fetchPage(
  bookId: number,
  pageId: number,
  signal?: AbortSignal,
): Promise<BookPage | null> {
  const raw = await fetchRawPage(bookId, pageId, signal)
  if (raw === null) return null
  return parsePage(raw, pageId)
}

export async function fetchBookMeta(
  bookId: number,
  signal?: AbortSignal,
): Promise<BookMeta> {
  const res = await fetch(`${PROXY}/book/${bookId}`, { signal })
  if (!res.ok) throw new Error(`تعذّر جلب بيانات الكتاب (${res.status})`)

  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  const rawTitle = doc.title || doc.querySelector('h1.size-20')?.textContent || ''
  const title = rawTitle.replace(TITLE_SUFFIX, '').trim()

  return { id: bookId, title: title || `الكتاب ${bookId}` }
}

async function pageExists(bookId: number, pageId: number, signal?: AbortSignal) {
  const raw = await fetchRawPage(bookId, pageId, signal)
  if (raw !== null) await politeDelay()
  return raw !== null
}

/**
 * Total page count by doubling until the first 404, then bisecting.
 *
 * Do not read it off /book/:id — that page's last page link is not the end of
 * the book (book 30089 links 558 but runs to 979). Costs ~2·log2(n) requests.
 */
export async function countPages(
  bookId: number,
  signal?: AbortSignal,
): Promise<number> {
  let lo = 1
  let hi = 2

  while (await pageExists(bookId, hi, signal)) {
    lo = hi
    hi *= 2
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2)
    if (await pageExists(bookId, mid, signal)) lo = mid
    else hi = mid
  }

  return lo
}
