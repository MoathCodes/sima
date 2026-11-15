/**
 * Build-time settings the page reads through `import.meta.env`. Owner: integrator.
 * vite.config.ts explains where each one comes from.
 */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Where the live service answers (docs/live-service.md), such as `/api/patch` in dev.
   * Empty or missing means there is no live service: a spot without shipped pictures says so
   * (FRM-11) instead of asking.
   */
  readonly VITE_LIVE_API?: string;
  /**
   * Where the static seed is served (scripts/seed_live.py `--export`, uploaded to a bucket), such
   * as `https://storage.googleapis.com/<bucket>/seed`. Empty or missing means no seed: every spot
   * goes to the live service.
   */
  readonly VITE_SEED_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
