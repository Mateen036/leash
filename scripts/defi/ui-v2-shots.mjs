// Final UI v2 screenshots on the live site with a fresh testnet guest. Real testnet txs only.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire("/tmp/localagentpay-browser/package.json")(
  "playwright",
);
const base = process.env.BASE || "https://leash.leash-agent.workers.dev";
const dir = "/workspace/shots/";
const b = await chromium.launch({
  executablePath:
    process.env.CHROME ||
    "/home/box/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell",
});
const ev = {
  at: new Date().toISOString(),
  base,
  shots: [],
  transactions: {},
  errors: [],
};
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.setDefaultTimeout(90000);
p.on("pageerror", (e) => ev.errors.push(e.message));
p.on("response", async (r) => {
  try {
    const path = new URL(r.url()).pathname;
    if (path === "/api/near/guest") {
      const d = await r.json();
      ev.accountId = d.accountId;
      ev.transactions.create = d.txHash;
    }
    if (path === "/api/defi/execute") {
      const d = await r.json();
      ev.transactions[r.request().postDataJSON().action.kind] = d.txHash;
    }
  } catch {}
});
const shot = async (page, name, full = true) => {
  const path = `${dir}leash-v2-${name}.png`;
  await page.screenshot({ path, fullPage: full });
  ev.shots.push(path);
  console.log(path);
};
const go = async (page, path) => {
  await page
    .goto(base + path, { waitUntil: "networkidle", timeout: 90000 })
    .catch(() => {});
  await page.waitForTimeout(2500);
};
try {
  await go(p, "/agent");
  await p
    .getByRole("button", { name: "Start free on testnet", exact: true })
    .click();
  await p
    .getByText("Guard installed.", { exact: false })
    .last()
    .waitFor({ timeout: 120000 });
  const guest = await p.evaluate(() => localStorage.getItem("leash:guest:v1"));
  // Agent: review card, then executed timeline
  await p.getByRole("button", { name: /Stake 0\.2 NEAR$/ }).click();
  const prev = p.getByRole("article", { name: "Action preview" }).last();
  await prev
    .getByRole("button", {
      name: /^(Swap|Stake|Unstake|Supply|Withdraw|Open long|Open short|Close position)$/,
    })
    .waitFor();
  await p.waitForTimeout(800);
  await shot(p, "flow-agent-review-desktop");
  await prev
    .getByRole("button", {
      name: /^(Swap|Stake|Unstake|Supply|Withdraw|Open long|Open short|Close position)$/,
    })
    .click();
  await prev
    .getByText("Final · protocol execution confirmed", { exact: true })
    .first()
    .waitFor({ timeout: 120000 });
  await p.waitForTimeout(800);
  await shot(p, "flow-agent-timeline-done-desktop");
  // Swap: picker modal, review/route card, timeline done
  await go(p, "/swap");
  await p
    .getByRole("button", {
      name: "Select token, NEAR on NEAR testnet",
      exact: true,
    })
    .click();
  await p.getByRole("textbox", { name: "Search tokens" }).waitFor();
  await p.waitForTimeout(700);
  await shot(p, "flow-picker-open-desktop", false);
  await p.keyboard.press("Escape");
  await p
    .getByRole("textbox", { name: "You send amount", exact: true })
    .fill("0.05");
  await p.getByRole("button", { name: "Get quote", exact: true }).click();
  const card = p.getByRole("article", { name: "Action preview" }).last();
  await card
    .getByRole("button", {
      name: /^(Swap|Stake|Unstake|Supply|Withdraw|Open long|Open short|Close position)$/,
    })
    .waitFor();
  await p.waitForTimeout(800);
  await shot(p, "flow-swap-review-desktop");
  await card
    .getByRole("button", {
      name: /^(Swap|Stake|Unstake|Supply|Withdraw|Open long|Open short|Close position)$/,
    })
    .click();
  await card
    .getByText("Final · protocol execution confirmed", { exact: true })
    .first()
    .waitFor({ timeout: 120000 });
  await p.waitForTimeout(800);
  await shot(p, "flow-swap-timeline-done-desktop");
  // Bridge live quote (dry, no funds)
  await go(p, "/bridge");
  await p.getByRole("button", { name: "Get quote", exact: true }).click();
  await p.getByRole("article", { name: "Action preview" }).waitFor();
  await p.waitForTimeout(800);
  await shot(p, "flow-bridge-route-desktop");
  // Perps market picker
  await go(p, "/perps");
  await p.getByRole("button", { name: /ETH.*USDC.*Perpetual/ }).click();
  await p.getByRole("textbox", { name: "Search markets" }).waitFor();
  await p.waitForTimeout(700);
  await shot(p, "flow-perps-market-picker-desktop", false);
  await p.keyboard.press("Escape");
  const pages = [
    "home",
    "agent",
    "swap",
    "stake",
    "lend",
    "perps",
    "portfolio",
    "guardrails",
    "bridge",
    "protocols",
  ];
  for (const name of pages) {
    await go(p, name === "home" ? "/" : "/" + name);
    await shot(p, `${name}-desktop`);
  }
  const m = await b.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await m.addInitScript(
    (g) => g && localStorage.setItem("leash:guest:v1", g),
    guest,
  );
  const mp = await m.newPage();
  mp.on("pageerror", (e) => ev.errors.push(e.message));
  for (const name of pages) {
    await go(mp, name === "home" ? "/" : "/" + name);
    const overflow = await mp.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    if (overflow) ev.errors.push(`${name} mobile overflow`);
    await shot(mp, `${name}-mobile`);
  }
  await go(mp, "/swap");
  await mp
    .getByRole("button", {
      name: "Select token, NEAR on NEAR testnet",
      exact: true,
    })
    .click();
  await mp.getByRole("textbox", { name: "Search tokens" }).waitFor();
  await mp.waitForTimeout(700);
  await shot(mp, "flow-picker-open-mobile", false);
  ev.passed = ev.errors.length === 0;
} catch (e) {
  ev.failure = e.message;
  await shot(p, "shots-failure").catch(() => {});
  console.log("FAIL", e.message);
  process.exitCode = 1;
} finally {
  writeFileSync(
    "docs/defi-ui-v2-shots.json",
    JSON.stringify(ev, null, 2) + "\n",
  );
  await b.close();
}
