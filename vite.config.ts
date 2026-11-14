/**
 * Vite config. Owner: integrator.
 *
 * Dev server (`npm run dev`):
 * - Port from the environment variable PORT (default 5173). The port is strict: if it is busy,
 *   Vite stops with an error instead of moving to another port. Each lane has its own port
 *   (docs/lanes.md).
 * - The live service (docs/live-service.md): if something already listens on 127.0.0.1:8765
 *   (another lane's dev server started it), that one is used. Otherwise `scripts/live.py` is
 *   started with `.venv/bin/python` (or `python3` when there is no .venv), and the dev server
 *   waits up to 10 s for it to listen. It is stopped with the dev server.
 * - `/api` is proxied to 127.0.0.1:8765. The page gets `VITE_LIVE_API=/api/patch` only when the
 *   service listens. When it does not (no .venv, Astropy missing, live.py crashed), the dev server
 *   says why and the page gets `VITE_LIVE_API=''`, so it never calls a service that is not there
 *   (each failed request would be a console error).
 * - An explicit `VITE_LIVE_API` in the environment wins, e.g. a hosted service, or '' to see the
 *   page with live fetching off.
 * - `SIMA_LIVE=off` skips the service entirely and forces `VITE_LIVE_API=''`. The smoke test uses
 *   it so it never depends on Python or NASA's archive.
 *
 * Build (`npm run build`): `VITE_LIVE_API` comes from the environment only. Empty or unset turns
 * live fetching off. `npm run preview` serves the build with the same `/api` proxy.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { defineConfig, type Plugin, type ProxyOptions } from 'vite';

const LIVE_HOST = '127.0.0.1';
const LIVE_PORT = 8765;
const LIVE_SCRIPT = 'scripts/live.py';
const LIVE_API = '/api/patch';
/** How long the dev server waits for a freshly started live.py to listen. */
const LIVE_WAIT_MS = 10_000;

interface Live {
  /** True when something listens on LIVE_PORT. */
  up: boolean;
  /** What happened, in words, for the dev server's log. */
  why: string;
  /** The process this dev server started, to stop with it. */
  child: ChildProcess | null;
}

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

/** Uses a running live service, or starts scripts/live.py and waits for it to listen. */
async function startLive(): Promise<Live> {
  if (process.env.SIMA_LIVE === 'off')
    return { up: false, why: 'off (SIMA_LIVE=off)', child: null };
  if (await listening(LIVE_HOST, LIVE_PORT)) {
    return { up: true, why: `using the one already on ${LIVE_HOST}:${LIVE_PORT}`, child: null };
  }
  if (!existsSync(LIVE_SCRIPT)) {
    return { up: false, why: `off (${LIVE_SCRIPT} does not exist)`, child: null };
  }
  const python = existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3';
  const args = [LIVE_SCRIPT, '--host', LIVE_HOST, '--port', String(LIVE_PORT)];
  const child = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const tail: string[] = [];
  const relay = (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (!line.trim()) continue;
      console.log(`[live] ${line}`);
      tail.push(line);
      if (tail.length > 3) tail.shift();
    }
  };
  child.stdout?.on('data', relay);
  child.stderr?.on('data', relay);
  let failed = '';
  child.once('error', (err) => (failed = `could not run ${python}: ${err.message}`));
  child.once('exit', (code) => (failed ||= `${python} ${LIVE_SCRIPT} stopped (code ${code})`));

  const until = Date.now() + LIVE_WAIT_MS;
  while (!failed && Date.now() < until) {
    if (await listening(LIVE_HOST, LIVE_PORT)) {
      return { up: true, why: `started ${python} ${args.join(' ')}`, child };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (child.exitCode === null) child.kill();
  const reason = failed || `${LIVE_SCRIPT} did not listen within ${LIVE_WAIT_MS / 1000} s`;
  const hint = tail.length ? `: ${tail.join(' / ')}` : '';
  return {
    up: false,
    why: `off, ${reason}${hint}. Set up Python with: uv venv .venv && uv pip install -r scripts/requirements.txt`,
    child: null,
  };
}

/** Reports the live service in the dev server's log and stops it with the server. */
function liveService(live: Live): Plugin {
  return {
    name: 'sima:live-service',
    apply: 'serve',
    configureServer(server) {
      const log = server.config.logger;
      const say = `live service: ${live.why}; VITE_LIVE_API='${process.env.VITE_LIVE_API ?? ''}'`;
      if (live.up || process.env.SIMA_LIVE === 'off') log.info(say);
      else log.warn(say);
      const child = live.child;
      if (!child) return;
      let stopping = false;
      child.on('exit', (code, signal) => {
        if (!stopping) log.warn(`live service: stopped by itself (code ${code}, signal ${signal})`);
      });
      const stop = () => {
        stopping = true;
        if (child.exitCode === null && child.signalCode === null) child.kill();
      };
      server.httpServer?.once('close', stop);
      process.once('exit', stop);
    },
  };
}

export default defineConfig(async ({ command, isPreview }) => {
  const dev = command === 'serve' && !isPreview;
  const live: Live = dev
    ? await startLive()
    : { up: false, why: 'not the dev server', child: null };

  if (dev) {
    // Vite reads VITE_* variables from process.env after this function returns.
    if (process.env.SIMA_LIVE === 'off') process.env.VITE_LIVE_API = '';
    process.env.VITE_LIVE_API ??= live.up ? LIVE_API : '';
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
