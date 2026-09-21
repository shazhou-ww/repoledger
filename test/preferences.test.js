import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix, win32 } from "node:path";
import { afterEach, test } from "node:test";

import {
  loadUserPreferences,
  saveTaskLanguagePreference,
  userPreferencesPath,
} from "../src/preferences.js";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function preferenceFixture() {
  const root = await mkdtemp(join(tmpdir(), "repoledger-preferences-"));
  temporaryDirectories.push(root);
  return { path: join(root, "user", "preferences.yaml"), root };
}

test("uses platform user configuration directories outside repositories", () => {
  assert.equal(
    userPreferencesPath({
      env: { APPDATA: "C:\\Users\\sample\\AppData\\Roaming" },
      home: "C:\\Users\\sample",
      platform: "win32",
    }),
    win32.join("C:\\Users\\sample\\AppData\\Roaming", "repoledger", "preferences.yaml"),
  );
  assert.equal(
    userPreferencesPath({
      env: { XDG_CONFIG_HOME: "/var/user-config" },
      home: "/home/sample",
      platform: "linux",
    }),
    posix.join("/var/user-config", "repoledger", "preferences.yaml"),
  );
  assert.equal(
    userPreferencesPath({ env: {}, home: "/Users/sample", platform: "darwin" }),
    posix.join("/Users/sample", "Library", "Application Support", "repoledger", "preferences.yaml"),
  );
});

test("treats missing user preferences as an unset task language", async () => {
  const { path } = await preferenceFixture();
  const loaded = await loadUserPreferences({ path });

  assert.equal(loaded.exists, false);
  assert.deepEqual(loaded.diagnostics, []);
  assert.deepEqual(loaded.preferences, { version: 1, taskLanguage: null });
});

test("persists a canonical task language outside the repository", async () => {
  const { path } = await preferenceFixture();
  const saved = await saveTaskLanguagePreference({ language: "zh-cn", path });
  const loaded = await loadUserPreferences({ path });

  assert.deepEqual(saved.diagnostics, []);
  assert.equal(saved.language, "zh-CN");
  assert.deepEqual(loaded.preferences, { version: 1, taskLanguage: "zh-CN" });
  assert.equal(
    await readFile(path, "utf8"),
    "version: 1\ntaskLanguage: zh-CN\n",
  );
});

test("rejects invalid or noncanonical preference files without overwriting them", async () => {
  const { path, root } = await preferenceFixture();
  await saveTaskLanguagePreference({ language: "en", path });
  await writeFile(path, "taskLanguage: zh-cn\nversion: 1\nextra: true\n");

  const loaded = await loadUserPreferences({ path });
  const saved = await saveTaskLanguagePreference({ language: "fr", path });
  const codes = loaded.diagnostics.map(({ code }) => code);

  assert.ok(codes.includes("preferences.unknown-key"));
  assert.ok(codes.includes("preferences.invalid-task-language"));
  assert.deepEqual(saved.diagnostics, loaded.diagnostics);
  assert.equal(
    await readFile(path, "utf8"),
    "taskLanguage: zh-cn\nversion: 1\nextra: true\n",
  );
  assert.ok(path.startsWith(root));
});

test("rejects invalid language input before creating preferences", async () => {
  const { path } = await preferenceFixture();
  const saved = await saveTaskLanguagePreference({ language: "en_US", path });
  const loaded = await loadUserPreferences({ path });

  assert.equal(saved.diagnostics[0].code, "preferences.invalid-task-language");
  assert.equal(loaded.exists, false);
});

test("refuses a symbolic-link preferences file without changing its target", async (context) => {
  const { path, root } = await preferenceFixture();
  const target = join(root, "target.yaml");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(target, "keep\n");
  try {
    await symlink(target, path, "file");
  } catch (caught) {
    if (caught.code === "EPERM") {
      context.skip("file symlinks require elevated Windows privileges");
      return;
    }
    throw caught;
  }

  const loaded = await loadUserPreferences({ path });
  const saved = await saveTaskLanguagePreference({ language: "zh-CN", path });

  assert.equal(loaded.diagnostics[0].code, "preferences.invalid-file");
  assert.equal(saved.diagnostics[0].code, "preferences.invalid-file");
  assert.equal(await readFile(target, "utf8"), "keep\n");
});