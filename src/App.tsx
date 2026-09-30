import { useRef, useState } from "react";
import { collectPages } from "@/lib/export-book";
import type { ExportProgress } from "@/lib/export-book";
import { downloadDoc } from "@/lib/export-doc";
import { countPages, fetchBookMeta } from "@/lib/shamela";

const FORMATS = [{ id: "doc", label: "Word", ready: true }] as const;

type Status = "idle" | "detecting" | "running" | "done" | "error";

/* Shared brutalist surfaces. Every raised element carries a hard offset shadow;
   each interactive state walks the element into its own shadow. */
const LABEL = "text-xs font-black tracking-widest";
const FIELD =
  "w-full border-4 border-ink bg-white px-4 py-3 text-lg font-black shadow-brut-sm outline-none placeholder:font-bold placeholder:text-ink/30 focus:-translate-x-[3px] focus:translate-y-[3px] focus:shadow-none disabled:opacity-50";
const BUTTON =
  "border-4 border-ink px-5 py-3 text-sm font-black shadow-brut hover:shadow-brut-lg active:-translate-x-[5px] active:translate-y-[5px] active:shadow-none disabled:pointer-events-none disabled:opacity-40";

function NumberField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className={LABEL}>{label}</span>
      <input
        className={FIELD}
        inputMode="numeric"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function toInt(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function App() {
  const [bookId, setBookId] = useState("30089");
  const [startPage, setStartPage] = useState("1");
  const [endPage, setEndPage] = useState("");
  const [format, setFormat] = useState<(typeof FORMATS)[number]["id"]>("doc");

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const busy = status === "running" || status === "detecting";

  async function detectPages() {
    const id = toInt(bookId);
    if (!id) {
      setStatus("error");
      setMessage("أدخل رقم الكتاب صحيحًا.");
      return;
    }

    setStatus("detecting");
    setMessage("جارٍ جلب بيانات الكتاب…");

    try {
      const meta = await fetchBookMeta(id);
      setBookTitle(meta.title);

      setMessage("جارٍ البحث عن عدد الصفحات…");
      const total = await countPages(id);

      setEndPage(String(total));
      setStatus("idle");
      setMessage(`عدد صفحات الكتاب: ${total}`);
    } catch (err) {
      setStatus("error");
      setMessage(
        err instanceof Error ? err.message : "تعذّر الاتصال بالمكتبة.",
      );
    }
  }

  async function startExport() {
    const id = toInt(bookId);
    const from = toInt(startPage);
    const to = toInt(endPage);
    if (!id || !from || !to) {
      setStatus("error");
      setMessage("أدخل رقم الكتاب ونطاق الصفحات بشكل صحيح.");
      return;
    }
    if (from > to) {
      setStatus("error");
      setMessage("صفحة البداية أكبر من صفحة النهاية.");
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("running");
    setProgress(null);
    setMessage("جارٍ التحضير…");

    try {
      const meta = await fetchBookMeta(id, controller.signal);
      setBookTitle(meta.title);

      const result = await collectPages(
        id,
        from,
        to,
        setProgress,
        controller.signal,
      );

      if (result.pages.length === 0) {
        setStatus("error");
        setMessage("لم يتم العثور على أي صفحات في هذا النطاق.");
        return;
      }

      downloadDoc(meta.title, result.pages);

      const notes: string[] = [`تم تصدير ${result.pages.length} صفحة`];
      if (result.failedPageIds.length > 0) {
        notes.push(`فشلت ${result.failedPageIds.length} صفحة`);
      }
      if (result.stoppedAtEndOfBook) {
        notes.push("توقّف عند نهاية الكتاب");
      }
      setStatus("done");
      setMessage(notes.join(" — "));
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("idle");
        setMessage("أُلغيت العملية.");
        return;
      }
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
    } finally {
      abortRef.current = null;
    }
  }

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.fetched / progress.total) * 100))
      : 0;

  return (
    <div className="brut-grid min-h-dvh bg-paper font-display text-ink antialiased">
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-10 sm:py-14">
        <header className="flex flex-col gap-4">
          <h1 className="-rotate-1 self-start border-4 border-ink bg-sun px-6 py-4 text-2xl font-black tracking-tight shadow-brut-lg sm:text-3xl">
            تنزيل الكتب من المكتبة الشاملة
          </h1>
          <p className="self-start border-4 border-ink bg-white px-4 py-2 text-sm font-bold shadow-brut-sm">
            الصّفحات من نطاق محدد إلى ملف جاهز للتنزيل.
          </p>
        </header>

        <section className="flex flex-col gap-5 border-4 border-ink bg-white p-6 shadow-brut-lg sm:p-8">
          <NumberField
            label="رقم الكتاب"
            value={bookId}
            onChange={setBookId}
            disabled={busy}
          />

          {bookTitle && (
            <div className="flex flex-col gap-1 border-4 border-ink bg-blush px-4 py-3 shadow-brut-sm">
              <span className={LABEL}>الكتاب</span>
              <span className="text-base font-black">{bookTitle}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="من صفحة"
              value={startPage}
              onChange={setStartPage}
              disabled={busy}
            />
            <NumberField
              label="إلى صفحة"
              value={endPage}
              onChange={setEndPage}
              disabled={busy}
              placeholder="مثال: 120"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className={LABEL}>الصيغة</span>
            <div className="flex flex-wrap gap-3">
              {FORMATS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!item.ready || busy}
                  onClick={() => setFormat(item.id)}
                  className={`border-4 border-ink px-5 py-2.5 text-sm font-black ${
                    format === item.id
                      ? "-translate-x-[3px] translate-y-[3px] bg-ink text-sun shadow-none"
                      : "bg-white shadow-brut hover:shadow-brut-lg active:-translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                  } disabled:pointer-events-none disabled:opacity-40`}
                >
                  {item.label}
                  {!item.ready && (
                    <span className="ms-1 text-xs opacity-70">قريبًا</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t-4 border-ink pt-5">
            <button
              type="button"
              onClick={detectPages}
              disabled={busy}
              className={`${BUTTON} bg-mint`}
            >
              {status === "detecting" ? "جارٍ الفحص…" : "كشف عدد الصفحات"}
            </button>
            <button
              type="button"
              onClick={startExport}
              disabled={busy}
              className={`${BUTTON} bg-ink px-8 py-4 text-lg text-sun shadow-brut-lg active:-translate-x-[8px] active:translate-y-[8px]`}
            >
              {status === "running" ? "جارٍ التحميل…" : "تنزيل"}
            </button>
            {status === "running" && (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className={`${BUTTON} bg-white text-coral`}
              >
                إلغاء
              </button>
            )}
          </div>
        </section>

        {progress && (
          <section className="flex flex-col gap-3 border-4 border-ink bg-white p-6 shadow-brut">
            <div className="flex items-center justify-between text-sm font-black">
              <span>
                صفحة {progress.currentPageId} من {progress.total}
              </span>
              <span className="tabular-nums">{percent}%</span>
            </div>
            <div className="h-8 w-full overflow-hidden border-4 border-ink bg-paper">
              <div
                className="h-full bg-mint transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs font-bold">
              تم جلب {progress.fetched} صفحة
              {progress.failed > 0 && ` · فشل ${progress.failed}`}
            </p>
          </section>
        )}

        {message && (
          <p
            className={`border-4 border-ink px-5 py-4 text-sm font-bold shadow-brut ${
              status === "error" ? "bg-coral" : status === "done" ? "bg-mint" : "bg-white"
            }`}
          >
            {message}
          </p>
        )}

        <p className="border-4 border-ink bg-white px-5 py-4 text-xs font-bold leading-relaxed shadow-brut-sm">
          يعمل التطبيق عبر وكيل تطوير فقط. عند بناء نسخة الإنتاج لن يكون هناك
          مسار بيانات، لأن المكتبة لا تسمح بالطلبات المباشرة من المتصفح.
        </p>
      </main>
    </div>
  );
}

export default App;
