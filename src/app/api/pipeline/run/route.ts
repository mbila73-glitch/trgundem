// Pipeline cycle'ı tetikleyen API endpoint.
//
// Sandbox'ta fire-and-forget subprocess'ler ölüyor (setsid/nohup'a rağmen).
// Bu yüzden inline exec kullanıyoruz — subprocess Next.js dev server içinde yaşar.
// cycle 5-10 dk sürebilir, request açık kalır, ama pipeline-cron.ts her aşamada
// pipeline-status.json dosyasına yazar, frontend (Restart sekmesi) bu dosyayı
// her 2 saniyede polling ederek canlı ilerleme görür.
//
// Kullanım:
//   - POST /api/pipeline/run → cycle'ı inline çalıştırır, request cycle bitene kadar açık kalır
//   - GET  /api/pipeline/run → durum
//   - GET  /api/pipeline/status → pipeline-status.json içeriği (Restart sekmesi polling)

import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const execAsync = promisify(exec);
const PROJECT_ROOT = '/home/z/my-project';
const LOG_FILE = `${PROJECT_ROOT}/pipeline-once.log`;
const STATUS_FILE = `${PROJECT_ROOT}/pipeline-status.json`;

export async function POST() {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  try {
    // Status dosyasını sıfırla (Restart sekmesinde "beklemede" durumundan başlasın)
    const initialStatus = {
      stage: 'archive-stale',
      startedAt,
      finishedAt: null,
      rssRead: 0,
      duplicatesFound: 0,
      summariesDone: 0,
      publishedCount: null,
      error: null,
    };
    await writeFile(STATUS_FILE, JSON.stringify(initialStatus, null, 2), 'utf8').catch(() => {});

    const marker = `\n[${startedAt}] === API endpoint cycle tetikledi (inline exec) ===\n`;
    await appendFile(LOG_FILE, marker, 'utf8').catch(() => {});

    // Inline exec — subprocess Next.js içinde yaşar, sandbox öldürmez
    // pipeline-cron.ts her aşamada status dosyasına yazar,
    // frontend polling ile ilerlemeyi görür.
    const { stdout, stderr } = await execAsync(
      'bun run scripts/pipeline-cron.ts --once',
      {
        cwd: PROJECT_ROOT,
        maxBuffer: 100 * 1024 * 1024, // 100 MB
        timeout: 15 * 60 * 1000, // 15 dakika (AI özetleme uzun sürebilir)
      },
    );

    const elapsedMs = Date.now() - startMs;
    const finishedAt = new Date().toISOString();

    if (stdout) {
      await appendFile(LOG_FILE, stdout + '\n', 'utf8').catch(() => {});
    }
    if (stderr) {
      const filtered = stderr
        .split('\n')
        .filter((l) => !l.startsWith('prisma:query'))
        .join('\n')
        .trim();
      if (filtered) {
        await appendFile(LOG_FILE, `[stderr] ${filtered}\n`, 'utf8').catch(() => {});
      }
    }

    await appendFile(LOG_FILE, `[${finishedAt}] === Cycle tamamlandı (${elapsedMs}ms) ===\n`, 'utf8').catch(() => {});

    return NextResponse.json({
      ok: true,
      message: 'Pipeline cycle tamamlandı',
      startedAt,
      finishedAt,
      elapsedMs,
      stdout: stdout.slice(-2000),
    });
  } catch (e) {
    const elapsedMs = Date.now() - startMs;
    const err = e as Error & { stdout?: string; stderr?: string };
    const finishedAt = new Date().toISOString();

    await appendFile(LOG_FILE, `[${finishedAt}] === Cycle HATASI: ${err.message} (${elapsedMs}ms) ===\n`, 'utf8').catch(() => {});
    if (err.stdout) {
      await appendFile(LOG_FILE, err.stdout + '\n', 'utf8').catch(() => {});
    }
    if (err.stderr) {
      const filtered = err.stderr
        .split('\n')
        .filter((l) => !l.startsWith('prisma:query'))
        .join('\n')
        .trim();
      if (filtered) {
        await appendFile(LOG_FILE, `[stderr] ${filtered}\n`, 'utf8').catch(() => {});
      }
    }

    // Status dosyasına da hatayı yaz
    await writeFile(STATUS_FILE, JSON.stringify({
      stage: 'error',
      startedAt,
      finishedAt,
      rssRead: null,
      duplicatesFound: null,
      summariesDone: null,
      publishedCount: null,
      error: err.message,
    }, null, 2), 'utf8').catch(() => {});

    return NextResponse.json(
      {
        ok: false,
        error: err.message,
        startedAt,
        finishedAt,
        elapsedMs,
        stdout: err.stdout?.slice(-2000),
        stderr: err.stderr?.slice(-2000),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  let recentLog = '';
  if (existsSync(LOG_FILE)) {
    try {
      const content = await readFile(LOG_FILE, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      recentLog = lines.slice(-50).join('\n');
    } catch {
      recentLog = '';
    }
  }

  let currentStatus: unknown = null;
  if (existsSync(STATUS_FILE)) {
    try {
      const raw = await readFile(STATUS_FILE, 'utf8');
      currentStatus = JSON.parse(raw);
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    ok: true,
    schedule: 'Otomatik: her 10 dakikada bir (00, 10, 20, 30, 40, 50). pipeline-cron.ts daemon.',
    manual: 'POST /api/pipeline/run — cycle hemen başlatır (inline exec, request açık kalır).',
    statusEndpoint: 'GET /api/pipeline/status — canlı ilerleme (Restart sekmesi polling).',
    logFile: LOG_FILE,
    currentStatus,
    recentLog,
  });
}
