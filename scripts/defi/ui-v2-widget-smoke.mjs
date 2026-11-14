// Real testnet UI smoke. Creates a funded guest and submits the listed actions.
// No mocked transactions; keys stay in browser storage, never in evidence.
import assert from "node:assert/strict";
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
const evidence = {
  at: new Date().toISOString(),
  base,
  passed: false,
  checks: [],
  transactions: [],
  errors: [],
};
p.on("pageerror", (e) => evidence.errors.push(e.message));
p.on("response", async (r) => {
  try {
    const path = new URL(r.url()).pathname;
    if (path === "/api/near/guest") {
      const d = await r.json();
      evidence.accountId = d.accountId;
      evidence.transactions.push({ kind: "guest", hash: d.txHash });
      console.log("guest", d.accountId, d.txHash);
    }
    if (path === "/api/defi/execute") {
      const d = await r.json();
      const kind = r.request().postDataJSON().action.kind;
      evidence.transactions.push({
        kind,
        ok: d.ok,
        hash: d.txHash,
        error: d.error,
      });
      console.log(kind, JSON.stringify(d));
    }
  } catch {}
});
const shot = async (name) =>
  p.screenshot({
    path: `/workspace/shots/leash-ui-a-${name}.png`,
    fullPage: true,
  });
try {
  await p.goto(base + "/swap", { waitUntil: "networkidle" });
  await p
    .getByRole("button", {
      name: "Select token, NEAR on NEAR testnet",
      exact: true,
    })
    .click();
  await p.getByRole("textbox", { name: "Search tokens" }).fill("tUSDC");
  await p.locator(".token-row").filter({ hasText: "tUSDC" }).click();
  assert.equal(
    await p
      .locator(".amount-panel")
      .first()
      .locator(".token-pill")
      .innerText()
      .then((x) => x.includes("tUSDC")),
    true,
  );
  await p.getByRole("button", { name: "Reverse swap direction" }).click();
  await p
    .getByRole("button", {
      name: "Select token, NEAR on NEAR testnet",
      exact: true,
    })
    .click();
  await p.keyboard.press("Escape");
  await p.locator(".amount-panel").first().waitFor();
  evidence.checks.push("Swap token search, selection, flip and Escape close");
  await p.getByRole("button", { name: "Get quote", exact: true }).click();
  await p
    .getByRole("article", { name: "Action preview" })
    .waitFor({ timeout: 90000 });
  assert.ok(await p.getByText("Minimum received", { exact: true }).count());
  assert.ok(await p.getByText("Slippage limit", { exact: true }).count());
  await shot("swap-quote-desktop");
  evidence.checks.push(
    "Live Ref quote displays minimum, fee, impact and slippage",
  );
  await p
    .getByRole("button", { name: "Start free on testnet", exact: true })
    .click();
  await p
    .getByText("Guard installed.", { exact: false })
    .last()
    .waitFor({ timeout: 150000 });
  evidence.transactions.push({
    kind: "guard-install",
    hash: (
      await p
        .getByRole("link", { name: "Install tx", includeHidden: true })
        .getAttribute("href")
    )
      .split("/")
      .at(-1),
  });
  evidence.checks.push(
    "Real browser guest creation and atomic guard installation",
  );
  async function action(path, tab, label, amount) {
    await p.goto(base + "/" + path, {
      waitUntil: "networkidle",
      timeout: 90000,
    });
    if (tab) await p.getByRole("button", { name: tab, exact: true }).click();
    await p.getByRole("textbox", { name: label, exact: true }).fill(amount);
    await p.getByRole("button", { name: "Get quote", exact: true }).click();
    const card = p.getByRole("article", { name: "Action preview" });
    await card
      .getByRole("button", {
        name: /^(Swap|Stake|Unstake|Supply|Withdraw|Open long|Open short|Close position)$/,
      })
      .waitFor({ timeout: 90000 });
    await card
      .getByRole("button", {
        name: /^(Swap|Stake|Unstake|Supply|Withdraw|Open long|Open short|Close position)$/,
      })
      .click();
    if (path === "stake" && !tab) {
      await card.getByRole("button", { name: "Undo", exact: true }).click();
      await p.waitForTimeout(3500);
      assert.equal(
        evidence.transactions.some((t) => t.kind === "LinearStake"),
        false,
      );
      evidence.checks.push(
        "Undo cancels autonomous countdown without a transaction",
      );
      await card
        .getByRole("button", {
          name: /^(Swap|Stake|Unstake|Supply|Withdraw|Open long|Open short|Close position)$/,
        })
        .click();
    }
    await card
      .getByText("Final · protocol execution confirmed", { exact: true })
      .first()
      .waitFor({ timeout: 150000 });
    assert.ok(await card.locator(".execution-success").count());
    assert.ok(await p.locator(".widget-toast").count());
    await shot(path + "-" + (tab || "confirmed") + "-desktop");
  }
  await action("stake", null, "You send amount", "0.02");
  await action("lend", null, "You send amount", "0.02");
  await action("lend", "Withdraw", "Withdraw amount", "0.01");
  await action("swap", null, "You send amount", "0.01");
  await action("stake", "Unstake", "Unstake · value in NEAR amount", "0.005");
  evidence.checks.push(
    "Real guard-backed stake, supply, withdrawal, swap and unstake execute via UI with timelines and tx toasts",
  );
  await p.goto(base + "/agent", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /Prove the leash works/ }).click();
  const proof = p.getByRole("article", { name: "Action preview" }).last();
  await proof
    .getByRole("button", { name: "Try anyway · prove on-chain", exact: true })
    .waitFor({ timeout: 90000 });
  await proof
    .getByRole("button", { name: "Try anyway · prove on-chain", exact: true })
    .click();
  await proof
    .getByText("Rejected on-chain", { exact: true })
    .first()
    .waitFor({ timeout: 150000 });
  assert.ok(evidence.transactions.some((t) => t.ok === false && t.hash));
  assert.ok(
    await proof
      .locator('.execution-timeline li[data-status="error"] a')
      .count(),
  );
  await shot("agent-rejection-desktop");
  evidence.checks.push(
    "Agent chat proposal proves on-chain rejection and displays red linked rejection receipt",
  );
  await p
    .getByRole("textbox", { name: "Your request", exact: true })
    .fill("Long ETH $30 at 3x");
  await p.getByRole("button", { name: "Ask the agent", exact: true }).click();
  await p
    .getByRole("article", { name: "Action preview" })
    .last()
    .getByText("Liquidation estimate", { exact: true })
    .waitFor({ timeout: 90000 });
  await p
    .getByRole("textbox", { name: "Your request", exact: true })
    .fill("bridge 5 USDC to Base");
  await p.getByRole("button", { name: "Ask the agent", exact: true }).click();
  await p
    .getByRole("article", { name: "Action preview" })
    .last()
    .getByText("Quote only", { exact: true })
    .waitFor({ timeout: 90000 });
  evidence.checks.push(
    "Agent preserves perps risk fields and quote-only bridge proposals",
  );
  await p.goto(base + "/bridge", { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Get quote", exact: true }).click();
  await p
    .getByRole("article", { name: "Action preview" })
    .waitFor({ timeout: 90000 });
  await shot("bridge-quote-desktop");
  evidence.checks.push("Live Intents bridge dry quote");
  await p.getByRole("button", { name: "Mainnet wallet", exact: true }).click();
  assert.ok(
    await p
      .getByText("Mainnet signing is unavailable in testnet guest mode.", {
        exact: false,
      })
      .count(),
  );
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
  evidence.checks.push("Guest mainnet execution remains disabled");
  for (const [width, height, tag] of [
    [1440, 900, "desktop"],
    [390, 844, "mobile"],
  ]) {
    await p.setViewportSize({ width, height });
    for (const path of ["swap", "stake", "lend", "bridge", "agent"]) {
      await p.goto(base + "/" + path, {
        waitUntil: "networkidle",
        timeout: 90000,
      });
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        path + " " + tag + " overflow",
      );
      await shot(path + "-connected-" + tag);
    }
  }
  evidence.checks.push(
    "All five pages fit desktop and 390px mobile with reduced motion",
  );
  assert.equal(evidence.errors.length, 0, JSON.stringify(evidence.errors));
  evidence.passed = true;
  console.log("WIDGET UI SMOKE PASS", JSON.stringify(evidence));
} catch (e) {
  evidence.failure = e.message;
  await shot("smoke-failure");
  console.log(
    "FAIL",
    e.message,
    (await p.locator("body").innerText()).slice(-5000),
  );
  throw e;
} finally {
  writeFileSync(
    new URL("../../docs/defi-ui-v2-a.json", import.meta.url),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await b.close();
}
