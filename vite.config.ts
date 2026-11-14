/**
 * Vite config. Owner: integrator.
 *
 * Dev server (`npm run dev`):
 * - Port from the environment variable PORT (default 5173). The port is strict: if it is busy,
 *   Vite stops with an error instead of moving to another port. Each lane has its own port
 *   (docs/lanes.md).
 * - The live service (docs/live-service.md): if `scripts/live.py` exists and nothing listens on
 *   127.0.0.1:8765 yet, it is started with `.venv/bin/python` (or `python3` when there is no
 *   .venv) and stopped with the dev server. If something already listens on 8765 (another lane's
 *   dev server started it), that one is used.
 * - `/api` is proxied to 127.0.0.1:8765, and the page gets `VITE_LIVE_API=/api/patch` whenever a
 *   service runs or was started. With no service, `VITE_LIVE_API` is '' so the page never calls a
 *   service that is not there (a failed request is a console error).
 * - An explicit `VITE_LIVE_API` in the environment wins, e.g. a hosted service, or '' to see the
 *   page with live fetching off.
 * - `SIMA_LIVE=off` skips the service entirely and forces `VITE_LIVE_API=''`. The smoke test uses
 *   it so it never depends on Python or NASA's archive.
 *
 * Build (`npm run build`): `VITE_LIVE_API` comes from the environment only. Empty or unset turns
 * live fetching off.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { defineConfig, type Plugin, type ProxyOptions } from 'vite';

const LIVE_HOST = '127.0.0.1';
const LIVE_PORT = 8765;
const LIVE_SCRIPT = 'scripts/live.py';
const LIVE_API = '/api/patch';

type LivePlan = { kind: 'start' | 'reuse' | 'off'; why: string };

/** True when something accepts a TCP connection on host:port within half a second. */
function listening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const done = (yes: boolean) => {
      socket.destroy();
      resolve(yes);
    };
    socket.setTimeout(500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function planLive(): Promise<LivePlan> {
  if (process.env.SIMA_LIVE === 'off') return { kind: 'off', why: 'SIMA_LIVE=off' };
  if (await listening(LIVE_HOST, LIVE_PORT)) {
    return { kind: 'reuse', why: `something already listens on ${LIVE_HOST}:${LIVE_PORT}` };
  }
  if (!existsSync(LIVE_SCRIPT)) return { kind: 'off', why: `${LIVE_SCRIPT} does not exist yet` };
  return { kind: 'start', why: `${LIVE_SCRIPT} exists and port ${LIVE_PORT} is free` };
}

/** Starts scripts/live.py next to the dev server and stops it with the server. */
function liveService(plan: LivePlan): Plugin {
  return {
    name: 'sima:live-service',
    apply: 'serve',
    configureServer(server) {
      const log = server.config.logger;
      if (plan.kind !== 'start') {
        log.info(`live service: ${plan.kind === 'reuse' ? 'using' : 'off,'} ${plan.why}`);
        return;
      }
      const python = existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3';
      const args = [LIVE_SCRIPT, '--host', LIVE_HOST, '--port', String(LIVE_PORT)];
      const child = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stopping = false;
      const relay = (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n'))
          if (line.trim()) log.info(`[live] ${line}`);
      };
      child.stdout?.on('data', relay);
      child.stderr?.on('data', relay);
      child.on('error', (err) => log.warn(`live service: could not run ${python}: ${err.message}`));
      child.on('exit', (code, signal) => {
        if (!stopping) log.warn(`live service: stopped by itself (code ${code}, signal ${signal})`);
      });
      const stop = () => {
        stopping = true;
        if (child.exitCode === null && child.signalCode === null) child.kill();
      };
      server.httpServer?.once('close', stop);
      process.once('exit', stop);
      log.info(`live service: started ${python} ${args.join(' ')}`);
    },
  };
}

export default defineConfig(async ({ command }) => {
  const live: LivePlan =
    command === 'serve' ? await planLive() : { kind: 'off', why: 'not the dev server' };

  if (command === 'serve') {
    // Vite reads VITE_* variables from process.env after this function returns.
    if (live.kind === 'off' && process.env.SIMA_LIVE === 'off') process.env.VITE_LIVE_API = '';
    process.env.VITE_LIVE_API ??= live.kind === 'off' ? '' : LIVE_API;
  }

  const proxy: Record<string, ProxyOptions> = {
    '/api': { target: `http://${LIVE_HOST}:${LIVE_PORT}` },
  };

  return {
    plugins: [liveService(live)],
    server: { port: Number(process.env.PORT) || 5173, strictPort: true, proxy },
    preview: { port: Number(process.env.PORT) || 4173, strictPort: true, proxy },
    build: {
      // aladin-lite (the sky) is one 2.3 MB module; anything else this big is a mistake.
      chunkSizeWarningLimit: 2600,
    },
  };
});
