import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const windows = process.platform === "win32";
const command = windows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const args = windows
  ? ["/d", "/s", "/c", "npm pack --dry-run --json"]
  : ["pack", "--dry-run", "--json"];
const packed = spawnSync(command, args, {
  cwd: packageRoot,
  encoding: "utf8",
  windowsHide: true,
});

if (packed.status !== 0) {
  process.stderr.write(
    packed.stderr || packed.error?.message || "npm pack --dry-run failed\n",
  );
  process.exitCode = packed.status ?? 1;
} else {
  const result = JSON.parse(packed.stdout)[0];
  const files = result.files.map(({ path }) => path).sort();
  const expected = [
    "README.md",
    "bin/repoledger.js",
    "package.json",
    "schema/v1.json",
    "schema/v2.json",
    "src/cli.js",
    "src/config.js",
    "src/content.js",
    "src/git.js",
    "src/init.js",
    "src/index.js",
    "src/layout.js",
    "src/ledger.js",
    "src/markdown.js",
    "src/migration.js",
    "src/publication.js",
    "src/repository.js",
    "src/status.js",
    "src/yaml.js",
  ].sort();
  const missing = expected.filter((path) => !files.includes(path));
  const unexpected = files.filter((path) => !expected.includes(path));

  if (missing.length > 0 || unexpected.length > 0) {
    if (missing.length > 0) process.stderr.write(`Missing packed files: ${missing.join(", ")}\n`);
    if (unexpected.length > 0) {
      process.stderr.write(`Unexpected packed files: ${unexpected.join(", ")}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write(`PACK_OK name=${result.name} version=${result.version} files=${files.length}\n`);
  }
}
