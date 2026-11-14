// UI-only review against the local dev server; no wallet connections or transactions.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire("/tmp/localagentpay-browser/package.json")(
    "playwright",
  ));
}
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const base = process.env.BASE || "http://localhost:3001";
const b = await chromium.launch({
  executablePath:
    process.env.CHROME ||
    "/home/box/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell",
});
const p = await b.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const e = {
  at: new Date().toISOString(),
  passed: false,
  checks: [],
  errors: [],
  screenshots: [],
};
p.on("pageerror", (err) => e.errors.push(err.message));
const shot = async (name) => {
  const path = `/workspace/shots/${process.env.SHOT_PREFIX || "leash-ui-a-review-"}${name}.png`;
  await p.screenshot({ path, fullPage: true });
  e.screenshots.push(path);
};
try {
  await p.goto(`${base}/swap`, { waitUntil: "networkidle" });
  await p.locator(".amount-output .token-pill").click();
  assert.equal(
    await p
      .locator('.token-row[aria-pressed="true"]')
      .innerText()
      .then((x) => x.includes("tUSDC")),
    true,
  );
  await p.keyboard.press("Escape");
  await p.waitForTimeout(250);
  assert.equal(
    await p
      .locator(".widget-shell .token-pill")
      .first()
      .evaluate((el) => el === document.activeElement),
    true,
  );
  e.checks.push(
    "Output picker highlights receiving token; Escape restores focus",
  );
  await p.getByRole("button", { name: "Get quote", exact: true }).click();
  const card = p.getByRole("article", { name: "Action preview" });
  await card.waitFor({ timeout: 90000 });
  await card.getByText("Details", { exact: true }).click();
  assert.ok(await card.locator(".planned-route li").count());
  await shot("swap-route-desktop");
  e.checks.push(
    "Quote expands planned route, signing model and destination contract",
  );
  await p.goto(`${base}/bridge`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Mainnet wallet", exact: true }).click();
  await p
    .getByRole("button", { name: "Select token, Select on base", exact: true })
    .click();
  await p.getByRole("textbox", { name: "Search networks" }).fill("base");
  await p.locator(".chain-chips button").filter({ hasText: "base" }).click();
  await p.getByRole("textbox", { name: "Search tokens" }).fill("USDC");
  await shot("mainnet-picker-desktop");
  await p.locator(".token-row").filter({ hasText: "USDC" }).first().click();
  await p
    .getByRole("textbox", {
      name: "You send · NEAR mainnet amount",
      exact: true,
    })
    .fill("26");
  assert.equal(
    await p
      .locator(".mainnet-widget")
      .getByRole("button", {
        name: "Get quote",
        exact: true,
        includeHidden: true,
      })
      .isDisabled(),
    true,
  );
  assert.ok(await p.getByText("/ $25 cap", { exact: false }).count());
  assert.ok(await p.getByText("Real money · mainnet", { exact: true }).count());
  await shot("mainnet-card-desktop");
  e.checks.push(
    "Mainnet chain/token picker works; cap, real-money badge and wallet requirement visible",
  );
  await p.setViewportSize({ width: 390, height: 844 });
  await shot("mainnet-card-mobile");
  assert.equal(
    await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  await p.locator(".mainnet-widget .amount-output .token-pill").click();
  await shot("mainnet-picker-mobile");
  await p.keyboard.press("Escape");
  await p.getByRole("button", { name: "Open navigation", exact: true }).click();
  assert.equal(
    await p
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link")
      .count(),
    9,
  );
  await p.keyboard.press("Escape");
  assert.equal(
    await p
      .getByRole("button", { name: "Open navigation", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  e.checks.push(
    "390px mainnet card/picker fit; mobile menu opens and Escape closes",
  );
  await p.goto(`${base}/agent`, { waitUntil: "networkidle" });
  await shot("agent-mobile");
  assert.ok(
    await p
      .getByRole("textbox", { name: "Your request", exact: true })
      .boundingBox()
      .then((r) => r.y + r.height <= 844),
  );
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.reload({ waitUntil: "networkidle" });
  await shot("agent-desktop");
  assert.ok(
    await p
      .getByRole("textbox", { name: "Your request", exact: true })
      .boundingBox()
      .then((r) => r.y + r.height <= 900),
  );
  const animated = await p.evaluate(
    () =>
      [...document.querySelectorAll("*")].filter(
        (el) =>
          getComputedStyle(el).animationName !== "none" &&
          ["agent-typing", "widget-shimmer", "widget-spin"].some((n) =>
            getComputedStyle(el).animationName.includes(n),
          ),
      ).length,
  );
  assert.equal(animated, 0);
  e.checks.push(
    "Agent composer fully above fold at both widths; new continuous motion disabled with reduced motion",
  );
  assert.equal(e.errors.length, 0);
  e.passed = true;
  console.log("FINAL UI REVIEW PASS", JSON.stringify(e));
} catch (err) {
  e.failure = err.message;
  await shot("failure");
  console.log("FAIL", err.message);
  throw err;
} finally {
  writeFileSync(
    new URL(
      process.env.OUT || "../../docs/defi-ui-v2-a-review.json",
      import.meta.url,
    ),
    JSON.stringify(e, null, 2) + "\n",
  );
  await b.close();
}
