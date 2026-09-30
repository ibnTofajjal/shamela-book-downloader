/**
 * Shared helpers for turning a Shamela `.nass` fragment into safe export markup.
 * Used by both the Word and PDF writers so the two stay in step.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Drop Shamela's own page chrome. The served `.nass` markup interleaves per
 * paragraph anchors and "copy" buttons that mean nothing in an exported file.
 */
export function stripSiteChrome(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return html

  root
    .querySelectorAll('a.btn_tag, .anchor, script, style, .fa')
    .forEach((node) => node.remove())

  return root.innerHTML
}
