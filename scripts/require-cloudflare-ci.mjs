import { pathToFileURL } from 'node:url';

// Initial Git builds may omit the push-event SHA. The independent GitHub gate
// always verifies the real checkout's complete SHA before any remote operation.
export function isCloudflareBuild(env = process.env) {
  return env.WORKERS_CI === '1' && env.CI === 'true';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && !isCloudflareBuild()) {
  console.error(
    "Production publishing is only allowed inside the configured Cloudflare Git build. Use a local build, preview or --dry-run instead.",
  );
  process.exitCode = 1;
}
