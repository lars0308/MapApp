// MapForge in the cloud: runs one AI command in a hidden browser when no MapForge tab of the
// user is open (called by the relay, supabase/functions/mapforge-mcp). The browser starts empty
// every time – the workspace of the pairing code (maps + builder state) comes from the relay's
// store before the command and the changes go back afterwards.

const CODE = /^[A-Za-z0-9]{16,64}$/;
/** only the MapForge relay's store may feed the browser */
const STORE = process.env.MAPFORGE_STORE_PATTERN
  ? new RegExp(process.env.MAPFORGE_STORE_PATTERN)
  : /^https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/mapforge-mcp\/[A-Za-z0-9]{16,64}\/store$/;

/**
 * @param {{ code: string, command: string, args?: object, ticket: string, store: string }} req
 * @param {{ origin: string, launch: () => Promise<import('puppeteer-core').Browser>, log?: (...a: unknown[]) => void }} env
 */
export async function runCloud(req, env) {
  const log = env.log ?? (() => {});
  const { code, command, args = {}, ticket, store } = req ?? {};
  if (!CODE.test(String(code)) || typeof command !== 'string' || !command) return { ok: false, error: 'code und command angeben' };
  if (typeof store !== 'string' || !STORE.test(store) || !store.includes(`/${code}/store`)) return { ok: false, error: 'Ungültige Speicheradresse' };

  // workspace (the ticket proves the call comes from the relay – before any browser starts)
  const got = await fetch(`${store}?since=0&ticket=${encodeURIComponent(String(ticket ?? ''))}`);
  if (got.status === 403) return { ok: false, error: 'MapForge in der Cloud: Ticket ungültig' };
  if (!got.ok) return { ok: false, error: `MapForge in der Cloud: Arbeitsstand nicht ladbar (HTTP ${got.status})` };
  const ws = await got.json();
  log('workspace', ws.projects?.length ?? 0, 'maps');

  const browser = await env.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
    // builder state (figures, palettes …) must be there before the app starts
    await page.evaluateOnNewDocument((local) => {
      try {
        for (const [k, v] of Object.entries(local ?? {})) localStorage.setItem(k, String(v));
      } catch {
        // storage full – the maps still work
      }
    }, ws.local ?? {});
    await page.goto(`${env.origin}/?cloud=1`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForFunction(() => !!window.mapforge?.cloud, { timeout: 30000 });
    await page.evaluate((p, c) => window.mapforge.cloud.load(p, c), ws.projects ?? [], ws.current ?? null);
    log('run', command);
    const result = await page.evaluate((c, a) => window.mapforge.run(c, a), command, args);
    const saved = await page.evaluate(() => window.mapforge.cloud.save());
    const put = await fetch(store, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(saved) });
    if (!put.ok) log('store failed', put.status, await put.text());
    log('saved', saved.projects.length, 'maps', errors.length ? `errors: ${errors.join(' | ')}` : '');
    if (result?.ok && result.text && !put.ok) result.text += ' (Achtung: Änderung konnte nicht gespeichert werden)';
    return result ?? { ok: false, error: 'Keine Antwort' };
  } finally {
    await browser.close().catch(() => {});
  }
}
