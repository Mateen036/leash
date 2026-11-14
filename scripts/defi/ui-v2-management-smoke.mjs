// Local UI regression smoke using real NEAR testnet receipts and Orderly fills.
// Keys stay in memory or /workspace/secrets/leash/ fixtures; never in evidence.
// RESUME_GUARD=1 reuses this smoke's saved guest; AFTER_POLICY=1 resumes its
// read/receipt checks. PERPS_ONLY=1 continues after guard verification.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire("/tmp/localagentpay-browser/package.json");
const { chromium } = require("playwright");
const base = process.env.BASE || "http://localhost:3001";
const output = process.env.OUT || "docs/ui-v2-management-smoke.json";
const priorEvidence =
  process.env.AFTER_POLICY === "1" ||
  (process.env.PERPS_ONLY === "1" && !process.env.OUT)
    ? JSON.parse(readFileSync("docs/ui-v2-management-smoke.json", "utf8"))
    : null;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ||
    "/home/box/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell",
});
const evidence = {
  base,
  passed: false,
  at: new Date().toISOString(),
  transactions: {},
  checks: [],
  screenshots: [],
  errors: [],
};
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
let tradingPage;
let openedBySmoke = false;
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => evidence.errors.push(e.message));
page.on("response", async (r) => {
  if (new URL(r.url()).pathname === "/api/near/guest" && r.ok()) {
    const j = await r.json();
    evidence.guest = j.accountId;
    evidence.transactions.create = j.txHash;
  }
});
const goto = async (path) => {
  await page.goto(base + path, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.locator("h1").waitFor();
};
const check = (name) => {
  evidence.checks.push(name);
  writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
  console.log("PASS", name);
};
async function shot(name) {
  const path = `/workspace/shots/${process.env.SHOT_PREFIX || "leash-uib-live-"}${name}.png`;
  await page.screenshot({ path, fullPage: true });
  evidence.screenshots.push(path);
}
const hashFrom = async (locator) =>
  (await locator.getAttribute("href")).split("/").at(-1);
async function state() {
  return (
    await page.request.get(`${base}/api/defi/state?account=${evidence.guest}`)
  ).json();
}
async function control(button, confirm, key) {
  await page.getByRole("button", { name: button, exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  const links = page.getByRole("link", { name: "Control transaction" });
  const previous = (await links.count())
    ? await links.first().getAttribute("href")
    : null;
  await dialog.getByRole("button", { name: confirm, exact: true }).click();
  await page.waitForFunction(
    (previous) =>
      [...document.querySelectorAll("a")].some(
        (a) =>
          a.textContent.includes("Control transaction") &&
          a.getAttribute("href") !== previous,
      ),
    previous,
    { timeout: 90000 },
  );
  evidence.transactions[key] = await hashFrom(links.first());
}
try {
  if (process.env.PERPS_ONLY === "1") {
    const saved = priorEvidence || {
      transactions: {},
      checks: [],
      screenshots: [],
    };
    evidence.transactions = saved.transactions;
    evidence.checks = saved.checks;
    evidence.screenshots = saved.screenshots.filter(
      (p) => !p.endsWith("failure.png"),
    );
    evidence.guest = saved.guest;
  } else {
    if (process.env.RESUME_GUARD === "1") {
      const guest = JSON.parse(
        readFileSync("/workspace/secrets/leash/ui-v2-smoke-guest.json", "utf8"),
      );
      evidence.guest = guest.accountId;
      evidence.transactions.create = guest.createdTx;
      evidence.transactions.install = guest.guardTx;
      await context.addInitScript(
        (guest) =>
          localStorage.setItem("leash:guest:v1", JSON.stringify(guest)),
        guest,
      );
    }
    await goto("/guardrails");
    if (process.env.RESUME_GUARD !== "1") {
      await page
        .getByRole("button", { name: "Start free on testnet", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Prove it", exact: true })
        .waitFor();
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll("button")].some(
            (b) => b.textContent.trim() === "Prove it" && !b.disabled,
          ),
        {},
        { timeout: 120000 },
      );
      evidence.transactions.install = await hashFrom(
        page.getByRole("link", { name: "Install tx", includeHidden: true }),
      );
      writeFileSync(
        "/workspace/secrets/leash/ui-v2-smoke-guest.json",
        await page.evaluate(() => localStorage.getItem("leash:guest:v1")),
        { mode: 0o600 },
      );
    }
    check(
      process.env.RESUME_GUARD === "1"
        ? "existing UI smoke guest restores its on-chain guard"
        : "fresh guest installs guard and limited key via existing onboarding",
    );
    if (process.env.AFTER_POLICY === "1") {
      const previous = priorEvidence;
      evidence.transactions = previous.transactions;
      evidence.checks = previous.checks;
    } else {
      await page
        .getByRole("button", { name: "Pause agent", exact: true })
        .first()
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      assert.equal((await state()).policy.paused, false);
      check("cancelled Pause leaves on-chain policy unchanged");
      await control("Pause agent", "Confirm pause", "pause");
      await page
        .getByRole("button", { name: "Resume agent", exact: true })
        .first()
        .waitFor();
      assert.equal((await state()).policy.paused, true);
      await control("Resume agent", "Confirm resume", "resume");
      await page
        .getByRole("button", { name: "Pause agent", exact: true })
        .first()
        .waitFor();
      assert.equal((await state()).policy.paused, false);
      check("owner Pause and Resume confirmed by live on-chain state");
      await page.getByLabel("near per_action", { exact: true }).fill("0.45");
      await page
        .getByRole("button", { name: "Review policy changes", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Confirm policy · owner signs",
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("button", { name: "Increase Max leverage", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("button", {
            name: "Confirm policy · owner signs",
            exact: true,
          })
          .count(),
        0,
      );
      await page
        .getByRole("button", { name: "Decrease Max leverage", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Review policy changes", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Confirm policy · owner signs",
          exact: true,
        })
        .click();
      await page
        .getByRole("link", { name: "Policy transaction" })
        .waitFor({ timeout: 90000 });
      evidence.transactions.setPolicy = await hashFrom(
        page.getByRole("link", { name: "Policy transaction" }),
      );
      assert.equal(
        (await state()).policy.caps.near.per_action,
        "450000000000000000000000",
      );
      check("policy steppers invalidate old preview; owner signs updated cap");
    }
    await page.getByRole("button", { name: "Prove it", exact: true }).click();
    const proof = page.getByRole("article", { name: "Action preview" }).last();
    await proof
      .getByRole("button", { name: "Try anyway · prove on-chain", exact: true })
      .click();
    await proof
      .getByText("Rejected on-chain", { exact: true })
      .waitFor({ timeout: 90000 });
    evidence.transactions.rejected = await hashFrom(
      proof.locator('a[href*="/txns/"]').first(),
    );
    check("real CAP_PER_ACTION failure displays on-chain rejection receipt");
    await shot("guardrails-desktop");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const path of ["portfolio", "guardrails", "protocols"]) {
        await goto("/" + path);
        await page.waitForTimeout(1500);
        assert.equal(await page.locator("h1").count(), 1);
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth + 1,
          ),
          false,
          `${path} overflow at ${width}`,
        );
        await shot(`${path}-${width}`);
      }
    }
    check(
      "connected portfolio, policy form, receipts and protocol cards fit 1440px and 390px",
    );
    await goto("/guardrails");
    await page
      .getByRole("button", { name: "Close all perps", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Keep positions open", exact: true })
      .click();
    check("close-all has an independent cancellable confirmation");
    await control("Revoke agent", "Delete agent key", "revoke");
    await page
      .getByRole("button", { name: "Agent revoked", exact: true })
      .first()
      .waitFor();
    assert.equal((await state()).agentKey, null);
    check("owner Revoke deletes limited key on-chain");
  }
  // Reuse the existing funded test fixture so faucet delay never gets fabricated.
  const accountId =
    process.env.PERPS_GUEST || "g-zuf7rn.leash-11141537.testnet";
  const fixture = JSON.parse(
    readFileSync("/workspace/secrets/leash/e2e-guests.json", "utf8"),
  ).find((g) => g.accountId === accountId);
  assert.ok(fixture, "existing private funded perps fixture required");
  const perpContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  await perpContext.addInitScript(
    (guest) => {
      localStorage.setItem("leash:guest:v1", JSON.stringify(guest));
    },
    { accountId, privateKey: fixture.privateKey },
  );
  const perp = await perpContext.newPage();
  tradingPage = perp;
  perp.setDefaultTimeout(90000);
  perp.on("pageerror", (e) => evidence.errors.push(e.message));
  await perp.goto(base + "/perps", { waitUntil: "domcontentloaded" });
  await perp.getByRole("button", { name: "Open long", exact: true }).waitFor();
  await perp.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim() === "Open long" && !b.disabled,
      ),
    {},
    { timeout: 90000 },
  );
  async function readPositions() {
    let last;
    for (let i = 0; i < 4; i++) {
      const response = await perp.request.get(
        `${base}/api/perps/positions?account=${accountId}`,
      );
      last = await response.json();
      if (response.ok() && Array.isArray(last.positions)) return last;
      await perp.waitForTimeout(1500);
    }
    throw new Error(
      `Orderly read failed: ${last?.error || JSON.stringify(last)}`,
    );
  }
  const positionsRead = await readPositions();
  assert.equal(
    positionsRead.positions.length,
    0,
    "fixture must start without exposure",
  );
  const trigger = perp.getByRole("button", { name: /ETH.*USDC.*Perpetual/ });
  await trigger.click();
  await perp.getByRole("textbox", { name: "Search markets" }).fill("SOL");
  assert.equal(
    await perp
      .getByRole("dialog")
      .getByRole("button", { name: /SOL.*USDC/ })
      .count(),
    1,
  );
  await perp.keyboard.press("Escape");
  assert.equal(await perp.getByRole("dialog").count(), 0);
  assert.equal(
    await trigger.evaluate((el) => el === document.activeElement),
    true,
  );
  check("market search reads live Orderly markets; Escape restores focus");
  await perp.getByRole("button", { name: "↘ Short", exact: true }).click();
  assert.equal(
    await perp
      .getByRole("article", { name: "Trade preview" })
      .first()
      .getByText("Short ETH", { exact: true })
      .count(),
    1,
  );
  await perp.getByRole("button", { name: "↗ Long", exact: true }).click();
  const orderResponse = perp.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/perps/order",
    { timeout: 90000 },
  );
  openedBySmoke = true;
  await perp.getByRole("button", { name: "Open long", exact: true }).click();
  const opened = await (await orderResponse).json();
  assert.ok(opened.ok && opened.authTx && opened.orderId);
  evidence.transactions.perpOpen = opened.authTx;
  evidence.perpOrderId = opened.orderId;
  await perp
    .getByRole("button", { name: "Close ETH position", exact: true })
    .waitFor();
  // Orderly's positions endpoint can lag the fill by a few seconds; poll before asserting.
  let livePositions;
  for (let i = 0; i < 10; i++) {
    livePositions = await readPositions();
    if (
      livePositions.positions.some(
        (p) => p.symbol === "PERP_ETH_USDC" && p.qty > 0,
      )
    )
      break;
    await perp.waitForTimeout(2000);
  }
  assert.ok(
    livePositions.positions.some(
      (p) => p.symbol === "PERP_ETH_USDC" && p.qty > 0,
    ),
    "Orderly reports the opened ETH long",
  );
  check(
    "2x long authorized on-chain, accepted by Orderly and verified as real exposure",
  );
  await perp.screenshot({
    path: `/workspace/shots/${process.env.SHOT_PREFIX || "leash-uib-live-"}perps-filled-desktop.png`,
    fullPage: true,
  });
  await perp.setViewportSize({ width: 390, height: 844 });
  // Let the responsive layout settle before measuring (fails on slower live loads otherwise).
  await perp.waitForTimeout(1200);
  assert.equal(
    await perp.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  const previewBox = await perp
    .getByRole("article", { name: "Trade preview" })
    .last()
    .boundingBox();
  const confirmBox = await perp
    .getByRole("button", { name: "Open long", exact: true })
    .boundingBox();
  assert.ok(
    previewBox.y + previewBox.height <= confirmBox.y,
    "risk preview above confirm on mobile",
  );
  await perp.screenshot({
    path: `/workspace/shots/${process.env.SHOT_PREFIX || "leash-uib-live-"}perps-filled-mobile.png`,
    fullPage: true,
  });
  await perp
    .getByRole("checkbox", { name: "Test an over-limit trade" })
    .check();
  const slider = perp.getByRole("slider", { name: "Leverage", exact: true });
  await slider.focus();
  await slider.press("Home");
  for (let i = 0; i < 9; i++) await slider.press("ArrowRight");
  const rejectResponse = perp.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/perps/order",
    { timeout: 90000 },
  );
  await perp.getByRole("button", { name: "Open long", exact: true }).click();
  const rejected = await (await rejectResponse).json();
  assert.ok(!rejected.ok && rejected.rejectedTx);
  evidence.transactions.perpRejected = rejected.rejectedTx;
  await perp.getByRole("link", { name: /Inspect rejection/ }).waitFor();
  check(
    "10x leverage attempt is visibly flagged and rejected on-chain with red tx link",
  );
  await perp
    .getByRole("button", { name: "Close ETH position", exact: true })
    .click();
  await perp
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await perp.getByRole("button", { name: "Close all", exact: true }).click();
  const closeResponse = perp.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/perps/close-all",
    { timeout: 90000 },
  );
  await perp
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm close all", exact: true })
    .click();
  const closed = await (await closeResponse).json();
  assert.ok(closed.ok);
  evidence.closeIds = closed.orderIds;
  await perp.waitForTimeout(2500);
  const after = await readPositions();
  assert.equal(after.positions.length, 0);
  openedBySmoke = false;
  check(
    "single Close can be cancelled; confirmed Close-all returns venue IDs and leaves no exposure",
  );
  evidence.screenshots.push(
    `/workspace/shots/${process.env.SHOT_PREFIX || "leash-uib-live-"}perps-filled-desktop.png`,
    `/workspace/shots/${process.env.SHOT_PREFIX || "leash-uib-live-"}perps-filled-mobile.png`,
  );
  evidence.checks.push(
    "all browser checks used prefers-reduced-motion: reduce",
  );
  evidence.checks = [...new Set(evidence.checks)];
  assert.deepEqual(evidence.errors, []);
  evidence.passed = true;
  console.log("UI V2 MANAGEMENT SMOKE PASS", JSON.stringify(evidence));
} catch (e) {
  evidence.failure = e.message;
  if (tradingPage)
    await tradingPage.screenshot({
      path: `/workspace/shots/${process.env.SHOT_PREFIX || "leash-uib-live-"}perps-failure.png`,
      fullPage: true,
    });
  else await shot("failure");
  console.log("FAIL", e.message);
  console.log(
    "PAGE",
    (await (tradingPage || page).locator("body").innerText()).slice(-5000),
  );
  throw e;
} finally {
  // The funded fixture starts flat. If a later assertion fails, close only the
  // exposure opened by this smoke through the same reduce-only UI flow.
  if (openedBySmoke && tradingPage) {
    try {
      if (await tradingPage.getByRole("dialog").count())
        await tradingPage.keyboard.press("Escape");
      await tradingPage
        .getByRole("button", { name: "Close all", exact: true })
        .click({ timeout: 30000 });
      const response = tradingPage.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/perps/close-all",
        { timeout: 30000 },
      );
      await tradingPage
        .getByRole("dialog")
        .getByRole("button", { name: "Confirm close all", exact: true })
        .click();
      const result = await (await response).json();
      evidence.cleanup = { ok: result.ok, orderIds: result.orderIds };
    } catch (error) {
      evidence.cleanup = { ok: false, error: error.message };
    }
  }
  writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
  await browser.close();
}
