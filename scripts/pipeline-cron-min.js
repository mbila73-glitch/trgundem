var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// scripts/pipeline-cron.ts
var exports_pipeline_cron = {};
__export(exports_pipeline_cron, {
  runCycle: () => runCycle
});
module.exports = __toCommonJS(exports_pipeline_cron);
var import_node_child_process = require("node:child_process");
var import_node_util = require("node:util");
var import_promises = require("node:fs/promises");
var import_client = require("@prisma/client");
var db = new import_client.PrismaClient;
var execAsync = import_node_util.promisify(import_node_child_process.exec);
var ONE_MINUTE_MS = 60000;
var STATUS_FILE = `${process.cwd()}/pipeline-status.json`;
var currentStage = "idle";
async function writeStatus(s) {
  try {
    let current = null;
    try {
      const raw = await import_promises.readFile(STATUS_FILE, "utf8");
      current = JSON.parse(raw);
    } catch {}
    const merged = {
      stage: s.stage ?? current?.stage ?? "idle",
      startedAt: s.startedAt ?? current?.startedAt ?? new Date().toISOString(),
      finishedAt: s.finishedAt ?? current?.finishedAt ?? null,
      rssRead: s.rssRead !== undefined ? s.rssRead : current?.rssRead ?? null,
      duplicatesFound: s.duplicatesFound !== undefined ? s.duplicatesFound : current?.duplicatesFound ?? null,
      summariesDone: s.summariesDone !== undefined ? s.summariesDone : current?.summariesDone ?? null,
      publishedCount: s.publishedCount !== undefined ? s.publishedCount : current?.publishedCount ?? null,
      error: s.error ?? current?.error ?? null
    };
    await import_promises.writeFile(STATUS_FILE, JSON.stringify(merged, null, 2), "utf8");
  } catch {}
}
function log(msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${msg}`);
}
async function runStep(name, cmd) {
  log(`▶ ${name} başlatılıyor: ${cmd}`);
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: process.cwd(),
      maxBuffer: 50 * 1024 * 1024
    });
    log(`✓ ${name} tamam`);
    if (stderr) {
      const filtered = stderr.split(`
`).filter((l) => !l.startsWith("prisma:query")).join(`
`).trim();
      if (filtered)
        console.log(`  stderr: ${filtered.slice(0, 500)}`);
    }
    return { ok: true, stdout, stderr };
  } catch (e) {
    const err = e;
    log(`✗ ${name} hata: ${err.message}`);
    if (err.stderr) {
      const filtered = err.stderr.split(`
`).filter((l) => !l.startsWith("prisma:query")).join(`
`).trim();
      if (filtered)
        console.log(`  stderr: ${filtered.slice(0, 500)}`);
    }
    return { ok: false, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}
async function runCycle() {
  log(`=== Cycle başlatıldı (saat ${new Date().toLocaleTimeString("tr-TR")}) ===`);
  await writeStatus({
    stage: "archive-stale",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    rssRead: 0,
    duplicatesFound: 0,
    summariesDone: 0,
    publishedCount: null,
    error: null
  });
  currentStage = "archive-stale";
  try {
    const r = await db.publishedArticle.deleteMany({
      where: { status: "draft" }
    });
    if (r.count > 0) {
      log(`  ✓ Cancel: ${r.count} yarı kalmış draft silindi (yeni cycle için temiz başlangıç)`);
    }
  } catch (e) {
    log(`  ✗ Cancel hatası: ${e.message}`);
  }
  currentStage = "refresh";
  await writeStatus({ stage: "refresh" });
  {
    const r = await runStep("RSS refresh", "bun run scripts/trigger-refresh.ts");
    const m = r.stdout.match(/İşlenen kaynak:\s*(\d+)/);
    const rssRead = m ? parseInt(m[1], 10) : 0;
    await writeStatus({ rssRead });
  }
  currentStage = "build-icerik";
  await writeStatus({ stage: "build-icerik" });
  await runStep("rss_icerik.md", "bun run scripts/build-rss-icerik.ts");
  currentStage = "build-kaynak-sayi";
  await writeStatus({ stage: "build-kaynak-sayi" });
  {
    const r = await runStep("rss_kaynak_sayi.md", "python3 scripts/find-duplicate-news.py");
    let dupCount = 0;
    const m = r.stdout.match(/(\d+)\s*(?:farklı\s*)?(?:haber\s*)?(?:grup|kayıt)/i);
    if (m)
      dupCount = parseInt(m[1], 10);
    else {
      try {
        const content = await import_promises.readFile(`${process.cwd()}/download/rss_kaynak_sayi.md`, "utf8");
        dupCount = (content.match(/^##\s/gm) ?? []).length;
      } catch {}
    }
    await writeStatus({ duplicatesFound: dupCount });
  }
  currentStage = "build-ozet";
  await writeStatus({ stage: "build-ozet" });
  {
    const r = await runStep("rss_ozet.md (AI paraphrase + auto-publish)", "bun run scripts/build-rss-ozet.ts");
    const summaryMatch = r.stdout.match(/(\d+)\s*yeni\s*AI\s*özet/i);
    const summariesDone = summaryMatch ? parseInt(summaryMatch[1], 10) : 0;
    await writeStatus({ summariesDone });
  }
  const MAX_PER_CATEGORY = 30;
  const ALL_CATEGORIES = [
    "Güncel",
    "Kamu / Resmi",
    "Ekonomi / Finans",
    "Spor / Magazin",
    "Bilim / Teknoloji",
    "Kültür / Sanat"
  ];
  for (const cat of ALL_CATEGORIES) {
    try {
      const catCount = await db.publishedArticle.count({
        where: { status: "published", category: cat }
      });
      if (catCount > MAX_PER_CATEGORY) {
        const toDelete = catCount - MAX_PER_CATEGORY;
        const oldest = await db.publishedArticle.findMany({
          where: { status: "published", category: cat },
          orderBy: { publishedAt: "asc" },
          take: toDelete,
          select: { id: true }
        });
        if (oldest.length > 0) {
          const r = await db.publishedArticle.deleteMany({
            where: { id: { in: oldest.map((o) => o.id) } }
          });
          log(`  ✓ Max 30 [${cat}]: ${r.count} en eski haber silindi (${catCount} → ${catCount - r.count})`);
        }
      }
    } catch (e) {
      log(`  ✗ Max 30 [${cat}] hatası: ${e.message}`);
    }
  }
  try {
    const publishedCount = await db.publishedArticle.count({ where: { status: "published" } });
    if (publishedCount > 50) {
      const toDelete = publishedCount - 50;
      const oldest = await db.publishedArticle.findMany({
        where: { status: "published" },
        orderBy: { publishedAt: "asc" },
        take: toDelete,
        select: { id: true, aiTitle: true }
      });
      if (oldest.length > 0) {
        const r = await db.publishedArticle.deleteMany({
          where: { id: { in: oldest.map((o) => o.id) } }
        });
        log(`  ✓ Max 50 (total): ${r.count} en eski haber silindi (${publishedCount} → ${publishedCount - r.count})`);
      }
    }
    const finalPublished = await db.publishedArticle.count({ where: { status: "published" } });
    await writeStatus({ publishedCount: finalPublished });
  } catch (e) {
    log(`  ✗ Max 50 (total) hatası: ${e.message}`);
  }
  currentStage = "idle";
  await writeStatus({ stage: "done", finishedAt: new Date().toISOString() });
  log(`=== Cycle tamam ===`);
}
async function tick() {
  const now = new Date;
  const minute = now.getMinutes();
  if (minute % 15 === 0) {
    if (currentStage !== "idle") {
      log(`Tick skipped (stage: ${currentStage}) — önceki cycle hala çalışıyor`);
      return;
    }
    await runCycle();
  }
}
async function main() {
  const isOnce = process.argv.includes("--once");
  if (isOnce) {
    log(`Tek seferlik cycle başlatılıyor (manuel tetikleme)…`);
    await runCycle();
    await db.$disconnect();
    process.exit(0);
  }
  log(`Pipeline cron başlatıldı. PID: ${process.pid}`);
  log(`Saat dilimi: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  log(`Tetikleme saatleri:`);
  log(`  • :00 — cycle başlat (RSS refresh + pipeline + her 3 draft'ta bir publish)`);
  log(`  • :30 — yeni cycle`);
  log(`Kurallar:`);
  log(`  - En yüksek kaynak sayısından başla özetlemeye`);
  log(`  - Her 3 hazır draft'ta bir publish yap (draft → published)`);
  log(`  - Aynı sourceArticleIds hash varsa: eskisini archived, yenisini published`);
  log(`  - Güncellenmeyen haberler sayfada kalsın (stale'leri geri published yap)`);
  log(`Bekleniyor…`);
  setInterval(() => {
    tick().catch((e) => log(`Tick hatası: ${e.message}`));
  }, ONE_MINUTE_MS);
  setTimeout(() => {
    tick().catch((e) => log(`İlk tick hatası: ${e.message}`));
  }, 5000);
  process.on("SIGTERM", () => {
    log("SIGTERM alındı, çıkılıyor…");
    process.exit(0);
  });
  process.on("SIGINT", () => {
    log("SIGINT alındı, çıkılıyor…");
    process.exit(0);
  });
}
var isMain = (() => {
  const arg0 = process.argv[1] ?? "";
  return arg0.endsWith("pipeline-cron.ts") || arg0.endsWith("pipeline-cron");
})();
if (isMain) {
  main().catch((e) => {
    console.error("Cron hatası:", e);
    process.exit(1);
  });
}
