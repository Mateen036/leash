// Tests AccountProvider's connected-wallet branch with an injected NEAR Connect adapter.
// Faucet API calls and balances are real testnet data; no signatures or receipts are mocked.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const { chromium } = createRequire("/tmp/localagentpay-browser/package.json")(
  "playwright",
);
const fixture = JSON.parse(
  readFileSync("docs/defi-v3-tokens-e2e.json", "utf8"),
);
const accountId = fixture.faucet.walletAccount;
const browser = await chromium.launch({
  executablePath: "/opt/google/chrome/chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
  storageState: "/workspace/secrets/leash/v3-tokens-ui-browser.json",
});
const page = await context.newPage();
page.setDefaultTimeout(45000);
const report = {
  at: new Date().toISOString(),
  mode: "Injected NEAR Connect adapter; real testnet faucet API",
  accountId,
  passed: false,
  checks: [],
};
try {
  await page.goto("http://localhost:3001/swap", { waitUntil: "networkidle" });
  await page.evaluate(async (accountId) => {
    const { getConnector } = await import("/lib/near/wallet.ts");
    const connector = await getConnector();
    connector.connect = async () => ({
      manifest: { name: "Test adapter" },
      getAccounts: async () => [{ accountId }],
    });
  }, accountId);
  await page
    .getByRole("button", { name: "Connect NEAR testnet wallet", exact: true })
    .click();
  await page.getByText("New here? Get test tokens", { exact: true }).waitFor();
  await page.getByText(accountId, { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Pause agent", exact: true })
      .count(),
    0,
  );
  report.checks.push(
    "Connected wallet takes precedence over saved guest; new-wallet faucet banner appears",
  );
  await page
    .locator(".wallet-faucet-banner")
    .getByRole("button", { name: "Get test tokens", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Get test tokens",
    exact: true,
  });
  await dialog.getByText("Up to 25", { exact: true }).waitFor();
  const box = await dialog.boundingBox();
  assert.ok(box.y >= 0 && box.y + box.height <= 845, JSON.stringify(box));
  await page.screenshot({
    path: "/workspace/shots/v3tok-wallet-faucet-mobile.png",
    fullPage: false,
  });
  const request = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/faucet" && r.method() === "POST",
  );
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/faucet" &&
      r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Claim", exact: true }).click();
  assert.equal((await request).postDataJSON().accountId, accountId);
  const claimResponse = await response;
  if (claimResponse.status() === 429) {
    await dialog.getByRole("alert").waitFor();
    assert.match(await dialog.getByRole("alert").innerText(), /wait|recently/i);
    report.checks.push(
      "Claim POST uses the connected wallet ID; repeated claims show a friendly rate-limit message",
    );
    await page.keyboard.press("Escape");
  } else {
    assert.equal(claimResponse.status(), 200);
    await dialog
      .getByRole("list", { name: "Faucet results", exact: true })
      .waitFor({ timeout: 150000 });
    assert.ok(
      await dialog
        .getByText("You already have enough", { exact: true })
        .count(),
    );
    await dialog
      .getByText("Sending test tokens… Each token settles separately.", {
        exact: true,
      })
      .waitFor({ state: "hidden" });
    assert.doesNotMatch(await dialog.innerText(), /FAUCET_|\{"/);
    await page.screenshot({
      path: "/workspace/shots/v3tok-wallet-faucet-result-mobile.png",
      fullPage: false,
    });
    report.checks.push(
      "Claim POST uses the connected wallet ID and renders real already-funded results",
    );
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
  }
  await page.route("**/tokens/near.png", (route) => route.abort());
  await page.reload({ waitUntil: "networkidle" });
  await page
    .locator(".amount-panel")
    .first()
    .locator(".token-initials")
    .waitFor();
  report.checks.push("Failed token image renders coloured initials fallback");
  report.passed = true;
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  writeFileSync(
    "docs/defi-v3-wallet-ui.json",
    JSON.stringify(report, null, 2) + "\n",
  );
}
