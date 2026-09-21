import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Where the .html files live.
 *
 * `__dirname` is `dist/email` once compiled and `src/email` under ts-node, so
 * both resolve to the templates folder beside it. The compiled path is listed
 * first because that is what production runs; nest-cli.json copies the files
 * there on build.
 */
const TEMPLATE_DIRS = [
  join(__dirname, '..', 'templates'),
  join(process.cwd(), 'dist', 'templates'),
  join(process.cwd(), 'src', 'templates'),
];

/** Read templates stay in memory: they never change while the app runs. */
const cache = new Map<string, string>();

/** Anything interpolated is escaped, so a value cannot inject markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Loads `<name>.html` from the templates folder. */
export function readTemplate(name: string): string {
  const cached = cache.get(name);

  if (cached !== undefined) {
    return cached;
  }

  for (const dir of TEMPLATE_DIRS) {
    try {
      const html = readFileSync(join(dir, `${name}.html`), 'utf8');
      cache.set(name, html);
      return html;
    } catch {
      // Try the next location.
    }
  }

  throw new Error(
    `Email template "${name}.html" was not found in: ${TEMPLATE_DIRS.join(', ')}`,
  );
}

/**
 * Fills a template's `{{placeholders}}` with the given values.
 *
 * A placeholder with no matching value is left as it is rather than blanked,
 * so a missing variable shows up in the email instead of vanishing silently.
 */
export function renderTemplate(
  name: string,
  variables: Record<string, string | number> = {},
): string {
  return readTemplate(name).replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (whole, key: string) => {
      const value = variables[key];

      return value === undefined ? whole : escapeHtml(String(value));
    },
  );
}

/** Drops the cache. Only needed by tests that write template files. */
export function clearTemplateCache(): void {
  cache.clear();
}
