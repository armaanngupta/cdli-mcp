// Bundles each MCP App (bridge + renderer) into a single self-contained HTML
// file, committed as src/apps/<name>-view.html — same committed-snapshot pattern
// as src/vocab/vocab.json. Re-run via `npm run build:app` after editing anything
// under src/apps/. A build-time bundle is required because the MCP Apps CSP
// blocks external scripts, so the bridge SDK cannot be loaded from a CDN.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const appsDir = fileURLToPath(new URL('../src/apps/', import.meta.url));

const APPS = [
  { entry: 'inscription-app.ts', template: 'inscription.html', out: 'inscription-view.html' },
  { entry: 'card-app.ts', template: 'card.html', out: 'card-view.html' },
];

for (const { entry, template, out } of APPS) {
  const result = await build({
    entryPoints: [`${appsDir}${entry}`],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    write: false,
  });

  const js = result.outputFiles[0].text;
  if (js.includes('</script>')) {
    throw new Error(`${entry}: bundle contains a literal </script>; it would break the inline HTML.`);
  }

  const html = readFileSync(`${appsDir}${template}`, 'utf-8');
  const placeholder = '<!--__APP_SCRIPT__-->';
  if (!html.includes(placeholder)) {
    throw new Error(`${template} is missing the ${placeholder} placeholder.`);
  }

  // Replacer function so `$`-sequences in the minified JS aren't treated as
  // replacement patterns by String.replace.
  writeFileSync(`${appsDir}${out}`, html.replace(placeholder, () => `<script>\n${js}</script>`));
  console.log(`Wrote src/apps/${out}`);
}
