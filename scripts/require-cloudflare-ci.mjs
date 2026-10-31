if (!/^[a-f0-9]{40}$/i.test(process.env.WORKERS_CI_COMMIT_SHA || "")) {
  console.error(
    "Production publishing is only allowed inside the configured Cloudflare Git build. Use a local build, preview or --dry-run instead.",
  );
  process.exitCode = 1;
}
