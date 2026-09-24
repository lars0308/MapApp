// keeps the relay's copy of the command list in sync with the app (src/api/spec.json)
import fs from 'node:fs';
fs.copyFileSync('src/api/spec.json', 'supabase/functions/mapforge-mcp/spec.json');
