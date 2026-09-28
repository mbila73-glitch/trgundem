import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { refreshSource, getRefreshStatus } from '@/lib/rss';

// GET /api/feeds/refresh  -> current refresh status (dev-server-local)
export async function GET() {
  return NextResponse.json(getRefreshStatus());
}

// POST /api/feeds/refresh?sourceId=...  -> single source refresh (sync)
// POST /api/feeds/refresh                 -> spawn a detached background refresh script
export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sourceId = sp.get('sourceId');

  if (sourceId) {
    try {
      const result = await refreshSource(sourceId);
      return NextResponse.json({ results: [result] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Spawn a fully detached bun script via setsid so it survives parent death.
  // The dev server stays responsive and won't be affected by the long-running refresh.
  const scriptPath = resolve(process.cwd(), 'scripts/trigger-refresh.ts');
  const logPath = resolve(process.cwd(), 'scripts/refresh.log');
  const child = spawn(
    'setsid',
    ['bash', '-c', `exec bun run ${scriptPath} > ${logPath} 2>&1`],
    {
      detached: true,
      stdio: 'ignore',
      cwd: process.cwd(),
    },
  );
  child.unref();

  return NextResponse.json(
    {
      ok: true,
      message: 'Arka plan yenilemesi başlatıldı',
      childPid: child.pid,
    },
    { status: 202 },
  );
}
