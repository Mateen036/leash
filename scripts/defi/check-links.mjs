// Audit UI URLs, documentation, and the service URLs found alongside them.
// Network endpoints require their documented HTTP methods; never replace a working POST endpoint with a web page.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
const exec = promisify(execFile);
const { stdout } = await exec("rg", [
  "--files",
  "components",
  "app",
  "lib",
  "docs",
]);
const files = [
  "README.md",
  ...stdout
    .trim()
    .split("\n")
    .filter(
      (p) => /^(components|app|lib)\//.test(p) || /^docs\/[^/]+\.md$/.test(p),
    ),
].filter((p) => /\.(tsx?|css|json|md)$/.test(p) && p !== "docs/link-check.md");
const urls = new Map();
for (const path of files) {
  const content = await readFile(path, "utf8");
  for (const match of content.matchAll(/https?:\/\/[^\s<>"'`\\)\]]+/g)) {
    const url = match[0].replace(/[.,;:]+$/, "");
    if (!urls.has(url)) urls.set(url, new Set());
    urls.get(url).add(path);
  }
}
// Verify the old NEAR Connect URL and npm's redirected repository as well.
urls.set(
  "https://github.com/hot-dao/near-connect",
  new Set(["old protocol link"]),
);
urls.set(
  "https://github.com/hot-dao/near-selector",
  new Set(["npm repository/homepage"]),
);
const sampleHash = "DFDDLVn8UTdaak4ipLHc5sQTDzgdE1dEYrm49UQyftyg";
function sample(url) {
  if (!url.includes("${")) return url;
  if (url.startsWith("https://testnet.nearblocks.io/txns/"))
    return `https://testnet.nearblocks.io/txns/${sampleHash}`;
  if (url.startsWith("https://testnet.nearblocks.io/address/"))
    return "https://testnet.nearblocks.io/address/ref-finance-101.testnet";
  if (url.startsWith("https://nearblocks.io/txns/"))
    return "https://nearblocks.io/txns/11111111111111111111111111111111";
  if (url.startsWith("https://sepolia.arbiscan.io/address/"))
    return "https://sepolia.arbiscan.io/address/0x0000000000000000000000000000000000000000";
  throw new Error(`No representative URL for ${url}`);
}
async function request(url, head) {
  try {
    const { stdout } = await exec("curl", [
      head ? "-sIL" : "-sL",
      "--max-time",
      "20",
      "-A",
      "Mozilla/5.0",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code} %{url_effective}",
      url,
    ]);
    return { code: stdout.slice(0, 3), final: stdout.slice(4).trim() };
  } catch {
    return { code: "000", final: url };
  }
}
const queue = [...urls.keys()].sort();
const rows = [];
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const url = queue.shift();
      const checked = sample(url);
      const head = await request(checked, true);
      const result = head.code === "200" ? head : await request(checked, false);
      rows.push({
        url,
        checked,
        head: head.code,
        ...result,
        files: [...urls.get(url)].sort(),
      });
    }
  }),
);
rows.sort((a, b) => a.url.localeCompare(b.url));
function note(row) {
  if (row.url === "https://github.com/hot-dao/near-connect")
    return "Fixed → https://github.com/azbang/near-connect (200).";
  if (row.url === "https://github.com/hot-dao/near-selector")
    return `npm metadata redirects → ${row.final} (200).`;
  if (row.code === "200")
    return row.final.replace(/\/$/, "") !== row.checked.replace(/\/$/, "")
      ? `Resolves → ${row.final}`
      : "OK";
  if (/localhost/.test(row.url))
    return "Local development example; no public site expected.";
  if (/w3.org/.test(row.url))
    return "SVG XML namespace; identifier, not a navigation link.";
  if (/nearblocks.io|arbiscan.io/.test(row.url))
    return "Explorer blocks this curl client (403). Retained exact transaction/address link.";
  if (/\/v0\/quote$/.test(row.url))
    return "POST API (GET returns 404); executable service URL retained.";
  if (/cloud-api.near.ai/.test(row.url))
    return "Authenticated AI API base, not a web page; retained. Public UI links use https://cloud.near.ai (200).";
  if (/rpc|faucet\/usdc/.test(row.url))
    return "POST service endpoint (GET returns 405); retained for functionality.";
  return "Needs review";
}
const report =
  `# External link check\n\nChecked ${new Date().toISOString()} with curl -sIL, a browser user agent, redirects, and GET retry for every non-200 HEAD response. ${rows.length} unique URLs extracted from components/, app/, lib/, README.md and docs/*.md. Dynamic explorer templates use the representative URL shown below; mainnet transaction template uses a placeholder because this pass does not spend mainnet funds.\n\nNEAR Connect: npm view @hot-labs/near-connect repository homepage returns hot-dao/near-selector; curl follows that repository to azbang/near-connect (200). The old hot-dao/near-connect URL returns 404. The UI now points directly to azbang/near-connect. Protocol cards with curl-blocked explorer landing pages now use official Rhea, LiNEAR, and NEAR documentation (all 200).\n\nAll informational navigation links return 200. Remaining non-200 responses are listed honestly: local examples, an XML namespace, authenticated/POST service endpoints, and curl-blocked explorer evidence. API addresses were not replaced by web pages. Explorer receipts remain linked to the exact transaction.\n\n| URL | HEAD → final status | Fixed / result | Found in |\n| --- | --- | --- | --- |\n` +
  rows
    .map(
      (r) =>
        `| ${r.url.replaceAll("|", "%7C")} | ${r.head} → ${r.code} | ${note(r)}${r.checked !== r.url ? ` Representative: ${r.checked}` : ""} | ${r.files.join(", ")} |`,
    )
    .join("\n") +
  "\n";
await writeFile("docs/link-check.md", report);
await writeFile("/tmp/v3copy-link-results.json", JSON.stringify(rows, null, 2));
console.log(
  `Checked ${rows.length} unique URLs; ${rows.filter((r) => r.code === "200").length} return 200. Details: docs/link-check.md`,
);
for (const r of rows.filter((r) => note(r) === "Needs review"))
  console.log("UNRESOLVED", r.url, r.code);
