import { useRef, useState } from 'react'
import { collectPages } from '@/lib/export-book'
import type { ExportProgress } from '@/lib/export-book'
import { downloadDoc } from '@/lib/export-doc'
import { countPages, fetchBookMeta } from '@/lib/shamela'

const FORMATS = [
  { id: 'doc', label: 'Word', ready: true },
  { id: 'pdf', label: 'PDF', ready: false },
  { id: 'txt', label: 'نص', ready: false },
  { id: 'json', label: 'JSON', ready: false },
] as const

type Status = 'idle' | 'detecting' | 'running' | 'done' | 'error'

function toInt(value: string): number | null {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function App() {
  const [bookId, setBookId] = useState('30089')
  const [startPage, setStartPage] = useState('1')
  const [endPage, setEndPage] = useState('')
  const [format, setFormat] = useState<(typeof FORMATS)[number]['id']>('doc')

  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [bookTitle, setBookTitle] = useState('')
  const [progress, setProgress] = useState<ExportProgress | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const busy = status === 'running' || status === 'detecting'

  async function detectPages() {
    const id = toInt(bookId)
    if (!id) {
      setStatus('error')
      setMessage('أدخل رقم الكتاب صحيحًا.')
      return
    }

    setStatus('detecting')
    setMessage('جارٍ جلب بيانات الكتاب…')

    try {
      const meta = await fetchBookMeta(id)
      setBookTitle(meta.title)

      setMessage('جارٍ البحث عن عدد الصفحات…')
      const total = await countPages(id)

      setEndPage(String(total))
      setStatus('idle')
      setMessage(`عدد صفحات الكتاب: ${total}`)
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'تعذّر الاتصال بالمكتبة.')
    }
  }

  async function startExport() {
    const id = toInt(bookId)
    const from = toInt(startPage)
    const to = toInt(endPage)
    if (!id || !from || !to) {
      setStatus('error')
      setMessage('أدخل رقم الكتاب ونطاق الصفحات بشكل صحيح.')
      return
    }
    if (from > to) {
      setStatus('error')
      setMessage('صفحة البداية أكبر من صفحة النهاية.')
      return
    }

    const controller = new AbortController()
    abortRef.current = controller
    setStatus('running')
    setProgress(null)
    setMessage('جارٍ التحضير…')

    try {
      const meta = await fetchBookMeta(id, controller.signal)
      setBookTitle(meta.title)

      const result = await collectPages(id, from, to, setProgress, controller.signal)

      if (result.pages.length === 0) {
        setStatus('error')
        setMessage('لم يتم العثور على أي صفحات في هذا النطاق.')
        return
      }

      downloadDoc(meta.title, result.pages)

      const notes: string[] = [`تم تصدير ${result.pages.length} صفحة`]
      if (result.failedPageIds.length > 0) {
        notes.push(`فشلت ${result.failedPageIds.length} صفحة`)
      }
      if (result.stoppedAtEndOfBook) {
        notes.push('توقّف عند نهاية الكتاب')
      }
      setStatus('done')
      setMessage(notes.join(' — '))
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('idle')
        setMessage('أُلغيت العملية.')
        return
      }
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'حدث خطأ غير متوقع.')
    } finally {
      abortRef.current = null
    }
  }

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.fetched / progress.total) * 100))
      : 0

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 antialiased">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">تنزيل الكتب من المكتبة الشاملة</h1>
          <p className="text-sm text-slate-500">
            الصّفحات من نطاق محدد إلى ملف جاهز للتنزيل.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">رقم الكتاب</span>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
              inputMode="numeric"
              value={bookId}
              disabled={busy}
              onChange={(e) => setBookId(e.target.value)}
            />
          </label>

          {bookTitle && (
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-900">{bookTitle}</span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">من صفحة</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
                inputMode="numeric"
                value={startPage}
                disabled={busy}
                onChange={(e) => setStartPage(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">إلى صفحة</span>
              <input
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:opacity-60"
                placeholder="مثال: 120"
                inputMode="numeric"
                value={endPage}
                disabled={busy}
                onChange={(e) => setEndPage(e.target.value)}
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">الصيغة</span>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.ready || busy}
                  onClick={() => setFormat(item.id)}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${
                    format === item.id
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white hover:border-slate-400'
                  }`}
                >
                  {item.label}
                  {!item.ready && (
                    <span className="ms-1 text-xs opacity-70">قريبًا</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={detectPages}
              disabled={busy}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium transition hover:border-slate-400 disabled:opacity-60"
            >
              {status === 'detecting' ? 'جارٍ الفحص…' : 'كشف عدد الصفحات'}
            </button>
            <button
              type="button"
              onClick={startExport}
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {status === 'running' ? 'جارٍ التحميل…' : 'تنزيل'}
            </button>
            {status === 'running' && (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
                إلغاء
              </button>
            )}
          </div>
        </section>

        {progress && (
          <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                صفحة {progress.currentPageId} من {progress.total}
              </span>
              <span className="tabular-nums text-slate-500">{percent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-slate-900 transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">
              تم جلب {progress.fetched} صفحة
              {progress.failed > 0 && ` · فشل ${progress.failed}`}
            </p>
          </section>
        )}

        {message && (
          <p
            className={`rounded-lg border px-4 py-3 text-sm ${
              status === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : status === 'done'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {message}
          </p>
        )}

        <p className="text-xs leading-relaxed text-slate-400">
          يعمل التطبيق عبر وكيل تطوير فقط. عند بناء نسخة الإنتاج لن يكون هناك مسار
          بيانات، لأن المكتبة لا تسمح بالطلبات المباشرة من المتصفح.
        </p>
      </main>
    </div>
  )
}

export default App
