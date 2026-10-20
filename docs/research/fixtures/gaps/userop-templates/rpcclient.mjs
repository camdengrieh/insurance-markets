// Read-only JSON-RPC client with the same politeness rules as xofetch.py (shared counter file in $XO_CACHE_DIR).
// UA fixed; >=300 ms gap per host; hard cap 150 requests per host; 401/403 marks the host blocked; only READ methods.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const CACHE = process.env.XO_CACHE_DIR || join(here, '.cache');
mkdirSync(CACHE, { recursive: true });
const COUNTER = join(CACHE, '_counter.json');
const UA = 'insurance-markets-research/0.1';
const CAP = 150, GAP = 300;
const READ = new Set(['eth_chainId', 'eth_blockNumber', 'eth_call', 'eth_getCode', 'eth_getLogs', 'eth_getStorageAt', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getBalance', 'eth_supportedEntryPoints', 'web3_clientVersion']);
const last = {};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rd = () => existsSync(COUNTER) ? JSON.parse(readFileSync(COUNTER, 'utf8')) : { hosts: {}, blocked: {} };
export async function rpc(url, method, params = [], { cache = true } = {}) {
  if (!READ.has(method)) throw new Error('method not in read allowlist: ' + method);
  const host = new URL(url).host;
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const key = join(CACHE, 'r_' + createHash('sha256').update('RPC|' + url + '|' + body).digest('hex').slice(0, 40) + '.json');
  if (cache && existsSync(key)) return JSON.parse(readFileSync(key, 'utf8'));
  let c = rd();
  if (c.blocked[host]) throw new Error('host blocked: ' + host + ' ' + c.blocked[host]);
  if ((c.hosts[host] || 0) >= CAP) throw new Error('cap reached for ' + host);
  const wait = GAP - (Date.now() - (last[host] || 0)); if (wait > 0) await sleep(wait);
  let delay = 1000, out;
  for (let i = 0; i < 4; i++) {
    c = rd(); c.hosts[host] = (c.hosts[host] || 0) + 1; writeFileSync(COUNTER, JSON.stringify(c, null, 1)); last[host] = Date.now();
    const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' }, body });
    const text = await r.text();
    if (r.status === 401 || r.status === 403) { c = rd(); c.blocked[host] = 'HTTP ' + r.status; writeFileSync(COUNTER, JSON.stringify(c, null, 1)); out = { status: r.status, body: text }; break; }
    if ([429, 500, 502, 503, 504].includes(r.status)) { await sleep(delay); delay *= 2; out = { status: r.status, body: text }; continue; }
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    out = { status: r.status, body: parsed }; break;
  }
  writeFileSync(key, JSON.stringify({ url, method, ...out }));
  return out;
}
export const result = (o) => { if (o.status !== 200 || o.body?.error) throw new Error('rpc fail ' + o.status + ' ' + JSON.stringify(o.body).slice(0, 200)); return o.body.result; };
