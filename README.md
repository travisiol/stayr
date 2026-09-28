# STAYR — Patience pays.

Trading fees belong to holders. Stay longer to increase your share. Built for
Robinhood Chain.

STAYR is an ERC-20 whose trading fee on its own Uniswap v2 pools goes, in full,
to a rewards vault with no owner. The vault sells the fee for ETH in capped
batches anyone can trigger and allocates it to holders by **balance ×
multiplier**, where the multiplier grows with holding time (1.5× after 1 h,
2× after 2 h, 3× after 24 h) and resets on any sale. Holders claim whenever
they like, in ETH or swapped to USDG at claim time.

- Site: https://stayr.xyz · X: https://x.com/stayr_xyz
- Chain: Robinhood Chain (id 4663) — verified against
  [docs.robinhood.com/chain/connecting](https://docs.robinhood.com/chain/connecting)
  on 2026-09-28
- Economics, open questions and remaining permissions: [ECONOMICS.md](ECONOMICS.md)

## Status

| | Works locally | Works on testnet | Needs a decision or a deployment |
| --- | --- | --- | --- |
| Landing page | ✔ | ✔ (static) | — |
| App: read-only states (not deployed / disconnected / wrong network / loading / stale / no balance / no rewards) | ✔ | ✔ | — |
| App: connect, countdown, claim in ETH, claim as USDG with quote + min, pending / confirmed / rejected / reverted | ✔ on the local Hardhat stack with real Uniswap v2 bytecode | ✖ not deployed | Testnet needs verified Uniswap v2 + USDG addresses (not in the official docs) |
| Contracts + 25 tests | ✔ | — | Economics questions in ECONOMICS.md §5 |
| Mainnet | ✖ | — | Your explicit approval; never done by this repo on its own |

Nothing has been deployed anywhere. No token exists. The site shows a clear
“not deployed” status until `NEXT_PUBLIC_STAYR_TOKEN` and
`NEXT_PUBLIC_STAYR_REWARDS` are set.

## How the pieces fit

```
wallet ──trade──▶ Uniswap v2 pool ◀──── StayrToken._update: charges feeBps on
                                         pool trades, sends STAYR to the vault,
                                         reports every transfer
                                                      │
                                                      ▼
                    StayrRewards (no owner) ── harvest(): sells ≤ 0.5 % of the
                    ├ ETH ledger                  pool reserve for ETH, ≥ 10 min apart
                    ├ USDG ledger              ── allocate(): splits by weights in force
                    └ per-holder positions     ── claim(ETH | USDG, minOut, deadline)
```

- `contracts/contracts/StayrToken.sol` — the token. Fee on transfers that touch a registered Uniswap v2 pair; pairs discovered from the factory (STAYR/WETH, STAYR/USDG) or registered permissionlessly (`registerPair(quote)`). No mint after construction, no burn, no owner.
- `contracts/contracts/StayrRewards.sol` — the vault. Deploys the token, receives fees, harvests, allocates, pays claims. Bounded epoch/checkpoint accounting (explained in the contract header and ECONOMICS.md §4).
- `src/` — Next.js 16 site: landing (`/`), app (`/app`), same-origin RPC relay (`/api/rpc`).
- `contracts/test/Stayr.test.ts` — 25 scenarios against the **real Uniswap v2 factory/router/WETH9 bytecode** (published build artifacts): multiple holders joining at different times, milestone crossings, partial sales and transfers, additional purchases, empty eligibility, rounding and dust, repeated claims and double-claim prevention, reentrancy, failed payouts, harvest cap and cooldown, conservation across a random sequence, and an ABI check that no owner/admin/setter exists.

## Run it locally

Requirements: Node ≥ 22.13 (tested on 24), npm.

```bash
npm install
npm --prefix contracts install
npm run test:contracts          # 25 passing
npm test                        # rewards-math unit tests
```

Local stack (three terminals, or background the first):

```bash
npm run node:local              # Hardhat node on :8868
npm run deploy:local            # real Uniswap v2 + mock USDG + STAYR, liquidity, writes contracts/deployments/local.json
npm run seed:local              # four wallets buy at different times, one sells, harvests, one claim
NEXT_PUBLIC_CHAIN_ID=31337 npm run dev   # site on http://localhost:3868 reading local.json
```

`seed:local` moves the node's clock forward (about a day), so the app reads
its clock from the chain rather than the browser.

To drive the app without a wallet extension, load the dev wallet stub from
the browser console on the local site — it announces itself over EIP-6963 and
sends transactions from Hardhat account #1 (“alice”, who has claimable
rewards after the seed):

```js
const s = document.createElement("script"); s.src = "/dev/wallet.js"; document.head.appendChild(s);
```

Set `window.__DEV_WALLET_REJECT = true` before claiming to see the “rejected
in wallet” state. The stub is a static file under `public/dev/`; nothing in
the app references it.

Screenshots: `npm run capture` (headless Chrome) → `docs/captures/`.

## Configuration

Copy `.env.example` to `.env.local` and `contracts/.env.example` to
`contracts/.env`. Every variable is documented in place. No secrets belong in
`.env.local`; the deployer key lives only in `contracts/.env`, which is
git-ignored.

Verified Robinhood Chain mainnet addresses (on chain, 2026-09-28):

| | Address | How verified |
| --- | --- | --- |
| Uniswap v2 factory | `0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f` | `router.factory()` returns it; 69 080 pairs |
| Uniswap v2 router02 | `0x89e5db8b5aa49aa85ac63f691524311aeb649eba` | Uniswap deployments page; `WETH()` matches the docs |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | docs.robinhood.com/chain/contracts; symbol `WETH` |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | docs.robinhood.com/chain/contracts + Paxos docs; symbol `USDG`, 6 decimals |
| WETH/USDG v2 pair | `0x8803c117ccae7b5146297876c2a25df135141c4d` | `factory.getPair`; ~72 ETH / ~193 k USDG reserves |

Testnet (chain 46630, `https://rpc.testnet.chain.robinhood.com`,
`https://explorer.testnet.chain.robinhood.com`): the same WETH address has no
code there and the official docs publish no testnet Uniswap or USDG
addresses. `deploy:testnet` refuses to run until you supply verified ones.

## Deploy (testnet, then mainnet — only with your approval)

```bash
cd contracts
cp .env.example .env            # fill DEPLOYER_PRIVATE_KEY and the four venue addresses
npm run deploy:testnet          # writes deployments/robinhood-testnet.json
npm run verify:robinhood        # Blockscout source verification (also for testnet with --network)
```

Mainnet additionally requires `CONFIRM_MAINNET=yes`. The deploy script
deploys the vault (which deploys the token) and **nothing else**: adding
liquidity is a separate, deliberate step by the operator through the Uniswap
router. The deposit itself is a pool trade and pays the fee to the vault.

After deploying, set `NEXT_PUBLIC_CHAIN_ID`, and either set
`NEXT_PUBLIC_STAYR_TOKEN` / `NEXT_PUBLIC_STAYR_REWARDS` or let
`next.config.ts` read them from the deployment record. Set
`NEXT_PUBLIC_STAYR_START_BLOCK` to the deployment block so the claim history
scan starts there, and `NEXT_PUBLIC_SOURCE_VERIFIED=true` once Blockscout
shows the verified source.

Every recompilation changes the bytecode; `npm run compile` in `contracts/`
re-exports the ABIs into `src/lib/abi/` so the site cannot drift.

## What the app promises, and how it keeps the promise

- Claimable balances are the contract's `holderOf(account)`, refreshed every
  10 s and labelled with their age; a failed or old read is flagged **Stale**.
  Nothing animates an invented balance.
- The countdown to the next milestone runs locally on the chain's clock and
  is recomputed from `nextMilestoneEpoch` on every refresh.
- The claim button is disabled until the contract reports something to claim.
  Success is shown only after `waitForTransactionReceipt` returns
  `status: "success"`; a mined-but-reverted transaction is shown as such.
- “USDG” payout shows the Uniswap v2 quote, a 0.50 % slippage tolerance, the
  minimum received and the fees involved before signing. It is a swap, not a
  fiat withdrawal.
- No token approval is needed to claim (the vault pays out of its own
  balances), so the “approval required” state does not occur in this flow.

## Trust, and how the site earns it

Everything a careful visitor can check is put where they can check it —
and nothing that cannot be checked is claimed.

- **Landing → "Verify it yourself"**: the vault's `stats()` read live from the
  chain, the three-step recipe to read and claim from the explorer without
  this site, the risks in plain words, and exactly what the app does with a
  wallet.
- **App → trust bar**: the host it is served from (official `stayr.xyz`,
  local build, or a red *unofficial host* warning — set
  `NEXT_PUBLIC_OFFICIAL_HOST` if the official domain changes), the rewards
  contract address with its explorer link and source-verification status,
  and the standing promise: no token approvals, no message signatures, one
  function.
- **Read before you connect**: "Look up any address" shows any position
  read-only, with the same `holderOf` call the dashboard uses.
- **Connect dialog**: says what connecting shares (a public address) and what
  it never asks (a signature, an approval, an account).
- **Claim flow**: the call is simulated on the chain first; the exact call
  (contract address, function, decoded arguments, "0 ETH sent, no
  approvals", expected payout) is shown for review before the wallet opens;
  a failing simulation is explained and nothing is sent. After the receipt,
  the decoded `Claimed` event (amounts, block, hash) is shown — never a
  success before confirmation.
- **No third parties**: fonts are self-hosted (`public/fonts`), images are
  local, reads go through this site's own `/api/rpc`. No analytics, no
  cookies, no external scripts.
- **No badges**: no audit claim, no partner logos, no testimonials, no
  invented metrics. "Source verified" appears only when
  `NEXT_PUBLIC_SOURCE_VERIFIED=true`, and the repository link only when
  `NEXT_PUBLIC_REPO_URL` is set.

## Not claimed

Not audited. Not deployed. Not a yield. See ECONOMICS.md §6 for the
permissions and dependencies that remain.
