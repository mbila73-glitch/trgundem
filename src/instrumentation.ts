const FIFTEEN_MIN_MS = 15 * 60 * 1000;
let schedulerStarted = false;
const NODE_BIN = '/home/metinqty/nodevenv/trgundem/22/bin/node';
const SCRIPT = '/home/metinqty/trgundem/scripts/pipeline-cron-hosting.js';

export async function register(): Promise<void> {
  if (typeof window !== 'undefined') return;
  if (schedulerStarted) return;
  schedulerStarted = true;
  console.log('[pipeline-scheduler] Kuruldu — 60s sonra ilk cycle, sonra her 15dk');
  
  setTimeout(() => {
    const trigger = () => {
      try {
        const { spawn } = require('node:child_process');
        const child = spawn(NODE_BIN, [SCRIPT, '--once'], {
          cwd: '/home/metinqty/trgundem',
          detached: true,
          stdio: 'ignore',
          shell: false,
        });
        child.unref();
        console.log(`[pipeline-scheduler] Cycle tetiklendi (${new Date().toISOString()})`);
      } catch (e) {
        console.warn(`[pipeline-scheduler] Hata: ${(e as Error).message}`);
      }
    };
    trigger();
    setInterval(trigger, FIFTEEN_MIN_MS);
  }, 60_000);
}
