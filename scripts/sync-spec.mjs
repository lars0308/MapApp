// keeps the relay's copy of the command list in sync with the app (src/api/spec.json); the copy in
// public/ is served with the app, so the relay knows new commands without a redeploy
import fs from 'node:fs';
fs.copyFileSync('src/api/spec.json', 'supabase/functions/mapforge-mcp/spec.json');
fs.copyFileSync('src/api/spec.json', 'public/mapforge-spec.json');
