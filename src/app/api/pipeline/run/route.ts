// Pipeline cycle'ı tetikleyen API endpoint.
//
// Sandbox ortamında uzun süren background daemon'lar (setsid/nohup'a rağmen)
// 1-2 dakika içinde sessizce öldürülüyor. Bu yüzden pipeline'ı API route
// içinden child_process.exec ile çağırıyoruz — bu, cycle tamamlanana kadar
// (veya subprocess ölene kadar) request'i bekletir. Subprocess ölürse exec
// reject olur ve hata döner.
//
// Kullanım:
//   - POST /api/pipeline/run → cycle hemen başlar (inline, request bitene kadar bekler)
//   - GET  /api/pipeline/run → durum ve talimat
//
// Otomatik tetikleme için external cron service (cron-job.org, uptime-robot,
// GitHub Actions cron, vb.) bu endpoint'i her :00 ve :30'da çağırabilir.

import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const execAsync = promisify(exec);
const PROJECT_ROOT = '/home/z/my-project';
const LOG_FILE = `${PROJECT_ROOT}/pipeline-once.log`;

export async function POST() {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  try {
    // Önce log dosyasına başlangıç işareti yaz
    const marker = `\n[${startedAt}] === API endpoint cycle tetikledi (exec) ===\n`;
    await appendFile(LOG_FILE, marker, 'utf8').catch(() => {});

    // Inline exec — bu request cycle tamamlanana kadar açık kalır
    // maxBuffer yüksek, timeout 15 dk (AI özetleme uzun sürebilir)
    const { stdout, stderr } = await execAsync(
      'bun run scripts/pipeline-cron.ts --once',
      {
        cwd: PROJECT_ROOT,
        maxBuffer: 100 * 1024 * 1024, // 100 MB
        timeout: 15 * 60 * 1000, // 15 dakika
      },
    );

    const elapsedMs = Date.now() - startMs;
    const finishedAt = new Date().toISOString();

    // Subprocess'ın stdout'unu log dosyasına yaz
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

    await appendFile(LOG_FILE, `[${finishedAt}] === API endpoint cycle tamamlandı (${elapsedMs}ms) ===\n`, 'utf8').catch(() => {});

    return NextResponse.json({
      ok: true,
      message: 'Pipeline cycle tamamlandı',
      startedAt,
      finishedAt,
      elapsedMs,
      stdout: stdout.slice(-2000), // son 2KB
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

  return NextResponse.json({
    ok: true,
    schedule: 'Otomatik tetikleme: her :00 ve :30 dakikada bir (pipeline-cron.ts daemon).',
    manual: 'POST /api/pipeline/run — cycle hemen başlatır (inline, request bitene kadar bekler).',
    logFile: LOG_FILE,
    recentLog,
  });
}
