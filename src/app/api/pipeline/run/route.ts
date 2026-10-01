import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const LOG_FILE = `${process.cwd()}/pipeline-once.log`;
const STATUS_FILE = `${process.cwd()}/pipeline-status.json`;
const NODE_BIN = '/home/metinqty/nodevenv/trgundem/22/bin/node';

export async function POST() {
  const startedAt = new Date().toISOString();
  try {
    await writeFile(STATUS_FILE, JSON.stringify({ stage: 'archive-stale', startedAt, finishedAt: null, rssRead: 0, duplicatesFound: 0, summariesDone: 0, publishedCount: null, error: null }, null, 2), 'utf8').catch(() => {});
    await appendFile(LOG_FILE, `\n[${startedAt}] === Pipeline tetiklendi ===\n`, 'utf8').catch(() => {});
    
    // spawn node — shell:false ile bash/sh gerekmez
    const child = spawn(NODE_BIN, ['scripts/pipeline-cron-hosting.js', '--once'], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      shell: false,
    });
    child.unref();
    
    return NextResponse.json({ ok: true, message: 'Pipeline başlatıldı', pid: child.pid, startedAt });
  } catch (e) {
    const err = e as Error;
    await writeFile(STATUS_FILE, JSON.stringify({ stage: 'error', startedAt, error: err.message }, null, 2), 'utf8').catch(() => {});
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
