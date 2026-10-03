import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { appendFile, readFile, writeFile, openSync } from 'node:fs/promises';
import { existsSync, openSync as openSyncSync } from 'node:fs';

const LOG_FILE = '/var/www/pipeline-once.log';
const STATUS_FILE = '/var/www/pipeline-status.json';
const SPAWN_LOG = '/var/www/pipeline-spawn.log';
const NODE_BIN = '/usr/bin/node';
const SCRIPT = '/var/www/scripts/pipeline-all.js';

export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    await writeFile(STATUS_FILE, JSON.stringify({ stage: 'triggered', startedAt, finishedAt: null, message: 'Pipeline Admin Tarafından Başlatıldı' }, null, 2), 'utf8').catch(() => {});
    await appendFile(LOG_FILE, `\n[${startedAt}] === Pipeline Tetiklendi ===\n`, 'utf8').catch(() => {});

    // Spawn — çıktıyı log dosyasına yaz
    const out = openSyncSync(SPAWN_LOG, 'a');
    const err = openSyncSync(SPAWN_LOG, 'a');
    const child = spawn(NODE_BIN, ['--expose-gc', SCRIPT, '--once'], {
      cwd: '/var/www',
      detached: true,
      stdio: ['ignore', out, err],
      shell: false,
      env: { ...process.env, PIPELINE_TRIGGERED: 'admin', HOME: '/root' }
    });
    child.unref();

    child.on('error', async (err) => {
      await writeFile(STATUS_FILE, JSON.stringify({ stage: 'error', startedAt, error: err.message, finishedAt: new Date().toISOString() }, null, 2), 'utf8').catch(() => {});
    });

    return NextResponse.json({ ok: true, message: 'Pipeline Başlatıldı', pid: child.pid, startedAt });
  } catch (e) {
    const err = e as Error;
    await writeFile(STATUS_FILE, JSON.stringify({ stage: 'error', startedAt, error: err.message, finishedAt: new Date().toISOString() }, null, 2), 'utf8').catch(() => {});
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function GET() {
  let recentLog = '';
  if (existsSync(LOG_FILE)) {
    try { recentLog = (await readFile(LOG_FILE, 'utf8')).split('\n').filter(Boolean).slice(-30).join('\n'); } catch {}
  }
  let currentStatus = null;
  if (existsSync(STATUS_FILE)) {
    try { currentStatus = JSON.parse(await readFile(STATUS_FILE, 'utf8')); } catch {}
  }
  return NextResponse.json({ ok: true, currentStatus, recentLog });
}
