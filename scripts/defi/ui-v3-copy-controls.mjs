// Browser owner controls with a disposable real testnet guest. Keys stay in browser memory.
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
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const evidence = {
  base,
  at: new Date().toISOString(),
  passed: false,
  transactions: {},
  errors: [],
};
page.on("pageerror", (e) => evidence.errors.push(e.message));
page.on("response", async (r) => {
  if (new URL(r.url()).pathname === "/api/near/guest" && r.ok()) {
    const d = await r.json();
    evidence.accountId = d.accountId;
    evidence.transactions.create = d.txHash;
  }
});
page.setDefaultTimeout(90000);
const state = async () =>
  (
    await page.request.get(
      `${base}/api/defi/state?account=${evidence.accountId}`,
    )
  ).json();
async function control(name, confirm, key) {
  const receipt = page.locator(".guard-controls .guard-receipt").first();
  const before = (await receipt.count())
    ? await receipt.getAttribute("href")
    : null;
  await page.getByRole("button", { name, exact: true }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: confirm, exact: true })
    .click();
  await page.waitForFunction(
    (before) =>
      [...document.querySelectorAll(".guard-receipt")].some(
        (a) => a.getAttribute("href") !== before,
      ),
    before,
    { timeout: 90000 },
  );
  evidence.transactions[key] = (await receipt.getAttribute("href"))
    .split("/")
    .at(-1);
}
try {
  await page.goto(base + "/guardrails", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Start free on testnet", exact: true })
    .click();
  await page
    .getByText("Guard installed. Your agent is ready.", { exact: true })
    .waitFor({ timeout: 120000 });
  evidence.transactions.install = (
    await page
      .getByRole("link", { name: "Install tx", includeHidden: true })
      .getAttribute("href")
  )
    .split("/")
    .at(-1);
  await control("Pause agent", "Confirm pause", "pause");
  assert.equal((await state()).policy.paused, true);
  await control("Resume agent", "Confirm resume", "resume");
  assert.notEqual(evidence.transactions.pause, evidence.transactions.resume);
  assert.equal((await state()).policy.paused, false);
  await page.getByLabel("near per_action", { exact: true }).fill("0.45");
  await page
    .getByRole("button", { name: "Review policy changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm policy · owner signs", exact: true })
    .click();
  const policy = page.getByRole("link", { name: "Policy transaction" });
  await policy.waitFor();
  evidence.transactions.policy = (await policy.getAttribute("href"))
    .split("/")
    .at(-1);
  assert.equal(
    (await state()).policy.caps.near.per_action,
    "450000000000000000000000",
  );
  await control("Revoke agent", "Delete agent key", "revoke");
  assert.equal((await state()).agentKey, null);
  evidence.passed = true;
  console.log("OWNER CONTROLS PASS", JSON.stringify(evidence));
} catch (e) {
  evidence.failure = e.message;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  writeFileSync(
    "docs/defi-ui-v3-copy-controls.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await browser.close();
}
