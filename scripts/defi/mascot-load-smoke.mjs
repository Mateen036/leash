// Home first-paint regression: SSR, uncached navigation filmstrips, and no-JS SVG.
// Run against the local server: node scripts/defi/mascot-load-smoke.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire("/tmp/localagentpay-browser/package.json")("playwright"));
}
const base = process.env.BASE || "http://localhost:3005";
const shots = process.env.SHOTS_DIR || "/workspace/shots";
mkdirSync(shots, { recursive: true });
const response = await fetch(base);
assert.equal(response.status, 200);
const html = await response.text();
assert.doesNotMatch(html, /orb-fallback|agent-ambient/);
assert.match(html, /<svg[^>]*aria-label="Leash mascot"/);
assert.doesNotMatch(html, /<link[^>]*as="image"|<img\b|<canvas\b/);
assert.match(html, /<meta name="color-scheme" content="dark"/);
console.log("PASS SSR: mascot SVG present; old hero, image preload, image, canvas absent");

const report = { base, passed: false, runs: [] };
const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: name === "mobile",
      hasTouch: name === "mobile",
    });
    const page = await context.newPage();
    const errors = [];
    const images = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.resourceType() === "image") images.push(request.url());
    });
    await page.addInitScript(() => {
      window.oldHeroSeen = false;
      new MutationObserver(() => {
        if (document.querySelector(".orb-fallback, .agent-ambient")) window.oldHeroSeen = true;
      }).observe(document, { childList: true, subtree: true });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.setBypassServiceWorker", { bypass: true });
    const start = performance.now();
    // Observe rejection immediately while the timed captures are in flight.
    const navigation = page.goto(base, { waitUntil: "domcontentloaded", timeout: 90000 })
      .then((response) => ({ response }), (error) => ({ error }));
    const frames = [];
    for (const ms of [100, 500]) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, start + ms - performance.now())));
      const requestedAtMs = Math.round(performance.now() - start);
      // Capture the current compositor frame without waiting for hydration,
      // fonts, network idle, or Playwright's element stability checks.
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      const file = join(shots, `v3mascot-load-${name}-${ms}ms.png`);
      writeFileSync(file, Buffer.from(data, "base64"));
      frames.push({ file, requestedAtMs });
    }
    const navigated = await navigation;
    if (navigated.error) throw navigated.error;
    await page.waitForLoadState("networkidle");
    assert.equal(await page.getByRole("img", { name: "Leash mascot", exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => window.oldHeroSeen), false);
    assert.equal(errors.length, 0, errors.join("\n"));
    assert.equal(images.filter((url) => !url.startsWith("data:")).length, 0);
    const timing = await page.evaluate(() => ({
      responseStartMs: performance.getEntriesByType("navigation")[0].responseStart,
      paints: performance.getEntriesByType("paint").map(({ name, startTime }) => ({ name, startTime })),
    }));
    report.runs.push({ name, width, cacheDisabled: true, frames, timing, errors, externalImageRequests: 0 });
    console.log(`PASS ${name}: 100/500ms filmstrip; no transient old hero or external image requests`);
    await context.close();
  }
  // A browser without hydration still receives and displays the same mascot.
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(base, { waitUntil: "load" });
  assert.equal(await staticPage.getByRole("img", { name: "Leash mascot", exact: true }).isVisible(), true);
  await staticContext.close();
  console.log("PASS mascot visible with JavaScript disabled");
  report.passed = true;
  writeFileSync(join(shots, "v3mascot-load-verification.json"), JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
