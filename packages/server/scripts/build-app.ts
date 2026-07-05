// Bundles the inscription MCP App (bridge + renderer) into a single self-contained
// HTML file, committed as src/apps/inscription-view.html — same committed-snapshot
// pattern as src/vocab/vocab.json. Re-run via `npm run build:app` after editing
// anything under src/apps/. A build-time bundle is required because the MCP Apps
// CSP blocks external scripts, so the bridge SDK cannot be loaded from a CDN.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appsDir = fileURLToPath(new URL('../src/apps/', import.meta.url));

const result = await build({
  entryPoints: [`${appsDir}inscription-app.ts`],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
});

const js = result.outputFiles[0].text;
if (js.includes('</script>')) {
  throw new Error('Bundle contains a literal </script>; it would break the inline HTML.');
}

const template = readFileSync(`${appsDir}inscription.html`, 'utf-8');
const placeholder = '<!--__APP_SCRIPT__-->';
if (!template.includes(placeholder)) {
  throw new Error(`Template is missing the ${placeholder} placeholder.`);
}

// Replacer function so `$`-sequences in the minified JS aren't treated as
// replacement patterns by String.replace.
writeFileSync(
  `${appsDir}inscription-view.html`,
  template.replace(placeholder, () => `<script>\n${js}</script>`),
);
console.log('Wrote src/apps/inscription-view.html');
