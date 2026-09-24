import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const artworkUrl = new URL("../../assets/silvermoon.svg", import.meta.url);
const avatarUrl = new URL("../../docs/assets/silvermoon-avatar.svg", import.meta.url);
const readmeUrl = new URL("../../README.md", import.meta.url);

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(first, second) {
  const [bright, dark] = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  );
  return (bright + 0.05) / (dark + 0.05);
}

test("ships safe Silvermoon artwork with contrast in light and dark themes", async () => {
  const [artwork, avatar, readme] = await Promise.all([
    readFile(artworkUrl, "utf8"),
    readFile(avatarUrl, "utf8"),
    readFile(readmeUrl, "utf8"),
  ]);

  assert.match(artwork, /viewBox="0 400 1280 880"/);
  assert.equal([...artwork.matchAll(/<path\b/g)].length, 23);
  assert.doesNotMatch(
    artwork,
    /<script\b|on[a-z]+\s*=|<image\b|<foreignObject\b|(?:href|src)\s*=/i,
  );
  assert.match(artwork, /fill="#7d8590"/);
  assert.ok(contrast("7d8590", "ffffff") >= 3);
  assert.ok(contrast("7d8590", "0d1117") >= 3);
  assert.doesNotMatch(
    avatar,
    /<script\b|on[a-z]+\s*=|<image\b|<foreignObject\b|(?:href|src)\s*=/i,
  );

  assert.doesNotMatch(readme, /<picture>|prefers-color-scheme/);
  assert.match(
    readme,
    /src="https:\/\/raw\.githubusercontent\.com\/shazhou-ww\/silvermoon\/main\/assets\/silvermoon\.svg"/,
  );
  assert.match(readme, /alt="Silvermoon, the artifact spirit of the project"/);
  assert.match(
    readme,
    /src="https:\/\/raw\.githubusercontent\.com\/shazhou-ww\/silvermoon\/main\/docs\/assets\/silvermoon-avatar\.svg" width="128"/,
  );
});
