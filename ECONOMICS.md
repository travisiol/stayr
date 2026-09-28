# STAYR — Economics

This file records what the contracts *currently* do, which of those behaviours
are deliberate local assumptions rather than decisions, and the questions that
must be answered before anything is deployed with real money. Nothing here has
been decided for production.

## 1. What is real

| Statement | Status |
| --- | --- |
| STAYR collects a fee, in STAYR, on every trade between a wallet and one of its own Uniswap v2 pools. | Implemented in `StayrToken._update`; tested. |
| The fee goes to a vault with no owner, is sold for ETH in capped batches anyone can trigger, and is allocated to holders by balance × multiplier. | Implemented in `StayrRewards`; tested. |
| Holding longer without selling raises the multiplier (1.5× / 2× / 3×); selling or transferring out resets it. | Implemented; tested. |
| Allocations use the weights in force when they happen; a later milestone never re-scores an earlier allocation. | Implemented (checkpointed accumulator); tested. |
| Holders claim any time, in ETH, or with the ETH part swapped to USDG on Uniswap v2 at claim time with a caller-set minimum. | Implemented; tested against real Uniswap v2 bytecode. |
| Nothing in the system can be paused, upgraded, swept, re-pointed or re-parameterised after deployment. | True of the code; see §6 for what remains. |

## 2. What STAYR cannot collect

“100 % of trading fees to holders” means **100 % of the fee STAYR itself
charges**. It does not, and cannot, mean:

- the Uniswap v2 pool fee (0.30 % of every swap, paid to liquidity providers, with a protocol switch controlled by Uniswap governance);
- fees charged by aggregators, wallets or front-ends that route trades;
- network gas;
- fees on venues STAYR does not know about (a Uniswap v3/v4 pool, a bridge, a CEX). The token only charges transfers that touch a **registered Uniswap v2 pair**: the STAYR/WETH and STAYR/USDG pairs are discovered automatically from the factory, and any other v2 pair of STAYR can be registered by anyone through `registerPair(quote)`, which accepts only what the factory reports.

A second real fee path exists on Robinhood Chain and is supported without any
code change: the vault accepts ETH from any sender (`receive()`), so a Pons V2
launch that names the vault as `creatorFeeRecipient` streams its creator fees
to holders too. The site's landing copy only speaks about the token-level fee.

## 3. Current parameters (local assumptions, not decisions)

Set in `contracts/scripts/lib/venue.ts` (`stayrParams`) and mirrored in
`src/lib/site.ts` for the landing copy. All are constructor arguments; none
can be changed after deployment.

| Parameter | Value | Note |
| --- | --- | --- |
| `feeBps` | 200 (2 %) | On buys and sells against registered pools. Not on wallet transfers. Capped at 10 % by the constructor. |
| `epochSeconds` | 60 | Time resolution of the accounting. |
| `baseMultiplierBps` | 10 000 (1×) | **Open** — see Q1. |
| milestones | 60 / 120 / 1 440 epochs → 1.5× / 2× / 3× | 1 h / 2 h / 24 h at 60-second epochs. |
| `harvestCapBps` | 50 (0.5 % of the pool's STAYR reserve per harvest) | Bounds price impact and makes sandwiching a harvest unprofitable. |
| `harvestCooldown` | 600 s | One harvest per ten minutes. |
| `forfeitPendingOnSale` | false | Already-accrued rewards survive a sale. **Open** — see Q3. |
| supply | 1 000 000 000 STAYR, 18 decimals | Minted once to `supplyRecipient` (the deployer by default). |

Behaviours that are code, not parameters:

| Behaviour | Current rule | Open question |
| --- | --- | --- |
| Additional purchase | Merges at a balance-weighted average start epoch (rounded later). A wallet holding 1 token for a day cannot buy 1 M tokens and have them at 3×. | Q4 |
| Partial sale | Any decrease resets the whole position's age to now. | Q5 |
| Wallet transfer | Sender is treated as a seller (reset), recipient as a buyer (merge). | Q5 |
| Pools, the vault, the token | Never eligible (weight 0). Discovered v2 pairs, or registered by anyone via the factory. | Q6 |
| Routers, bridges, exchange wallets, LP tokens | Eligible like any wallet; nothing distinguishes them on chain. | Q6 |
| No eligible weight | Funds wait unallocated and go to the next allocation once someone holds. | Q8 |
| Milestone timing | Credited at the start of epoch `start + 1 + d`: the first epoch in which the wallet has *provably* held `d` epochs. Up to one epoch (60 s) late, never early. | — |
| Dust | Floor rounding leaves at most a few wei per allocation in the vault, unclaimable by anyone. | — |

## 4. Accounting design and its trade-offs

**Weight.** `weight = balance × multiplierBps`. Total weight `W` is kept as
of a *synced epoch* plus a schedule of future increments keyed by epoch (one
mapping entry per milestone per position, plus a bitmap so a roll-forward
skips 256 empty epochs per storage read). Every transfer is O(1) in the number
of holders; a roll-forward is O(elapsed epochs / 256) and can be advanced in
slices by anyone (`sync(maxWords)`).

**Allocation.** Each allocation of `A` ETH at total weight `W` adds `A / W` to
an accumulator `acc` and writes a checkpoint `(epoch, accEth, accUsdg)`. A
holder with weight `w` over an interval earns `w × Δacc`. Because a holder's
multiplier only steps up at known epochs, its earnings since the last
settlement are at most four intervals, each valued with the `acc` in force at
the interval boundary (binary search over checkpoints). This is what makes the
distribution **non-retroactive**: an allocation is split by the weights that
existed when it happened.

**Trade-offs, honestly:**

- Allocation only happens when the roll-forward is complete. After a long
  silence the first touch may only sync part of the way (16 bitmap words ≈ 4 096
  epochs ≈ 2.8 days per transfer or claim); the funds simply wait until anyone
  finishes the sync. Tested (`defers allocation … catches up in slices`).
- Direct deposits (ETH sent to the vault, USDG deposits) sit unallocated until
  the next transfer, claim, harvest or `allocate()` call. Every transfer
  allocates *before* moving balances, so a wallet cannot buy into fees that
  accrued while it held nothing. Tested.
- Harvest sells with `amountOutMin = 0`. Its safety is the size cap, not a
  slippage check: a sandwich against a sale ≤ 0.5 % of the reserve costs the
  attacker more in pool fees than the price move returns. A slippage check
  computed from reserves at execution time would not protect against a
  sandwich anyway (the front-run has already moved the reserves).
- Every harvest sells STAYR into the pool. Holders are paid in ETH at the
  cost of a small, bounded, recurring sell pressure. The alternative —
  distributing STAYR itself — was not chosen because the brief asks for ETH
  and a stablecoin.
- USDG payout is a swap at claim time, not a second income stream: unless
  someone deposits USDG into the vault, the USDG ledger stays at zero and
  “USDG” means “my ETH, swapped on claim”, with the quote, slippage
  tolerance and minimum shown before signing. There is no fiat withdrawal.
- The saturating subtraction in `_removeWeight` means an accounting fault would
  distort totals rather than freeze transfers. With no owner to repair a frozen
  token, that is the safer failure mode; the invariant `totalWeight = Σ holder
  weights` is checked in the conservation test.

## 5. Questions to answer before a deployable configuration

Please answer these in one pass; each maps to a parameter or a small code
branch.

1. **Multiplier before the first hour.** Currently 1× (a fresh buyer earns at
   base weight from the first allocation after the purchase). Alternative:
   0× until the first milestone, i.e. nothing at all for the first hour.
2. **What “reset to zero” means right after a sale.** Currently: the
   holding age resets to zero and the wallet continues at the base multiplier
   with its remaining balance. Alternative: zero weight for a cool-down.
3. **Do accrued rewards survive a sale?** Currently yes
   (`forfeitPendingOnSale = false`). If no, forfeited amounts return to the
   pool and are redistributed at the next allocation (implemented and tested
   behind the flag).
4. **Do additional purchases restart or preserve the holding age?**
   Currently balance-weighted average (neither). Alternatives: full restart on
   any purchase; preserve (exploitable — a tiny old position would confer its
   multiplier on any size of purchase).
5. **Partial sales and wallet transfers.** Currently any decrease is a full
   reset, and the recipient of a transfer is treated as a buyer. Alternatives:
   proportional reset (only the sold fraction), or transfers preserving age
   between a user's own wallets (not verifiable on chain).
6. **LP positions, routers, bridges, exchange wallets.** Currently only
   registered Uniswap v2 pairs, the vault and the token are excluded; any other
   contract or custodial wallet earns like a wallet. Options: a permissionless
   registry of excluded contracts verified by code (e.g. any address with code
   is excluded — this would also exclude smart wallets), or accept the current
   rule and document it.
7. **Which stablecoin.** USDG (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`,
   6 decimals) is Robinhood Chain's designated stablecoin and has a live
   WETH/USDG v2 pool (~72 ETH / ~193 k USDG on 2026-09-28). The address is an
   immutable constructor argument.
8. **Rewards when no holder is eligible.** Currently held until someone is,
   then allocated in full at the next allocation (the first holder after an
   empty period takes everything that accrued in it). Alternatives: burn, or
   send to the pool as liquidity.
9. **Fee level and supply.** 2 % and 1 B are placeholders.
10. **Epoch length.** 60 s is a trade-off between the lag with which
    milestones are credited (≤ 1 epoch) and roll-forward cost after idle
    periods; 30 s or 120 s are both reasonable.

## 6. Remaining permissions and dependencies

Nothing in STAYR has an owner, admin role, proxy, sweep or setter. What
remains, and cannot be removed by code:

- **The supply recipient.** The deployer (or whoever is named) receives the
  entire supply and decides how much liquidity to add, at what price. From the
  contracts' point of view it is a holder like any other: its unsold balance
  earns rewards at the same rules.
- **Uniswap v2.** The factory and router are immutable references to
  Uniswap's deployed contracts. Uniswap governance controls the pools' fee
  switch (the 0.30 % LP fee split), not STAYR's fee. Router or factory bugs
  would affect STAYR like every other token on them.
- **USDG.** Issued by Paxos; can be paused, frozen or upgraded under its terms.
  ETH claims are unaffected.
- **Liquidity.** Nobody is obliged to keep liquidity in the STAYR/WETH pool.
  With no pool, harvest has nothing to sell into and claims in USDG have no
  route for the ETH part (ETH claims still work).
- **Keepers.** Harvest, sync and allocate are permissionless. If nobody calls
  harvest, fees accumulate as STAYR in the vault and nothing is lost; the
  site's app exposes the figures so anyone can act.
- **The front-end** never decides anything: it reads `holderOf`, `stats`,
  `config` and the router quote, and submits `claim`. A user can claim from a
  block explorer without it.

## 7. Not done, by design, until you say so

- No mainnet or testnet deployment, no token, no liquidity, no real-money
  transaction, no publication.
- No claim of “audited”. No claim of “immutable” beyond what §6 states.
- Testnet venue addresses (Uniswap v2 and USDG on chain 46630) are not in the
  official documentation; `deploy.ts` refuses to run without explicit,
  verified addresses.
