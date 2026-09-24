import { runCloud } from './_runner.js';

// POST /api/cloud {code, command, args, ticket, store} → MapForge result (see _runner.js)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const origin = process.env.MAPFORGE_APP_URL || `https://${req.headers['x-forwarded-host'] ?? req.headers.host}`;
  try {
    const result = await runCloud(body, {
      origin,
      log: (...a) => console.log('[mapforge-cloud]', ...a),
      launch: async () => {
        const chromium = (await import('@sparticuz/chromium')).default;
        const puppeteer = (await import('puppeteer-core')).default;
        return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true, defaultViewport: { width: 1280, height: 800 } });
      },
    });
    res.status(200).json(result);
  } catch (e) {
    console.error('[mapforge-cloud]', e);
    res.status(200).json({ ok: false, error: `MapForge in der Cloud: ${e?.message ?? e}` });
  }
}
