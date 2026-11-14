// Real testnet browser smoke. No browser storage or private keys are written to disk.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFileSync, existsSync } from "node:fs";
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = createRequire("/tmp/localagentpay-browser/package.json")(
    "playwright",
  ));
}
const base = process.env.BASE || "http://localhost:3001";
const executablePath =
  process.env.CHROME ||
  "/home/box/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell";
const browser = await chromium.launch(
  existsSync(executablePath) ? { executablePath } : {},
);
const evidence = {
  passed: false,
  at: new Date().toISOString(),
  base,
  transactions: {},
  screenshots: [],
  checks: [],
  errors: [],
};
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
page.on("pageerror", (e) => evidence.errors.push(e.message));
page.on("response", async (response) => {
  try {
    const path = new URL(response.url()).pathname;
    if (path === "/api/near/guest") {
      const data = await response.json();
      evidence.accountId = data.accountId;
      evidence.transactions.created = data.txHash;
      console.log("created", data.accountId, data.txHash);
    }
    if (path === "/api/defi/execute") {
      const data = await response.json();
      const actionKind = response.request().postDataJSON()?.action?.kind;
      const kind = data.ok
        ? {
            LinearStake: "stake",
            LinearUnstake: "unstake",
            BurrowSupply: "supply",
            BurrowWithdraw: "withdraw",
            RefSwap: "swap",
          }[actionKind] || actionKind
        : "rejected";
      evidence.transactions[kind] = data.txHash;
      console.log(kind, JSON.stringify(data));
    }
  } catch {
    /* unrelated response */
  }
});
async function shot(name) {
  const path = `/workspace/shots/${process.env.SHOT_PREFIX || "leash-wip-"}${name}.png`;
  await page.screenshot({ path, fullPage: true });
  evidence.screenshots.push(path);
}
try {
  await page.goto(`${base}/agent`, {
    waitUntil: "networkidle",
    timeout: 90000,
  });
  await page
    .getByRole("button", { name: "Start free on testnet", exact: true })
    .click();
  await page
    .getByText("Guard installed.", { exact: false })
    .last()
    .waitFor({ timeout: 120000 });
  evidence.transactions.install = await page
    .getByRole("link", { name: "Install tx", includeHidden: true })
    .getAttribute("href")
    .then((x) => x.split("/").at(-1));
  evidence.checks.push(
    "browser-created guest immediately installed immutable guard and limited key",
  );
  await shot("agent-onboarded-desktop");
  await page.getByRole("button", { name: /Stake 0\.2 NEAR$/ }).click();
  const preview = page.getByRole("article", { name: "Action preview" }).last();
  await preview
    .getByRole("heading", { name: "Stake", exact: true })
    .waitFor({ timeout: 90000 });
  await preview
    .getByRole("button", {
      name: /^(Swap|Stake|Unstake|Supply|Withdraw|Open long|Open short|Close position)$/,
    })
    .click();
  await preview.getByRole("button", { name: "Undo", exact: true }).click();
  await page.waitForTimeout(3500);
  assert.equal(evidence.transactions.stake, undefined, "Undo must not execute");
  evidence.checks.push(
    "three-second autonomous countdown can be undone without a transaction",
  );
  await preview
    .getByRole("button", {
      name: /^(Swap|Stake|Unstake|Supply|Withdraw|Open long|Open short|Close position)$/,
    })
    .click();
  await preview
    .getByText("Final · protocol execution confirmed", { exact: true })
    .first()
    .waitFor({ timeout: 120000 });
  assert.ok(evidence.transactions.stake);
  await shot("agent-stake-success-desktop");
  await page.goto(`${base}/guardrails`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Prove it", exact: true }).click();
  const proof = page.getByRole("article", { name: "Action preview" }).last();
  await proof
    .getByRole("button", { name: "Try anyway · prove on-chain", exact: true })
    .waitFor({ timeout: 60000 });
  await proof
    .getByRole("button", { name: "Try anyway · prove on-chain", exact: true })
    .click();
  await proof
    .getByText("Rejected on-chain", { exact: true })
    .first()
    .waitFor({ timeout: 120000 });
  assert.ok(evidence.transactions.rejected);
  await shot("guardrails-rejection-desktop");
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByText("Rejected on-chain", { exact: true })
    .first()
    .waitFor({ timeout: 30000 });
  evidence.checks.push(
    "CAP_PER_ACTION rejection has tx link and persists after reload",
  );
  if (process.env.EXTRA === "1") {
    async function protocolAction(path, tab, label, amount) {
      await page.goto(`${base}/${path}`, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      // UI v2: Supply/Withdraw and Stake/Unstake are pill tabs; amounts live in AmountPanels.
      if (tab)
        await page.getByRole("button", { name: tab, exact: true }).click();
      await page
        .getByRole("textbox", { name: label, exact: true })
        .fill(amount);
      await page
        .getByRole("button", { name: "Get quote", exact: true })
        .click();
      const card = page.getByRole("article", { name: "Action preview" }).last();
      await card
        .getByRole("button", {
          name: /^(Swap|Stake|Unstake|Supply|Withdraw|Open long|Open short|Close position)$/,
        })
        .waitFor({ timeout: 60000 });
      await card
        .getByRole("button", {
          name: /^(Swap|Stake|Unstake|Supply|Withdraw|Open long|Open short|Close position)$/,
        })
        .click();
      await card
        .getByText("Final · protocol execution confirmed", { exact: true })
        .first()
        .waitFor({ timeout: 120000 });
      assert.ok(await card.locator(".execution-timeline").count());
      await shot(`${path}-${tab || "confirmed"}`);
    }
    await protocolAction("lend", null, "You send amount", "0.2");
    await protocolAction("lend", "Withdraw", "Withdraw amount", "0.1");
    await protocolAction("swap", null, "You send amount", "0.05");
    await protocolAction(
      "stake",
      "Unstake",
      "Unstake · value in NEAR amount",
      "0.02",
    );
    evidence.checks.push(
      "real UI supply, withdrawal, swap and unstake confirmed on testnet",
    );
    await page.goto(`${base}/guardrails`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    const pauseLinks = page.getByRole("link", { name: "Control transaction" });
    const pausePrevious = (await pauseLinks.count())
      ? await pauseLinks.first().getAttribute("href")
      : null;
    await page
      .getByRole("button", { name: "Pause agent", exact: true })
      .first()
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm pause", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Resume agent", exact: true })
      .first()
      .waitFor({ timeout: 60000 });
    await page.waitForFunction(
      (previous) =>
        [...document.querySelectorAll("a")].some(
          (a) =>
            a.textContent.includes("Control transaction") &&
            a.getAttribute("href") !== previous,
        ),
      pausePrevious,
      { timeout: 90000 },
    );
    evidence.transactions.pause = (
      await page
        .getByRole("link", { name: "Control transaction" })
        .first()
        .getAttribute("href")
    )
      .split("/")
      .at(-1);
    const resumeLinks = page.getByRole("link", { name: "Control transaction" });
    const resumePrevious = (await resumeLinks.count())
      ? await resumeLinks.first().getAttribute("href")
      : null;
    await page
      .getByRole("button", { name: "Resume agent", exact: true })
      .first()
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Confirm resume", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Pause agent", exact: true })
      .first()
      .waitFor({ timeout: 60000 });
    await page.waitForFunction(
      (previous) =>
        [...document.querySelectorAll("a")].some(
          (a) =>
            a.textContent.includes("Control transaction") &&
            a.getAttribute("href") !== previous,
        ),
      resumePrevious,
      { timeout: 90000 },
    );
    evidence.transactions.resume = (
      await page
        .getByRole("link", { name: "Control transaction" })
        .first()
        .getAttribute("href")
    )
      .split("/")
      .at(-1);
    await page.getByLabel("near per_action", { exact: true }).fill("0.45");
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
      .getByRole("link", { name: /^Policy transaction/ })
      .waitFor({ timeout: 60000 });
    evidence.transactions.setPolicy = (
      await page
        .getByRole("link", { name: /^Policy transaction/ })
        .getAttribute("href")
    )
      .split("/")
      .at(-1);
    const state = await (
      await page.request.get(
        `${base}/api/defi/state?account=${evidence.accountId}`,
      )
    ).json();
    assert.equal(state.policy.caps.near.per_action, "450000000000000000000000");
    evidence.checks.push(
      "owner-signed pause, resume and policy edit verified by on-chain state",
    );
  }
  for (const path of [
    "perps",
    "stake",
    "lend",
    "swap",
    "portfolio",
    "bridge",
    "protocols",
  ]) {
    await page.goto(`${base}/${path}`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    assert.equal(await page.locator("h1").count(), 1, path);
    await shot(`${path}-desktop`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "agent",
    "guardrails",
    "perps",
    "stake",
    "lend",
    "swap",
    "portfolio",
    "bridge",
    "protocols",
  ]) {
    await page.goto(`${base}/${path}`, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    assert.equal(overflow, false, `${path}: horizontal overflow on mobile`);
    await shot(`${path}-mobile`);
  }
  evidence.checks.push(
    "desktop + 390px mobile routes render without overflow; reduced motion enabled",
  );
  await page
    .getByRole("button", { name: "Toggle light or dark theme" })
    .count()
    .then(async (count) => {
      if (count) {
        await page.getByText("Display", { exact: true }).click();
        await page
          .getByRole("button", { name: "Toggle light or dark theme" })
          .click();
        assert.equal(
          await page.locator("html").getAttribute("data-theme"),
          "light",
        );
        await shot("light-mobile");
      }
    });
  if (process.env.EXTRA === "1") {
    await page.goto(`${base}/guardrails`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page
      .getByRole("button", { name: "Revoke agent", exact: true })
      .first()
      .click();
    await page
      .getByRole("dialog", { name: "Revoke agent access?" })
      .getByRole("button", { name: "Delete agent key", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Agent revoked", exact: true })
      .first()
      .waitFor({ timeout: 60000 });
    evidence.transactions.revoke = (
      await page
        .getByRole("link", { name: "Control transaction" })
        .first()
        .getAttribute("href")
    )
      .split("/")
      .at(-1);
    const revoked = await (
      await page.request.get(
        `${base}/api/defi/state?account=${evidence.accountId}`,
      )
    ).json();
    assert.equal(revoked.agentKey, null);
    evidence.checks.push("revoke owner transaction deleted agent key on-chain");
    await shot("guardrails-revoked-mobile");
  }

  assert.equal(evidence.errors.length, 0, JSON.stringify(evidence.errors));
  evidence.passed = true;
  console.log("UI SMOKE PASS", JSON.stringify(evidence));
} catch (error) {
  evidence.failure = error.message;
  await shot("smoke-failure");
  console.log(
    "BROWSER STATE",
    (await page.locator("body").innerText()).slice(-8000),
  );
  throw error;
} finally {
  writeFileSync(
    new URL(
      process.env.OUT || "../../docs/defi-ui-smoke.json",
      import.meta.url,
    ),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await browser.close();
}
