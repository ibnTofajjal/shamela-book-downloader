import { useRef, useState } from "react";
import { collectPages } from "@/lib/export-book";
import type { ExportProgress } from "@/lib/export-book";
import { downloadDoc } from "@/lib/export-doc";
import { printPdf } from "@/lib/export-pdf";
import { countPages, fetchBookMeta } from "@/lib/shamela";

const FORMATS = [
  { id: "doc", label: "Word", ready: true },
  { id: "pdf", label: "PDF", ready: true },
] as const;

type Status = "idle" | "detecting" | "running" | "done" | "error";

/* Retro-Windows surfaces: 2px bevels, hairline borders, zero radii. `bevel-in`
   on :active is what makes a button read as physically pressed. */
const LABEL = "block text-[11px] font-bold text-[#202020]";
const FIELD =
  "bevel-in w-full bg-white px-2 py-1.5 text-sm outline-none disabled:bg-chrome disabled:text-[#808080] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-dotted";
const BUTTON =
  "bevel-out active:bevel-in bg-chrome px-3 py-1.5 text-xs font-bold disabled:text-[#808080] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-dotted";

/* Decorative chrome, not controls. */
const WIN_GLYPHS = ["─", "□", "✕"];
const MENUS = ["ملف", "تحرير", "عرض", "مساعدة"];
const STATUS_TEXT: Record<Status, string> = {
  idle: "جاهز",
  detecting: "جارٍ الفحص",
  running: "جارٍ التحميل",
  done: "اكتمل",
  error: "خطأ",
};

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
    <label className="flex flex-col gap-1">
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

      if (format === "pdf") {
        // Opens the print dialog; the user picks "Save as PDF". print() blocks
        // until that dialog closes, so any message set after it here is only
        // painted once the dialog is already gone -- hence the on-screen hint.
        await printPdf(meta.title, result.pages);
      } else {
        downloadDoc(meta.title, result.pages);
      }

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
    <div className="desktop-bg min-h-dvh font-retro text-black">
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-2 px-3 py-4">
        {/* Ticker. Content travels start-to-end, which for RTL means it
            enters from the left edge. */}
        <div className="bevel-out overflow-hidden bg-caption px-1 py-0.5">
          <div className="marquee-track font-digits text-[11px] font-bold text-link">
            ★ أهلاً وسهلاً ★ الأداة الأمثل لتنزيل صفحات الكتب من المكتبة الشاملة
            ★ يُفضَّل عرضها بدقة 800×600 ★ Best viewed with any browser ★
          </div>
        </div>

        {/* Faux application window. */}
        <div className="bevel-out flex flex-1 flex-col bg-chrome">
          <div className="titlebar flex items-center gap-2 px-2 py-1 text-white">
            <span aria-hidden className="font-digits text-xs">
              ▣
            </span>
            <span className="flex-1 truncate text-xs font-bold">
              shamela-book-downloader
            </span>
            <span aria-hidden className="flex gap-1">
              {WIN_GLYPHS.map((g) => (
                <span
                  key={g}
                  className="bevel-out flex h-4 w-4 items-center justify-center bg-chrome font-digits text-[9px] leading-none text-black"
                >
                  {g}
                </span>
              ))}
            </span>
          </div>

          <div className="flex gap-1 border-b border-[#808080] px-1 py-0.5 text-[11px]">
            {MENUS.map((m) => (
              <span key={m} className="px-2 py-0.5 font-bold">
                {m}
              </span>
            ))}
          </div>

          <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4">
            <header className="flex flex-col items-center gap-1">
              <h1 className="text-extrude text-center text-xl font-bold text-[#000080] sm:text-2xl">
                تنزيل الكتب من المكتبة الشاملة
              </h1>
              <p className="text-center text-[11px] text-[#303030]">
                الصّفحات من نطاق محدد إلى ملف جاهز للتنزيل.
              </p>
            </header>

            <section className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="رقم الكتاب"
                  value={bookId}
                  onChange={setBookId}
                  disabled={busy}
                />
                <div className="flex flex-col justify-end">
                  {bookTitle ? (
                    <div className="bevel-in bg-white px-2 py-1.5">
                      <div
                        className="truncate text-sm font-bold"
                        title={bookTitle}
                      >
                        {bookTitle}
                </div>
                {format === "pdf" && (
                  <p className="text-[10px] text-[#303030]">
                    سيفتح نافذة الطباعة — اختر «حفظ كـ PDF» لحفظ الملف.
                  </p>
                )}
              </div>
                  ) : (
                    <div className="bevel-in flex items-center gap-1.5 bg-white px-2 py-1.5">
                      <span className="font-digits text-[10px] text-[#808080]">
                        ▸
                      </span>
                      <span className="text-[11px] text-[#808080]">
                        لم يتم الجلب بعد
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
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

              <div className="flex flex-col gap-1">
                <span className={LABEL}>الصيغة</span>
                <div className="flex flex-wrap gap-2">
                  {FORMATS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={!item.ready || busy}
                      onClick={() => setFormat(item.id)}
                      className={`active:bevel-in px-3 py-1.5 text-xs font-bold focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-dotted ${
                        format === item.id
                          ? "bevel-in bg-[#000080] text-white"
                          : "bevel-out bg-chrome hover:bg-[#d6d2c8]"
                      } disabled:text-[#808080]`}
                    >
                      {item.label}
                      {!item.ready && (
                        <span className="ms-1 text-[10px] opacity-70">
                          قريبًا
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={detectPages}
                  disabled={busy}
                  className={BUTTON}
                >
                  {status === "detecting" ? "جارٍ الفحص…" : "كشف عدد الصفحات"}
                </button>
                <button
                  type="button"
                  onClick={startExport}
                  disabled={busy}
                  className={`${BUTTON} px-5 py-1.5 text-sm text-white`}
                  style={{
                    background:
                      "linear-gradient(180deg, #5a92ff 0%, #2040d8 100%)",
                  }}
                >
                  {status === "running" ? "جارٍ التحميل…" : "تنزيل"}
                </button>
                {status === "running" && (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className={BUTTON}
                  >
                    إلغاء
                  </button>
                )}
              </div>
            </section>

            {progress && (
              <section className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span>
                    صفحة {progress.currentPageId} من {progress.total}
                  </span>
                  <span className="font-digits tabular-nums">{percent}%</span>
                </div>
                <div className="bevel-in h-6 w-full bg-chrome p-[2px]">
                  <div
                    className="relative h-full"
                    style={{ width: `${percent}%` }}
                  >
                    <div className="progress-fill absolute inset-0" />
                    <div className="progress-blocks absolute inset-0" />
                  </div>
                </div>
                <p className="text-[10px] text-[#303030]">
                  تم جلب {progress.fetched} صفحة
                  {progress.failed > 0 && ` · فشل ${progress.failed}`}
                </p>
              </section>
            )}

            {message && (
              <div className="bevel-out flex items-start gap-2 bg-chrome p-2 text-xs">
                <span
                  aria-hidden
                  className="bevel-in flex h-4 w-4 shrink-0 items-center justify-center bg-chrome font-digits text-[10px] font-bold"
                >
                  {status === "error" ? "!" : "i"}
                </span>
                <span className="pt-px leading-relaxed">{message}</span>
              </div>
            )}

            <p className="text-[10px] leading-relaxed text-[#202020]">
              يعمل التطبيق عبر وكيل تطوير فقط. عند بناء نسخة الإنتاج لن يكون
              هناك مسار بيانات، لأن المكتبة لا تسمح بالطلبات المباشرة من
              المتصفح.
            </p>
          </div>

          <div className="flex items-center gap-1 px-1 pb-1">
            <div className="bevel-in flex-1 bg-chrome px-2 py-0.5 text-[10px] font-bold">
              {STATUS_TEXT[status]}
            </div>
            <div className="bevel-in w-16 bg-chrome px-2 py-0.5 text-center font-digits text-[10px] tabular-nums">
              {percent}%
            </div>
          </div>
        </div>

        <p className="text-center font-digits text-[10px] text-white/60">
          <span className="text-led">●</span>{" "}
          <a href="https://joynal.bintofajjal.com/">Joynal Bin Tofajjal</a>
        </p>
      </main>
    </div>
  );
}

export default App;
