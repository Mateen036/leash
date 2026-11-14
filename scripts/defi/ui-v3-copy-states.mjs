// Copy/accessibility audit only. Live quotes and wallet selection; injected failures are labelled.
// All signing/execute endpoints are blocked. No wallet account, keys, fills, or receipts are fabricated.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = createRequire("/tmp/localagentpay-browser/package.json")(
  "playwright",
);
const base = process.env.BASE || "http://localhost:3006";
const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
});
const report = {
  base,
  at: new Date().toISOString(),
  passed: false,
  checks: [],
  screenshots: [],
  errors: [],
  note: "Injected HTTP failures and delayed reads test UI states only. No successful execution responses or fills are mocked.",
};
async function setup(width) {
  const context = await browser.newContext({
    viewport: { width, height: width === 390 ? 844 : 900 },
    reducedMotion: "reduce",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const p = await context.newPage();
  p.on("pageerror", (e) => report.errors.push(e.message));
  await context.route(
    /\/api\/(defi\/execute|near\/relay|perps\/(order|close|close-all|bootstrap)|bridge\/(deposit-plan|submit))/,
    (route) => route.abort(),
  );
  return { context, p };
}
async function go(p, path) {
  await p.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
}
async function shot(p, name) {
  const text = await p.locator("body").innerText();
  assert.doesNotMatch(
    text,
    /\b(?:CAP_PER_ACTION|CAP_DAILY|agent_execute|authorize_perp|ft_transfer_call|storage_deposit|deposit_and_stake|get_return|pool 2973|yocto|LackBalanceForState)\b|\{\s*"(?:error|kind|method)"|UNHANDLED SCRIPT ERROR/,
  );
  assert.equal(
    await p.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
    `${name}: overflow`,
  );
  const file = `/workspace/shots/v3copy-state-${name}.png`;
  await p.screenshot({ path: file, fullPage: true });
  report.screenshots.push(file);
  report.checks.push(name);
}
const failure = (route, error, status = 500) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ error }),
  });
try {
  for (const width of [1440, 390]) {
    const { context, p } = await setup(width);
    const size = width === 390 ? "mobile" : "desktop";
    await go(p, "/swap");
    await p.locator(".amount-output .token-pill").click();
    await p.getByRole("textbox", { name: "Search tokens" }).fill("zzzzzz");
    await shot(p, `swap-picker-empty-${size}`);
    await p.keyboard.press("Escape");
    await p.getByRole("button", { name: "Get quote", exact: true }).click();
    const card = p.getByRole("article", { name: "Action preview" });
    await card.waitFor({ timeout: 90000 });
    await shot(p, `swap-preview-${size}`);
    await card.getByText("Technical details", { exact: true }).click();
    await shot(p, `swap-technical-details-${size}`);
    await go(p, "/stake");
    await p.getByRole("button", { name: "Unstake", exact: true }).click();
    await p.getByRole("button", { name: "Get quote", exact: true }).click();
    await p
      .getByRole("article", { name: "Action preview" })
      .waitFor({ timeout: 90000 });
    await shot(p, `unstake-preview-${size}`);
    await go(p, "/lend");
    await p.getByRole("button", { name: "Withdraw", exact: true }).click();
    await p.getByRole("button", { name: "Get quote", exact: true }).click();
    await p
      .getByRole("article", { name: "Action preview" })
      .waitFor({ timeout: 90000 });
    await shot(p, `withdraw-preview-${size}`);
    await go(p, "/perps");
    await p.getByRole("button", { name: /ETH.*USDC.*Perpetual/ }).click();
    await p.getByRole("textbox", { name: "Search markets" }).fill("zzzzzz");
    await shot(p, `perps-picker-empty-${size}`);
    await p.keyboard.press("Escape");
    await go(p, "/bridge");
    await p.getByRole("button", { name: "Get quote", exact: true }).click();
    await p
      .getByRole("article", { name: "Action preview" })
      .waitFor({ timeout: 90000 });
    await shot(p, `bridge-quote-${size}`);
    await p
      .getByRole("button", { name: "Mainnet wallet", exact: true })
      .click();
    await shot(p, `bridge-mainnet-${size}`);
    await p
      .getByRole("button", { name: "Connect mainnet wallet", exact: true })
      .click();
    await p.locator("near-wallet-selector, .near-wallet-selector").count();
    await p.waitForTimeout(1800);
    await shot(p, `mainnet-wallet-selector-${size}`);
    await go(p, "/agent");
    await p
      .getByRole("button", { name: "Connect wallet", exact: true })
      .waitFor({ state: "visible" });
    await p
      .getByRole("button", { name: "Connect wallet", exact: true })
      .click();
    await p.waitForTimeout(1600);
    await shot(p, `testnet-wallet-selector-${size}`);
    await go(p, "/agent");
    await context.route("**/api/agent", async (route) => {
      await p.waitForTimeout(1800);
      return failure(route, "CAP_PER_ACTION");
    });
    await p.getByRole("button", { name: /Stake 0\.2 NEAR$/ }).click();
    await p.getByRole("status").first().waitFor();
    await shot(p, `agent-loading-${size}`);
    await p
      .getByText("Blocked: over your per-trade limit", { exact: true })
      .waitFor();
    await shot(p, `agent-friendly-error-${size}`);
    await context.unroute("**/api/agent");
    await context.route("**/api/agent", (route) =>
      failure(route, "Unknown upstream failure"),
    );
    await p.getByRole("button", { name: /Stake 0\.2 NEAR$/ }).click();
    await p
      .getByText("Something went wrong — try again", { exact: true })
      .waitFor();
    await shot(p, `agent-fallback-error-${size}`);
    await p.locator(".error-details summary").click();
    await shot(p, `agent-error-details-${size}`);
    await context.route("**/api/near/guest", (route) =>
      failure(route, "Exceeded 4 providers: guest creation failed", 429),
    );
    await p
      .getByRole("button", { name: "Start free on testnet", exact: true })
      .click();
    await p
      .getByText("Guest sign-ups are busy — try again or connect a wallet", {
        exact: true,
      })
      .waitFor();
    await shot(p, `onboarding-busy-${size}`);
    await context.route("**/api/perps/markets", (route) =>
      failure(route, "Failed to fetch"),
    );
    await go(p, "/perps");
    await p.getByText("Network problem — try again", { exact: true }).waitFor();
    await shot(p, `perps-network-error-${size}`);
    await context.route("**/api/integrations/tokens", (route) =>
      failure(route, "Too many requests"),
    );
    await context.route("**/api/bridge/tokens", (route) =>
      failure(route, "Too many requests"),
    );
    await go(p, "/bridge");
    await p
      .getByText("Too many requests — wait a minute", { exact: true })
      .first()
      .waitFor();
    await shot(p, `bridge-rate-limit-${size}`);
    await context.close();
    // Read a real public testnet account in a non-signing fixture session to inspect data states.
    const readonly = await setup(width);
    await readonly.context.addInitScript(() =>
      localStorage.setItem(
        "leash:guest:v1",
        JSON.stringify({ accountId: "g-uufelp.leash-11141537.testnet" }),
      ),
    );
    for (const route of [
      "/portfolio",
      "/guardrails",
      "/swap",
      "/stake",
      "/lend",
    ]) {
      await go(readonly.p, route);
      await readonly.p
        .getByRole("button", { name: "Copy account ID" })
        .first()
        .waitFor();
      await readonly.p.waitForTimeout(600);
      await shot(readonly.p, `${route.slice(1)}-account-${size}`);
    }
    await go(readonly.p, "/guardrails");
    await readonly.p
      .getByRole("button", { name: "Pause agent", exact: true })
      .first()
      .click();
    await shot(readonly.p, `pause-dialog-${size}`);
    await readonly.p
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await readonly.p
      .getByRole("button", { name: "Revoke agent", exact: true })
      .first()
      .click();
    await shot(readonly.p, `revoke-dialog-${size}`);
    await readonly.p.keyboard.press("Escape");
    await readonly.p
      .getByRole("button", { name: "Close all perps", exact: true })
      .click();
    await shot(readonly.p, `close-all-dialog-${size}`);
    await readonly.p
      .getByRole("button", { name: "Keep positions open", exact: true })
      .click();
    await readonly.context.route("**/api/defi/state?*", (route) =>
      failure(route, "Failed to fetch"),
    );
    for (const path of [
      "/portfolio",
      "/guardrails",
      "/swap",
      "/stake",
      "/lend",
    ]) {
      await go(readonly.p, path);
      await readonly.p
        .getByText("Network problem — try again", { exact: true })
        .first()
        .waitFor();
      await shot(readonly.p, `${path.slice(1)}-balance-error-${size}`);
    }
    await readonly.context.close();
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  report.passed = true;
  console.log(
    `COPY STATE AUDIT PASS: ${report.checks.length} states, 1440px and 390px, zero overflow or raw-code matches`,
  );
} catch (e) {
  report.failure = e.message;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  writeFileSync(
    "docs/defi-ui-v3-copy-states.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
}
