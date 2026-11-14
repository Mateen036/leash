// Real browser testnet flows. Private browser state stays outside the repository.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
const require = createRequire("/tmp/localagentpay-browser/package.json");
const { chromium } = require("playwright");
const base = process.env.BASE || "http://localhost:3001";
const statePath = "/workspace/secrets/leash/v3-tokens-ui-browser.json";
const reportPath = "docs/defi-v3-tokens-ui.json";
const progressPath = "/tmp/leash-v3-tokens-ui.json";
const evidence =
  existsSync(reportPath) && process.env.RESUME === "1"
    ? JSON.parse(readFileSync(reportPath, "utf8"))
    : {
        at: new Date().toISOString(),
        base,
        passed: false,
        checks: [],
        transactions: [],
        screenshots: [],
        errors: [],
      };
evidence.passed = false;
evidence.errors = [];
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME ||
    [
      chromium.executablePath(),
      "/opt/google/chrome/chrome",
      "/opt/ungoogled-chromium/chrome",
    ].find(existsSync),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
  ...(process.env.RESUME === "1" && existsSync(statePath)
    ? { storageState: statePath }
    : {}),
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => evidence.errors.push(e.message));
page.on("response", async (r) => {
  const path = new URL(r.url()).pathname;
  try {
    if (path === "/api/near/guest" && r.ok()) {
      const j = await r.json();
      evidence.accountId = j.accountId;
      evidence.transactions.push({ kind: "create-guest", hash: j.txHash });
      console.log("guest", j.accountId, j.txHash);
    }
    if (path === "/api/defi/execute") {
      const j = await r.json();
      const action = r.request().postDataJSON().action;
      evidence.transactions.push({
        kind: action.kind,
        tokenIn: action.token_in,
        tokenOut: action.token_out,
        pool: action.pool_id,
        ok: j.ok,
        hash: j.txHash,
        error: j.error,
      });
      console.log("execution", JSON.stringify(evidence.transactions.at(-1)));
    }
    if (path === "/api/faucet" && r.request().method() === "POST" && r.ok()) {
      const j = await r.json();
      evidence.faucet = j;
      console.log("faucet", JSON.stringify(j));
    }
  } catch {}
});
const save = () =>
  writeFileSync(progressPath, JSON.stringify(evidence, null, 2) + "\n");
const check = (text) => {
  if (!evidence.checks.includes(text)) evidence.checks.push(text);
  console.log("PASS", text);
  save();
};
const goto = async (path) => {
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
  await page.locator("h1").waitFor();
};
async function shot(name) {
  const path = `/workspace/shots/v3tok-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  if (!evidence.screenshots.includes(path)) evidence.screenshots.push(path);
}
async function artwork(scope = page) {
  await scope.locator(".token-icon > img").first().waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".token-icon > img")].every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  assert.ok(await scope.locator(".token-icon > img").count());
}
async function pick(side, symbol) {
  await page
    .locator(".amount-panel")
    .nth(side === "from" ? 0 : 1)
    .locator(".token-pill")
    .click();
  await page
    .getByRole("textbox", { name: "Search tokens", exact: true })
    .fill(symbol);
  await page
    .locator(".token-row")
    .filter({
      has: page.locator("strong", { hasText: new RegExp(`^${symbol}$`) }),
    })
    .click();
  await page.locator(".amount-panel").first().waitFor();
}
async function swap(amount) {
  await page
    .getByRole("textbox", { name: "You send amount", exact: true })
    .fill(amount);
  await page
    .getByRole("button", { name: "Get quote", exact: true })
    .click();
  const card = page.getByRole("article", { name: "Action preview" }).last();
  await card
    .getByRole("button", { name: /^(Swap|Confirm)$/ })
    .waitFor({ timeout: 90000 });
  await card.getByRole("button", { name: /^(Swap|Confirm)$/ }).click();
  await card
    .getByText("Final · protocol execution confirmed", { exact: true })
    .first()
    .waitFor({ timeout: 150000 });
  await artwork(card);
  assert.ok(await card.locator(".execution-success").count());
  await context.storageState({ path: statePath });
  chmodSync(statePath, 0o600);
}
try {
  await goto("/swap");
  if (!evidence.accountId || process.env.RESUME !== "1") {
    await page
      .getByRole("button", { name: "Start free on testnet", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Install tx", includeHidden: true })
      .waitFor({ state: "attached", timeout: 150000 });
    const hash = (
      await page
        .getByRole("link", { name: "Install tx", includeHidden: true })
        .getAttribute("href")
    )
      .split("/")
      .at(-1);
    evidence.transactions.push({ kind: "install-guard", hash });
    await context.storageState({ path: statePath });
    chmodSync(statePath, 0o600);
    check("Browser creates guest and installs on-chain guard");
  }
  if (!evidence.transactions.some((t) => t.kind === "install-guard")) {
    const hash = await page.evaluate(
      () => JSON.parse(localStorage.getItem("leash:guest:v1")).guardTx,
    );
    assert.ok(hash);
    evidence.transactions.push({ kind: "install-guard", hash });
    check("Browser creates guest and installs on-chain guard");
  }
  if (
    process.env.SKIP_OLDER !== "1" &&
    !evidence.checks.includes(
      "Older guest enables USDT with browser owner signature and preserves its other limits",
    )
  ) {
    const seeded = await page.evaluate(async () => {
      const guest = JSON.parse(localStorage.getItem("leash:guest:v1"));
      const state = await fetch(
        `/api/defi/state?account=${guest.accountId}`,
      ).then((r) => r.json());
      const policy = state.policy;
      delete policy.caps["usdt.itachicara.testnet"];
      const { updatePolicy } = await import("/lib/defi/client.ts");
      const result = await updatePolicy(guest, policy);
      return { result, policy };
    });
    assert.equal(seeded.result.ok, true);
    evidence.transactions.push({
      kind: "seed-older-policy",
      hash: seeded.result.txHash,
    });
    await goto("/swap");
    await pick("to", "USDT");
    await page
      .getByText("Turn on USDT in your limits", { exact: true })
      .waitFor({ timeout: 90000 });
    assert.equal(
      await page
        .getByRole("button", { name: "Preview action", exact: true })
        .isDisabled(),
      true,
    );
    await shot("older-policy-notice-desktop");
    await page
      .getByRole("button", { name: "Turn on tokens", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Preview action", exact: true })
      .waitFor();
    await page.waitForFunction(
      () => !document.querySelector(".token-limits-notice"),
      null,
      { timeout: 90000 },
    );
    const updated = await page.request
      .get(`${base}/api/defi/state?account=${evidence.accountId}`)
      .then((r) => r.json());
    assert.ok(updated.policy.caps["usdt.itachicara.testnet"]);
    const { ["usdt.itachicara.testnet"]: added, ...caps } = updated.policy.caps;
    assert.deepEqual(caps, seeded.policy.caps);
    assert.equal(updated.policy.expires_at_ms, seeded.policy.expires_at_ms);
    const hash = await page.evaluate(() => {
      const guest = JSON.parse(localStorage.getItem("leash:guest:v1"));
      return JSON.parse(
        localStorage.getItem(`leash:activity:${guest.accountId}`) || "[]",
      ).find((r) => r.headline.startsWith("Enable USDT"))?.txHash;
    });
    assert.ok(hash);
    evidence.transactions.push({ kind: "enable-USDT-policy", hash });
    check(
      "Older guest enables USDT with browser owner signature and preserves its other limits",
    );
  }
  if (
    !evidence.checks.includes(
      "NEAR → USDT 0.05 and USDT → NEAR execute through pool 1084",
    )
  ) {
    await pick("to", "USDT");
    await swap("0.05");
    await shot("swap-usdt-confirmed-desktop");
    await page
      .getByRole("button", { name: "Reverse swap direction", exact: true })
      .click();
    await page.getByRole("button", { name: "MAX", exact: true }).click();
    const maximum = await page
      .getByRole("textbox", { name: "You send amount", exact: true })
      .inputValue();
    assert.ok(Number(maximum) > 0);
    // Return a quarter, rounded down without floating point.
    const units =
      BigInt(
        maximum.replace(".", "").padEnd(maximum.split(".")[0].length + 24, "0"),
      ) / 4n;
    const amount = `${units / 10n ** 24n}.${(units % 10n ** 24n).toString().padStart(24, "0")}`;
    await swap(amount);
    check("NEAR → USDT 0.05 and USDT → NEAR execute through pool 1084");
  }
  await pick("from", "PEM");
  await pick("to", "USDC");
  assert.match(
    await page
      .locator(".amount-panel")
      .first()
      .locator(".token-pill")
      .innerText(),
    /NEAR/,
  );
  await page.locator(".amount-panel").first().locator(".token-pill").click();
  assert.equal(await page.locator(".token-row").count(), 7);
  await page
    .getByRole("textbox", { name: "Search tokens", exact: true })
    .fill("Learn NEAR");
  assert.equal(await page.locator(".token-row").count(), 1);
  assert.match(await page.locator(".token-row").innerText(), /LNC/);
  await artwork();
  await page.keyboard.press("Escape");
  await page.locator(".amount-panel").first().waitFor();
  check(
    "Seven tokens, name search, logos, automatic NEAR pairing, flip and MAX",
  );
  if (!evidence.faucet) {
    await page
      .getByRole("button", { name: "Get test tokens", exact: true })
      .last()
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Get test tokens",
      exact: true,
    });
    await dialog.getByRole("button", { name: "Claim", exact: true }).waitFor();
    await dialog.getByRole("button", { name: "Claim", exact: true }).click();
    await dialog
      .getByRole("list", { name: "Faucet results", exact: true })
      .waitFor({ timeout: 180000 });
    await artwork(dialog);
    assert.ok(
      await dialog
        .getByRole("link", { name: "View transaction", exact: false })
        .count(),
    );
    await shot("faucet-result-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await shot("faucet-result-mobile");
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    check(
      "Guest faucet delivers real testnet tokens and renders per-token explorer links",
    );
  }
  // Cooldown must be plain language, without raw API prefixes.
  await page
    .getByRole("button", { name: "Get test tokens", exact: true })
    .last()
    .click();
  const cooldown = page.getByRole("dialog", {
    name: "Get test tokens",
    exact: true,
  });
  await cooldown.getByRole("button", { name: "Claim", exact: true }).click();
  await cooldown.getByRole("alert").waitFor({ timeout: 30000 });
  assert.match(
    await cooldown.getByRole("alert").innerText(),
    /wait a few minutes/,
  );
  assert.doesNotMatch(await cooldown.innerText(), /FAUCET_|\{"error"/);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  check("Faucet cooldown is friendly and dialog Escape restores the widget");
  for (const [width, height, tag] of [
    [1440, 900, "desktop"],
    [390, 844, "mobile"],
  ]) {
    await page.setViewportSize({ width, height });
    for (const path of [
      "swap",
      "stake",
      "lend",
      "portfolio",
      "agent",
      "perps",
      "bridge",
    ]) {
      await goto("/" + path);
      if (path === "agent") {
        await page
          .getByRole("textbox", { name: "Your request", exact: true })
          .fill("swap 0.01 NEAR to USDT");
        await page
          .getByRole("button", { name: "Ask the agent", exact: true })
          .click();
        await page
          .getByRole("article", { name: "Action preview" })
          .waitFor({ timeout: 90000 });
      }
      await artwork();
      if (path === "portfolio") {
        await page
          .getByRole("heading", { name: "Wallet assets", exact: false })
          .waitFor();
        await page.getByText("PEM", { exact: true }).first().waitFor();
        const assets = page
          .locator("section")
          .filter({
            has: page.getByRole("heading", {
              name: "Wallet assets",
              exact: false,
            }),
          });
        for (const symbol of ["USDT", "USDC", "PEM", "LNC", "NST"]) {
          const row = assets
            .locator("div")
            .filter({
              has: page.locator("strong", {
                hasText: new RegExp(`^${symbol}$`),
              }),
            })
            .last();
          assert.doesNotMatch(await row.innerText(), /≈\$/);
        }
      }
      if (path === "bridge") {
        const widget = page.locator(".bridge-preview-widget");
        await widget
          .locator(".amount-panel")
          .last()
          .locator(".token-pill")
          .click();
        await page
          .getByRole("textbox", { name: "Search networks" })
          .fill("Avalanche");
        await page
          .getByRole("button", { name: "Avalanche", exact: false })
          .click();
        assert.ok(
          await page.locator(".token-row").filter({ hasText: "AVAX" }).count(),
        );
        await artwork();
        await shot(`bridge-picker-${tag}`);
        await page.keyboard.press("Escape");
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        `${path} ${tag} horizontal overflow`,
      );
      await shot(`${path}-${tag}`);
    }
  }
  check(
    "1440px and 390px pages fit, local token/chain logos load, portfolio avoids unpriced USD values",
  );
  await goto("/bridge");
  await page
    .locator(".bridge-preview-widget")
    .getByRole("button", { name: "Preview bridge route", exact: true })
    .click();
  await page
    .getByRole("article", { name: "Action preview" })
    .waitFor({ timeout: 90000 });
  await page
    .getByRole("button", { name: "Mainnet wallet", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "Review mainnet quote", exact: true })
      .isDisabled(),
    true,
  );
  assert.ok(
    await page.getByText("Real money · mainnet", { exact: true }).count(),
  );
  check("Live bridge preview works and guest mainnet deposit remains disabled");
  assert.deepEqual(evidence.errors, []);
  evidence.passed = true;
  delete evidence.failure;
  console.log("V3 TOKENS UI PASS");
} catch (e) {
  evidence.failure = e.message;
  await shot("failure");
  console.error(
    "FAIL",
    e.message,
    (await page.locator("body").innerText()).slice(-2600),
  );
  throw e;
} finally {
  await context.storageState({ path: statePath });
  chmodSync(statePath, 0o600);
  save();
  await browser.close();
  writeFileSync(reportPath, JSON.stringify(evidence, null, 2) + "\n");
}
