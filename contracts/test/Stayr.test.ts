import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { advanceEpochs, closeTo, DAY, deployStayr, ethBalance, HOUR, SUPPLY, type Stayr } from "./helpers";

const ONE_ETH = ethers.parseEther("1");
const PAYOUT_ETH = 0;
const PAYOUT_USDG = 1;

async function fixture() {
  return deployStayr();
}

/** Sends ETH straight to the vault (a Pons-style fee recipient payout, or a donation). */
async function donate(fx: Stayr, amount: bigint) {
  await fx.deployer.sendTransaction({ to: fx.vaultAddress, value: amount });
}

async function claimable(fx: Stayr, who: string) {
  const v = await fx.vault.holderOf(who);
  return { eth: v.claimableEth, usdg: v.claimableUsdg, mult: Number(v.multiplierBps), tier: Number(v.tier), weight: v.weight };
}

describe("STAYR — deployment and wiring", () => {
  it("deploys the token from the vault with immutable, verified venue addresses", async () => {
    const fx = await loadFixture(fixture);
    expect(await fx.token.name()).to.equal("STAYR");
    expect(await fx.token.totalSupply()).to.equal(SUPPLY);
    expect(await fx.token.rewards()).to.equal(fx.vaultAddress);
    expect(await fx.vault.token()).to.equal(fx.tokenAddress);
    expect(await fx.vault.router()).to.equal(fx.params.router);
    expect(await fx.vault.weth()).to.equal(fx.params.weth);
    expect(await fx.vault.usdg()).to.equal(fx.params.usdg);
    const c = await fx.vault.config();
    expect(Number(c.feeBps)).to.equal(200);
    expect(c.milestoneEpochs.map(Number)).to.deep.equal([60, 120, 1440]);
    expect(c.milestoneMultiplierBps.map(Number)).to.deep.equal([15_000, 20_000, 30_000]);
  });

  it("rejects a router whose factory or WETH do not match", async () => {
    const [deployer] = await ethers.getSigners();
    const fx = await loadFixture(fixture);
    const F = await ethers.getContractFactory("StayrRewards");
    await expect(F.deploy({ ...fx.params, factory: deployer.address })).to.be.revertedWithCustomError(F, "InvalidParams");
    await expect(F.deploy({ ...fx.params, weth: deployer.address })).to.be.revertedWithCustomError(F, "InvalidParams");
    await expect(
      F.deploy({ ...fx.params, milestoneMultiplierBps: [15_000, 14_000, 30_000] }),
    ).to.be.revertedWithCustomError(F, "InvalidParams");
  });

  it("discovers the STAYR/WETH pool from the factory and excludes it from rewards", async () => {
    const fx = await loadFixture(fixture);
    expect(fx.pairAddress).to.not.equal(ethers.ZeroAddress);
    expect(await fx.token.isPool(fx.pairAddress)).to.equal(true);
    expect(await fx.token.isEligible(fx.pairAddress)).to.equal(false);
    expect(await fx.token.isEligible(fx.vaultAddress)).to.equal(false);
    const pool = await fx.vault.holderOf(fx.pairAddress);
    expect(pool.balance).to.equal(0n);
    expect(pool.weight).to.equal(0n);
  });

  it("charged the fee on the liquidity deposit (tokens entering a pool)", async () => {
    const fx = await loadFixture(fixture);
    // 2% of the 500M deposited went to the vault; the pool holds the rest.
    expect(await fx.token.balanceOf(fx.vaultAddress)).to.equal((SUPPLY / 2n) * 200n / 10_000n);
    expect(await fx.token.balanceOf(fx.pairAddress)).to.equal((SUPPLY / 2n) * 9_800n / 10_000n);
  });

  it("has no owner, admin or setter in its ABI", async () => {
    const forbidden = /owner|admin|upgrade|pause|sweep|rescue|withdraw|set[A-Z]|transferOwnership|renounce|grant|revoke|mint|burn|blacklist/;
    for (const c of [fx_abi("StayrRewards"), fx_abi("StayrToken")]) {
      const names = (await c).filter((f) => f.type === "function").map((f) => f.name as string);
      const bad = names.filter((n) => forbidden.test(n));
      expect(bad, `forbidden functions: ${bad.join(", ")}`).to.deep.equal([]);
    }
  });
});

async function fx_abi(name: string) {
  const artifact = await import("hardhat").then((h) => h.artifacts.readArtifact(name));
  return artifact.abi as { type: string; name?: string }[];
}

describe("STAYR — fee collection on pool trades", () => {
  it("charges the fee on buys and sells, not on wallet transfers", async () => {
    const fx = await loadFixture(fixture);
    const vaultBefore = await fx.token.balanceOf(fx.vaultAddress);
    const quote = (await fx.router.getAmountsOut(ONE_ETH, [fx.params.weth, fx.tokenAddress]))[1] as bigint;
    await fx.buy(fx.alice, ONE_ETH);
    const got = await fx.token.balanceOf(fx.alice.address);
    expect(got).to.equal(quote - (quote * 200n) / 10_000n);
    expect((await fx.token.balanceOf(fx.vaultAddress)) - vaultBefore).to.equal((quote * 200n) / 10_000n);

    // wallet transfer: no fee
    const v2 = await fx.token.balanceOf(fx.vaultAddress);
    await fx.token.connect(fx.alice).transfer(fx.bob.address, got / 2n);
    expect(await fx.token.balanceOf(fx.bob.address)).to.equal(got / 2n);
    expect(await fx.token.balanceOf(fx.vaultAddress)).to.equal(v2);

    // sell: fee on the amount entering the pool
    const sellAmount = await fx.token.balanceOf(fx.bob.address);
    await fx.sell(fx.bob, sellAmount);
    expect((await fx.token.balanceOf(fx.vaultAddress)) - v2).to.equal((sellAmount * 200n) / 10_000n);
    expect(await fx.token.balanceOf(fx.bob.address)).to.equal(0n);
  });

  it("registers any other Uniswap v2 pair of STAYR permissionlessly, and only from the factory", async () => {
    const fx = await loadFixture(fixture);
    const quote = await (await ethers.getContractFactory("MockQuote")).deploy();
    await expect(fx.token.registerPair(await quote.getAddress())).to.be.revertedWithCustomError(fx.token, "NoSuchPair");
    const pairAddr = await fx.factory.createPair.staticCall(fx.tokenAddress, await quote.getAddress());
    await fx.factory.createPair(fx.tokenAddress, await quote.getAddress());
    // fund the pair by wallet transfer before registration — it is a holder for now
    await fx.buy(fx.alice, ONE_ETH);
    const half = (await fx.token.balanceOf(fx.alice.address)) / 2n;
    await fx.token.connect(fx.alice).transfer(pairAddr, half);
    expect((await fx.vault.holderOf(pairAddr)).weight).to.be.greaterThan(0n);
    await expect(fx.token.connect(fx.bob).registerPair(await quote.getAddress()))
      .to.emit(fx.token, "PoolRegistered")
      .withArgs(pairAddr, await quote.getAddress());
    expect((await fx.vault.holderOf(pairAddr)).weight).to.equal(0n);
    expect(await fx.token.isPool(pairAddr)).to.equal(true);
    await expect(fx.token.registerPair(await quote.getAddress())).to.be.revertedWithCustomError(fx.token, "AlreadyRegistered");
    // trades against it are now charged
    const before = await fx.token.balanceOf(fx.vaultAddress);
    await fx.token.connect(fx.alice).transfer(pairAddr, 1_000_000n);
    expect((await fx.token.balanceOf(fx.vaultAddress)) - before).to.equal(20_000n);
  });
});

describe("STAYR — holding age and multipliers", () => {
  it("credits milestones at 1h / 2h / 24h (never early) and resets on a sale", async () => {
    const fx = await loadFixture(fixture);
    await fx.buy(fx.alice, ONE_ETH);
    let a = await claimable(fx, fx.alice.address);
    expect(a.mult).to.equal(10_000);
    expect(a.tier).to.equal(0);

    // 60 epochs after the start epoch the wallet has held between 59 and
    // 60 minutes — still base. One more epoch: provably ≥ 1 hour.
    await advanceEpochs(fx.vault, 60);
    expect((await claimable(fx, fx.alice.address)).mult).to.equal(10_000);
    await advanceEpochs(fx.vault, 1);
    a = await claimable(fx, fx.alice.address);
    expect(a.mult).to.equal(15_000);
    expect(a.tier).to.equal(1);

    await advanceEpochs(fx.vault, 60);
    expect((await claimable(fx, fx.alice.address)).mult).to.equal(20_000);
    await advanceEpochs(fx.vault, 1440 - 120);
    expect((await claimable(fx, fx.alice.address)).mult).to.equal(30_000);
    const v = await fx.vault.holderOf(fx.alice.address);
    expect(v.nextMilestoneEpoch).to.equal(0n);

    // selling any amount resets to base and restarts the clock
    await fx.sell(fx.alice, ethers.parseEther("1"));
    a = await claimable(fx, fx.alice.address);
    expect(a.mult).to.equal(10_000);
    expect((await fx.vault.holderOf(fx.alice.address)).startEpoch).to.equal(await fx.vault.currentEpoch());
  });

  it("reports the next milestone and keeps the total weight in step with maturing wallets", async () => {
    const fx = await loadFixture(fixture);
    await fx.buy(fx.alice, ONE_ETH);
    const bal = await fx.token.balanceOf(fx.alice.address);
    const v = await fx.vault.holderOf(fx.alice.address);
    expect(v.nextMilestoneEpoch).to.equal(v.startEpoch + 61n);
    expect(Number(v.nextMultiplierBps)).to.equal(15_000);

    const deployerBal = await fx.token.balanceOf(fx.deployer.address);
    const total = async () => (await fx.vault.stats()).totalWeightNow;
    expect(await total()).to.equal(bal * 10_000n + deployerBal * 10_000n);
    await advanceEpochs(fx.vault, 61);
    // deployer started at epoch 0, alice at ~epoch 0 too: both at 1.5×
    expect(await total()).to.equal(bal * 15_000n + deployerBal * 15_000n);
    // a keeper can persist it
    await fx.vault.sync(100);
    expect(await fx.vault.totalWeight()).to.equal(bal * 15_000n + deployerBal * 15_000n);
  });

  it("merges additional purchases at a balance-weighted average age", async () => {
    const fx = await loadFixture(fixture);
    await fx.buy(fx.alice, ONE_ETH);
    const first = await fx.token.balanceOf(fx.alice.address);
    const start1 = (await fx.vault.holderOf(fx.alice.address)).startEpoch;
    await advanceEpochs(fx.vault, 200); // 2× reached
    expect((await claimable(fx, fx.alice.address)).mult).to.equal(20_000);

    await fx.buy(fx.alice, ONE_ETH);
    const total = await fx.token.balanceOf(fx.alice.address);
    const added = total - first;
    const now = await fx.vault.currentEpoch();
    const expected = (first * start1 + added * now + total - 1n) / total;
    const v = await fx.vault.holderOf(fx.alice.address);
    expect(v.startEpoch).to.equal(expected);
    // roughly half the age → back to 1.5× (age ≈ 100 epochs), not 2× and not base
    expect(Number(v.multiplierBps)).to.equal(15_000);
    expect(v.weight).to.equal(total * 15_000n);
    // and the total weight agrees
    const deployerBal = await fx.token.balanceOf(fx.deployer.address);
    expect((await fx.vault.stats()).totalWeightNow).to.equal(total * 15_000n + deployerBal * 20_000n);
  });

  it("treats a wallet transfer as a sale for the sender and a purchase for the recipient", async () => {
    const fx = await loadFixture(fixture);
    await fx.buy(fx.alice, ONE_ETH);
    await advanceEpochs(fx.vault, 130);
    expect((await claimable(fx, fx.alice.address)).mult).to.equal(20_000);
    const bal = await fx.token.balanceOf(fx.alice.address);
    await fx.token.connect(fx.alice).transfer(fx.bob.address, bal / 3n);
    const a = await fx.vault.holderOf(fx.alice.address);
    const b = await fx.vault.holderOf(fx.bob.address);
    const now = await fx.vault.currentEpoch();
    expect(a.startEpoch).to.equal(now);
    expect(Number(a.multiplierBps)).to.equal(10_000);
    expect(b.startEpoch).to.equal(now);
    expect(b.balance).to.equal(bal / 3n);
    expect(a.balance).to.equal(bal - bal / 3n);
  });
});

describe("STAYR — distribution", () => {
  it("splits an allocation by the weights in force when it happens — never retroactively", async () => {
    const fx = await loadFixture(fixture);
    // Park the deployer's tokens in the pool so alice and bob are the only holders.
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    await fx.buy(fx.alice, ONE_ETH);
    await fx.buy(fx.bob, ONE_ETH);
    const a0 = await fx.token.balanceOf(fx.alice.address);
    const b0 = await fx.token.balanceOf(fx.bob.address);

    // D1 at +30 min: both at base → pro rata to balance
    await advanceEpochs(fx.vault, 30);
    await donate(fx, ethers.parseEther("10"));
    await fx.vault.allocate();
    const a1 = (await claimable(fx, fx.alice.address)).eth;
    const b1 = (await claimable(fx, fx.bob.address)).eth;
    expect(closeTo(a1, (ethers.parseEther("10") * a0) / (a0 + b0), 10n)).to.equal(true);
    expect(closeTo(b1, (ethers.parseEther("10") * b0) / (a0 + b0), 10n)).to.equal(true);

    // bob sells half at +50 min → reset; alice crosses 1h at +61
    await advanceEpochs(fx.vault, 20);
    await fx.sell(fx.bob, b0 / 2n);
    const b0b = await fx.token.balanceOf(fx.bob.address);
    // (the sale paid a fee in tokens — no ETH yet, nothing to allocate)

    // D2 at +90 min: alice 1.5×, bob 1× on half → alice gets 1.5a/(1.5a + 0.5b)
    await advanceEpochs(fx.vault, 40);
    await donate(fx, ethers.parseEther("10"));
    await fx.vault.allocate();
    const wa = a0 * 15_000n;
    const wb = b0b * 10_000n;
    const a2 = (await claimable(fx, fx.alice.address)).eth - a1;
    const b2 = (await claimable(fx, fx.bob.address)).eth - b1;
    expect(closeTo(a2, (ethers.parseEther("10") * wa) / (wa + wb), 10n)).to.equal(true);
    expect(closeTo(b2, (ethers.parseEther("10") * wb) / (wa + wb), 10n)).to.equal(true);

    // D1 did not change when alice crossed the milestone
    expect(closeTo(a1 + a2, (await claimable(fx, fx.alice.address)).eth, 0n)).to.equal(true);
  });

  it("holds funds while nobody is eligible and distributes them to the next holder", async () => {
    const fx = await loadFixture(fixture);
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    expect((await fx.vault.stats()).totalWeightNow).to.equal(0n);
    await donate(fx, ONE_ETH);
    await fx.vault.allocate();
    let s = await fx.vault.stats();
    expect(s.unallocatedEth).to.equal(ONE_ETH);
    expect(s.outstandingEth).to.equal(0n);

    await fx.buy(fx.alice, ONE_ETH); // the buy itself allocates before alice's balance moves: still unallocated
    s = await fx.vault.stats();
    expect(s.unallocatedEth).to.equal(ONE_ETH);
    await fx.vault.allocate(); // now alice is the only holder
    s = await fx.vault.stats();
    expect(s.unallocatedEth).to.equal(0n);
    expect(closeTo((await claimable(fx, fx.alice.address)).eth, ONE_ETH, 2n)).to.equal(true);
  });

  it("allocates before a buyer's balance moves, so a new wallet cannot capture earlier fees", async () => {
    const fx = await loadFixture(fixture);
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    await fx.buy(fx.alice, ONE_ETH);
    await donate(fx, ONE_ETH); // sits unallocated
    await fx.buy(fx.bob, ethers.parseEther("5")); // big late buyer
    expect(closeTo((await claimable(fx, fx.alice.address)).eth, ONE_ETH, 2n)).to.equal(true);
    expect((await claimable(fx, fx.bob.address)).eth).to.equal(0n);
  });

  it("keeps two ledgers: USDG deposits are split by the same weights", async () => {
    const fx = await loadFixture(fixture);
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    await fx.buy(fx.alice, ONE_ETH);
    await fx.buy(fx.bob, ONE_ETH);
    const a0 = await fx.token.balanceOf(fx.alice.address);
    const b0 = await fx.token.balanceOf(fx.bob.address);
    const amount = 1_000n * 10n ** 6n;
    await fx.usdg.mint(fx.carol.address, amount);
    await fx.usdg.connect(fx.carol).approve(fx.vaultAddress, amount);
    await expect(fx.vault.connect(fx.carol).depositUsdg(amount)).to.emit(fx.vault, "UsdgDeposited");
    const a = (await claimable(fx, fx.alice.address)).usdg;
    const b = (await claimable(fx, fx.bob.address)).usdg;
    expect(closeTo(a, (amount * a0) / (a0 + b0), 1n)).to.equal(true);
    expect(closeTo(b, (amount * b0) / (a0 + b0), 1n)).to.equal(true);
    expect(a + b <= amount).to.equal(true);
  });

  it("defers allocation when the schedule is far behind and catches up in slices", async () => {
    const fx = await loadFixture(fixture);
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    await fx.buy(fx.alice, ONE_ETH);
    // 60 days idle = 86,400 epochs = 338 bitmap words > the 16-word touch budget
    await time.increase(60 * DAY);
    await donate(fx, ONE_ETH);
    await fx.buy(fx.bob, ONE_ETH); // touches: partial sync only, no allocation
    let s = await fx.vault.stats();
    expect(s.unallocatedEth).to.equal(ONE_ETH);
    expect(s.syncedEpoch < s.currentEpoch).to.equal(true);
    // anyone finishes the roll-forward
    let complete = false;
    for (let i = 0; i < 40 && !complete; i++) {
      complete = await fx.vault.sync.staticCall(50);
      await fx.vault.sync(50);
    }
    expect(complete).to.equal(true);
    await fx.vault.allocate();
    s = await fx.vault.stats();
    expect(s.unallocatedEth).to.equal(0n);
    // alice matured to 3× while idle; bob is at base — split accordingly
    const a0 = await fx.token.balanceOf(fx.alice.address);
    const b0 = await fx.token.balanceOf(fx.bob.address);
    const wa = a0 * 30_000n;
    const wb = b0 * 10_000n;
    expect(closeTo((await claimable(fx, fx.alice.address)).eth, (ONE_ETH * wa) / (wa + wb), 10n)).to.equal(true);
    expect(closeTo((await claimable(fx, fx.bob.address)).eth, (ONE_ETH * wb) / (wa + wb), 10n)).to.equal(true);
  });
});

describe("STAYR — harvest", () => {
  it("sells at most the cap per call, respects the cooldown and allocates the ETH", async () => {
    const fx = await loadFixture(fixture);
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    await fx.buy(fx.alice, ONE_ETH);
    const [amount, cap] = await fx.vault.harvestable();
    expect(cap).to.be.greaterThan(0n);
    expect(amount <= cap).to.equal(true);
    const before = await ethBalance(fx.vaultAddress);
    await expect(fx.vault.connect(fx.bob).harvest()).to.emit(fx.vault, "Harvested");
    const received = (await ethBalance(fx.vaultAddress)) - before;
    expect(received).to.be.greaterThan(0n);
    // allocated in the same call to the only holder
    expect(closeTo((await claimable(fx, fx.alice.address)).eth, received, 2n)).to.equal(true);
    await expect(fx.vault.harvest()).to.be.revertedWithCustomError(fx.vault, "HarvestNotReady");
    await time.increase(10 * 60 + 1);
    // still tokens left (the liquidity-deposit fee was 10M, the cap ~2.4M)
    await fx.vault.harvest();
  });

  it("is not charged the fee on its own sale", async () => {
    const fx = await loadFixture(fixture);
    const [amount] = await fx.vault.harvestable();
    const feeBefore = await fx.token.balanceOf(fx.vaultAddress);
    await fx.vault.harvest();
    expect(feeBefore - (await fx.token.balanceOf(fx.vaultAddress))).to.equal(amount);
  });
});

describe("STAYR — claims", () => {
  it("pays ETH once, then refuses a second claim", async () => {
    const fx = await loadFixture(fixture);
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    await fx.buy(fx.alice, ONE_ETH);
    await donate(fx, ONE_ETH);
    await fx.vault.allocate();
    const before = await ethBalance(fx.alice.address);
    const tx = await fx.vault.connect(fx.alice).claim(PAYOUT_ETH, 0, 0);
    const rc = await tx.wait();
    const gas = rc!.gasUsed * rc!.gasPrice;
    expect(closeTo((await ethBalance(fx.alice.address)) - before + gas, ONE_ETH, 2n)).to.equal(true);
    await expect(fx.vault.connect(fx.alice).claim(PAYOUT_ETH, 0, 0)).to.be.revertedWithCustomError(fx.vault, "NothingToClaim");
    // the wei lost to floor rounding stays behind as dust, never as a claim
    expect((await fx.vault.stats()).outstandingEth <= 2n).to.equal(true);
    expect((await claimable(fx, fx.alice.address)).eth).to.equal(0n);
  });

  it("keeps the position and multiplier intact across a claim", async () => {
    const fx = await loadFixture(fixture);
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    await fx.buy(fx.alice, ONE_ETH);
    await advanceEpochs(fx.vault, 130);
    await donate(fx, ONE_ETH);
    await fx.vault.connect(fx.alice).claim(PAYOUT_ETH, 0, 0);
    const v = await fx.vault.holderOf(fx.alice.address);
    expect(Number(v.multiplierBps)).to.equal(20_000);
    // and keeps earning afterwards at the same multiplier
    await donate(fx, ONE_ETH);
    await fx.vault.allocate();
    expect(closeTo((await claimable(fx, fx.alice.address)).eth, ONE_ETH, 2n)).to.equal(true);
  });

  it("swaps the ETH part to USDG on claim with the caller's minimum", async () => {
    const fx = await loadFixture(fixture);
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    await fx.buy(fx.alice, ONE_ETH);
    await donate(fx, ONE_ETH);
    await fx.vault.allocate();
    const eth = (await claimable(fx, fx.alice.address)).eth;
    const quote = (await fx.router.getAmountsOut(eth, [fx.params.weth, fx.params.usdg]))[1] as bigint;
    const deadline = (await time.latest()) + 600;
    await expect(fx.vault.connect(fx.alice).claim(PAYOUT_USDG, quote + 1n, deadline)).to.be.reverted; // min too high
    await expect(fx.vault.connect(fx.alice).claim(PAYOUT_USDG, quote, deadline))
      .to.emit(fx.vault, "Claimed")
      .withArgs(fx.alice.address, PAYOUT_USDG, eth, 0n, eth, quote);
    expect(await fx.usdg.balanceOf(fx.alice.address)).to.equal(quote);
    await expect(fx.vault.connect(fx.alice).claim(PAYOUT_USDG, 0, (await time.latest()) - 1)).to.be.revertedWithCustomError(
      fx.vault,
      "NothingToClaim",
    );
  });

  it("reverts the whole claim when the ETH payout fails, and still allows a USDG claim", async () => {
    const fx = await loadFixture(fixture);
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    const rejecting = await (await ethers.getContractFactory("RejectingReceiver")).deploy();
    const rejAddr = await rejecting.getAddress();
    await fx.buy(fx.alice, ONE_ETH);
    await fx.token.connect(fx.alice).transfer(rejAddr, await fx.token.balanceOf(fx.alice.address));
    await donate(fx, ONE_ETH);
    await fx.vault.allocate();
    await expect(rejecting.claim(fx.vaultAddress, PAYOUT_ETH, 0, 0)).to.be.revertedWithCustomError(fx.vault, "EthTransferFailed");
    expect(closeTo((await claimable(fx, rejAddr)).eth, ONE_ETH, 2n)).to.equal(true); // nothing lost
    const deadline = (await time.latest()) + 600;
    await rejecting.claim(fx.vaultAddress, PAYOUT_USDG, 1, deadline);
    expect(await fx.usdg.balanceOf(rejAddr)).to.be.greaterThan(0n);
    expect((await claimable(fx, rejAddr)).eth).to.equal(0n);
  });

  it("blocks re-entrant claims", async () => {
    const fx = await loadFixture(fixture);
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    const attacker = await (await ethers.getContractFactory("ReentrantClaimer")).deploy();
    await attacker.setVault(fx.vaultAddress);
    await fx.buy(fx.alice, ONE_ETH);
    await fx.token.connect(fx.alice).transfer(await attacker.getAddress(), await fx.token.balanceOf(fx.alice.address));
    await donate(fx, ONE_ETH);
    await fx.vault.allocate();
    // the inner claim reverts (guard), which reverts the payout, which reverts the outer claim
    await expect(attacker.claim()).to.be.revertedWithCustomError(fx.vault, "EthTransferFailed");
    expect(await ethBalance(fx.vaultAddress)).to.equal(ONE_ETH);
  });

  it("returns forfeited pending rewards to the pool when forfeitPendingOnSale is set", async () => {
    const fx = await deployStayr({ forfeitPendingOnSale: true });
    await fx.token.transfer(fx.pairAddress, await fx.token.balanceOf(fx.deployer.address));
    await fx.buy(fx.alice, ONE_ETH);
    await fx.buy(fx.bob, ONE_ETH);
    await donate(fx, ethers.parseEther("2"));
    await fx.vault.allocate();
    const a = (await claimable(fx, fx.alice.address)).eth;
    expect(a).to.be.greaterThan(0n);
    await expect(fx.sell(fx.alice, ethers.parseEther("1"))).to.emit(fx.vault, "Forfeited");
    expect((await claimable(fx, fx.alice.address)).eth).to.equal(0n);
    const s = await fx.vault.stats();
    expect(s.unallocatedEth).to.equal(a);
    await fx.vault.allocate(); // redistributed to the two remaining weights
    expect((await claimable(fx, fx.bob.address)).eth).to.be.greaterThan(ethers.parseEther("1"));
  });
});

describe("STAYR — conservation and dust", () => {
  it("never pays out more than it received, across a long random sequence", async () => {
    const fx = await loadFixture(fixture);
    const users = [fx.alice, fx.bob, fx.carol, fx.dave];
    let rng = 0x9e3779b9;
    const rand = () => {
      rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
      return (rng >>> 0) / 0xffffffff;
    };
    let received = 0n;
    let paid = 0n;
    for (let step = 0; step < 60; step++) {
      const u = users[Math.floor(rand() * users.length)];
      const r = rand();
      if (r < 0.35) {
        await fx.buy(u, ethers.parseEther((0.05 + rand() * 2).toFixed(4)));
      } else if (r < 0.55) {
        const bal = await fx.token.balanceOf(u.address);
        if (bal > 0n) await fx.sell(u, (bal * BigInt(1 + Math.floor(rand() * 99))) / 100n);
      } else if (r < 0.7) {
        const amt = ethers.parseEther((rand() * 3).toFixed(6)) + 1n;
        await donate(fx, amt);
        received += amt;
      } else if (r < 0.8) {
        try {
          const before = await ethBalance(fx.vaultAddress);
          await fx.vault.harvest();
          received += (await ethBalance(fx.vaultAddress)) - before;
        } catch {
          /* cooldown or nothing to harvest */
        }
      } else if (r < 0.9) {
        await time.increase(Math.floor(rand() * 3 * HOUR));
      } else {
        const c = (await claimable(fx, u.address)).eth;
        if (c > 0n) {
          await fx.vault.connect(u).claim(PAYOUT_ETH, 0, 0);
          paid += c;
        }
      }
      // invariant: what the vault owes never exceeds what it holds
      const s = await fx.vault.stats();
      expect(s.outstandingEth <= (await ethBalance(fx.vaultAddress))).to.equal(true);
      expect(s.unallocatedEth + s.outstandingEth).to.equal(await ethBalance(fx.vaultAddress));
    }
    // drain everything claimable
    await fx.vault.allocate();
    for (const u of [...users, fx.deployer]) {
      const c = (await claimable(fx, u.address)).eth;
      if (c > 0n) {
        await fx.vault.connect(u).claim(PAYOUT_ETH, 0, 0);
        paid += c;
      }
    }
    expect(paid <= received).to.equal(true);
    // total weight bookkeeping matches the holders
    await fx.vault.sync(1000);
    let sum = 0n;
    for (const u of [...users, fx.deployer]) sum += (await fx.vault.holderOf(u.address)).weight;
    expect(await fx.vault.totalWeight()).to.equal(sum);
    // rounding leaves only wei-level dust behind
    const dust = (await ethBalance(fx.vaultAddress)) - (await fx.vault.stats()).unallocatedEth;
    expect(dust < 1_000n).to.equal(true);
  });
});
