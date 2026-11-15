/**
 * Catalogue sources for the patch on screen (Layers tab, known-or-new taps, O-D4). Owner: lane E.
 *
 * - Shipped targets: the Gaia DR3 and CatWISE2020 sources near the target's path that lane A
 *   baked into frames.json (`neighbours`), named with the service that answered. On request, the
 *   whole field from VizieR (core/catalog.ts `fetchCatalog`). Nothing is fetched by itself.
 * - Live spots: the live service's `catalog.json` for the patch (docs/live-service.md), asked
 *   again while it answers "pending".
 *
 * A failure is said as a failure, never as "no sources here" (docs/live-service.md).
 */
import { S, watch } from '../state.ts';
import { SEED_BASE } from '../seed.ts';
import { fetchCatalog } from '../../core/catalog.ts';
import type { Neighbour, PatchCatalog } from '../../core/types.ts';

/** The rows one catalogue offers here, and where they came from, in words. */
export interface CatState {
  rows: Neighbour[];
  /** 'none': nothing to show and nothing asked; 'pending': asking; 'ready'; 'failed'. */
  state: 'none' | 'pending' | 'ready' | 'failed';
  /** One plain line for the Layers tab ("30 near Barnard's Star's path, from frames.json …"). */
  line: string;
  /** Rows cover only the target's path, not the whole field. */
  partial: boolean;
}

type Cat = 'gaia' | 'catwise';

const NAMES: Record<Cat, string> = { gaia: 'Gaia DR3', catwise: 'CatWISE2020' };

let states: Record<Cat, CatState> = { gaia: empty(), catwise: empty() };
let gen = 0;
const fns = new Set<() => void>();
let timer = 0;

function empty(): CatState {
  return { rows: [], state: 'none', line: '', partial: false };
}

/** Starts following the patch. Called once. */
export function startCatalogue(): void {
  watch(['set', 'field'], refresh);
  refresh();
}

/** Hear changes. */
export function onCatalogue(fn: () => void): () => void {
  fns.add(fn);
  return () => fns.delete(fn);
}

/** What each catalogue offers now. */
export function catalogue(): Readonly<Record<Cat, CatState>> {
  return states;
}

/** Every row of both catalogues. */
export function allRows(): Neighbour[] {
  return [...states.gaia.rows, ...states.catwise.rows];
}

function tell(): void {
  for (const fn of fns) fn();
}

function refresh(): void {
  gen += 1;
  clearTimeout(timer);
  const field = S.field;
  const set = S.set;
  states = { gaia: empty(), catwise: empty() };
  if (!field || field.simulated) {
    const why = field?.simulated
      ? 'Not shown on simulated pictures'
      : 'No pictures here, so nothing to mark';
    states.gaia.line = why;
    states.catwise.line = why;
    return tell();
  }
  if (set?.origin === 'live') {
    states.gaia = { ...empty(), state: 'pending', line: 'Asking the live service…' };
    states.catwise = { ...states.gaia };
    tell();
    void askService(set.key, gen);
    return;
  }
  const near = field.target ? `near ${field.target.name}'s path` : 'near the patch centre';
  for (const cat of ['gaia', 'catwise'] as const) {
    const rows = field.neighbours.filter((n) => n.cat === cat);
    const from = set?.data.neighboursFrom?.[cat];
    states[cat] = {
      rows,
      state: from || rows.length ? 'ready' : 'none',
      partial: true,
      line: from
        ? `${count(rows.length)} ${near}, from ${from}`
        : `No ${NAMES[cat]} rows were baked for this patch`,
    };
  }
  tell();
}

function count(n: number): string {
  return n === 1 ? '1 source' : `${n} sources`;
}

/** Shows a patch's catalog.json, both catalogues. */
function showCatalog(body: PatchCatalog): void {
  for (const cat of ['gaia', 'catwise'] as const) {
    const rows = body.rows.filter((r) => r.cat === cat);
    const capped = body.capped[cat] ? ' (crowded field: the faintest are missing)' : '';
    states[cat] = {
      rows,
      state: 'ready',
      partial: false,
      line: `${count(rows.length)} in the patch, from ${body.from[cat]}${capped}`,
    };
  }
  tell();
}

/** Reads a seeded patch's catalog.json; false when the seed has none, so the service is asked. */
async function seedCatalog(id: string, myGen: number): Promise<boolean> {
  try {
    const res = await fetch(`${SEED_BASE}/${id}/catalog.json`);
    if (!res.ok) return false;
    const body = (await res.json()) as PatchCatalog;
    if (myGen !== gen) return true;
    if (!('rows' in body)) return false;
    showCatalog(body);
    return true;
  } catch {
    return false;
  }
}

/** The live service's catalog.json for a patch: asked again every 3 s while pending. */
async function askService(id: string, myGen: number): Promise<void> {
  // A seeded patch's catalogue sits next to its files (scripts/seed_live.py --export).
  if (SEED_BASE && (await seedCatalog(id, myGen))) return;
  const api = import.meta.env.VITE_LIVE_API ?? '';
  if (!api) {
    if (myGen !== gen) return;
    for (const cat of ['gaia', 'catwise'] as const) {
      states[cat] = { ...empty(), state: 'failed', line: 'The live service is off here' };
    }
    return tell();
  }
  try {
    const res = await fetch(`${api}/${id}/catalog.json`);
    if (myGen !== gen) return;
    if (res.status === 202) {
      timer = window.setTimeout(() => void askService(id, myGen), 3000);
      return;
    }
    const body = (await res.json()) as PatchCatalog | { error?: string };
    if (myGen !== gen) return;
    if (!res.ok || !('rows' in body)) {
      const why = 'error' in body && body.error ? body.error : `answer ${res.status}`;
      for (const cat of ['gaia', 'catwise'] as const) {
        states[cat] = { ...empty(), state: 'failed', line: `The catalogue could not be read: ${why}` };
      }
      return tell();
    }
    showCatalog(body);
  } catch (err) {
    if (myGen !== gen) return;
    for (const cat of ['gaia', 'catwise'] as const) {
      states[cat] = {
        ...empty(),
        state: 'failed',
        line: `The live service did not answer (${String(err)})`,
      };
    }
    tell();
  }
}

/**
 * Asks VizieR for the whole field (a shipped target's frames.json lists only sources near the
 * target's path). Anonymous request; VizieR at CfA is not always up, and a failure says so.
 */
export async function askVizier(): Promise<void> {
  const field = S.field;
  if (!field || field.simulated) return;
  const myGen = gen;
  const radius = (field.fov / 60) * Math.SQRT1_2 + 30 / 3600;
  for (const cat of ['gaia', 'catwise'] as const) {
    states[cat] = { ...states[cat], state: 'pending', line: `Asking VizieR for ${NAMES[cat]}…` };
  }
  tell();
  await Promise.all(
    (['gaia', 'catwise'] as const).map(async (cat) => {
      try {
        const rows = await fetchCatalog(cat, field.ra, field.dec, radius);
        if (myGen !== gen) return;
        const seen = new Set(states[cat].rows.map((r) => r.id));
        const merged = [...states[cat].rows, ...rows.filter((r) => !seen.has(r.id))];
        states[cat] = {
          rows: merged,
          state: 'ready',
          partial: false,
          line: rows.length
            ? `${count(merged.length)} in the field, from VizieR at CfA and frames.json`
            : `VizieR answered with no ${NAMES[cat]} rows; ${count(merged.length)} from frames.json`,
        };
      } catch (err) {
        if (myGen !== gen) return;
        states[cat] = {
          ...states[cat],
          state: 'failed',
          line: `VizieR did not answer (${String(err)}); ${count(states[cat].rows.length)} from frames.json`,
        };
      }
      tell();
    }),
  );
}
