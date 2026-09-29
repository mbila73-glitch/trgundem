// Pipeline cycle'ı tetikleyen API endpoint.
//
// Sandbox ortamında uzun süren background daemon'lar (setsid/nohup'a rağmen)
// 1-2 dakika içinde sessizce öldürülüyor. Bu yüzden pipeline'ı fire-and-forget
// modda çalıştırıyoruz: POST hemen 202 döner, cycle arka planda çalışır.
// Frontend (Restart sekmesi) GET /api/pipeline/status ile her 2 saniyede
// polling yaparak ilerlemeyi görür.
//
// Kullanım:
//   - POST /api/pipeline/run → cycle'ı arka planda başlatır, hemen 202 döner
//   - GET  /api/pipeline/run → durum
//   - GET  /api/pipeline/status → pipeline-status.json içeriği (Restart sekmesi polling)
//
// Otomatik tetikleme için external cron service (cron-job.org, uptime-robot,
// GitHub Actions cron, vb.) bu endpoint'i her :00 ve :30'da çağırabilir.

import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const PROJECT_ROOT = '/home/z/my-project';
const LOG_FILE = `${PROJECT_ROOT}/pipeline-once.log`;
const STATUS_FILE = `${PROJECT_ROOT}/pipeline-status.json`;

export async function POST() {
  const startedAt = new Date().toISOString();

  try {
    // Status dosyasını sıfırla (Restart sekmesinde "beklemede" durumdan başlasın)
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
    await import('node:fs/promises').then((m) => m.writeFile(STATUS_FILE, JSON.stringify(initialStatus, null, 2), 'utf8')).catch(() => {});

    // Log dosyasına başlangıç işareti
    const marker = `\n[${startedAt}] === API endpoint cycle tetikledi (fire-and-forget) ===\n`;
    await appendFile(LOG_FILE, marker, 'utf8').catch(() => {});

    // Fire-and-forget: detached subprocess, output log dosyasına
    // pipeline-cron.ts kendi içinde writeStatus() çağırır,
    // bu yüzden frontend status dosyasını polling ederek ilerlemeyi görür.
    const cmd = `bun run scripts/pipeline-cron.ts --once >> ${LOG_FILE} 2>&1`;
    const child = spawn('bash', ['-c', cmd], {
      cwd: PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PIPELINE_MODE: 'api-triggered' },
    });
    child.unref();

    return NextResponse.json({
      ok: true,
      message: 'Pipeline cycle arka planda başlatıldı',
      pid: child.pid,
      startedAt,
      statusEndpoint: '/api/pipeline/status',
      logFile: LOG_FILE,
    });
  } catch (e) {
    const err = e as Error;
    const finishedAt = new Date().toISOString();
    await appendFile(LOG_FILE, `[${finishedAt}] === Cycle başlatma HATASI: ${err.message} ===\n`, 'utf8').catch(() => {});

    return NextResponse.json(
      { ok: false, error: err.message, startedAt },
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
    schedule: 'Otomatik tetikleme: her :00 ve :30 dakikada bir (pipeline-cron.ts daemon).',
    manual: 'POST /api/pipeline/run — cycle hemen başlatır (fire-and-forget, arka planda çalışır).',
    statusEndpoint: 'GET /api/pipeline/status — canlı ilerleme (Restart sekmesi polling).',
    logFile: LOG_FILE,
    currentStatus,
    recentLog,
  });
}
