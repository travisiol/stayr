import * as fs from "fs";
import * as path from "path";
import { ethers, network } from "hardhat";
import { FAR_DEADLINE, routerAt } from "./lib/venue";
import { deploymentsDir } from "./lib/exportAbi";

/**
 * Plays a small history on the local stack so the dashboard has something
 * to show: four wallets buy at different times, one sells, fees are
 * harvested to ETH and allocated, one wallet claims. Time is moved with
 * evm_increaseTime, so the node's clock runs ahead of the wall clock —
 * the site reads its clock from the chain for that reason.
 *
 *   account #1  alice  bought ~25 h ago, never sold           → 3×
 *   account #2  bob    bought ~90 min ago                     → 1.5×
 *   account #3  carol  bought ~3 h ago, sold a third 20 min ago → reset, 1×
 *   account #4  dave   bought 5 min ago                        → 1×
 */
async function main() {
  const record = JSON.parse(fs.readFileSync(path.join(deploymentsDir, "local.json"), "utf8"));
  const [deployer, alice, bob, carol, dave] = await ethers.getSigners();
  const vault = await ethers.getContractAt("StayrRewards", record.rewards);
  const token = await ethers.getContractAt("StayrToken", record.token);
  const weth: string = record.weth;

  const buy = async (who: typeof alice, eth: string) => {
    await (
      await routerAt(record.uniswapV2Router, who).swapExactETHForTokensSupportingFeeOnTransferTokens(
        0,
        [weth, record.token],
        who.address,
        FAR_DEADLINE,
        { value: ethers.parseEther(eth) },
      )
    ).wait();
  };
  const sell = async (who: typeof alice, amount: bigint) => {
    await (await token.connect(who).approve(record.uniswapV2Router, amount)).wait();
    await (
      await routerAt(record.uniswapV2Router, who).swapExactTokensForETHSupportingFeeOnTransferTokens(
        amount,
        0,
        [record.token, weth],
        who.address,
        FAR_DEADLINE,
      )
    ).wait();
  };
  const jump = async (seconds: number) => {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine", []);
  };
  const harvest = async () => {
    try {
      await (await vault.harvest()).wait();
      console.log("harvested");
    } catch (e) {
      console.log("harvest skipped:", (e as Error).message.slice(0, 80));
    }
  };

  await buy(alice, "1.5");
  console.log("alice bought");
  await jump(22 * 3600);
  await harvest();
  await buy(carol, "0.8");
  console.log("carol bought");
  await jump(70 * 60);
  await harvest();
  await buy(bob, "0.6");
  console.log("bob bought");
  await jump(70 * 60);
  await harvest();
  const carolBal = await token.balanceOf(carol.address);
  await sell(carol, carolBal / 3n);
  console.log("carol sold a third");
  await jump(15 * 60);
  await buy(dave, "0.3");
  console.log("dave bought");
  await jump(5 * 60);
  await harvest();
  // a direct ETH contribution, as a Pons-style fee recipient payout would arrive
  await (await deployer.sendTransaction({ to: record.rewards, value: ethers.parseEther("0.25") })).wait();
  await (await vault.allocate()).wait();
  // bob claims once so the history has an entry
  await (await vault.connect(bob).claim(0, 0, 0)).wait();
  console.log("bob claimed");
  await network.provider.send("evm_mine", []);

  for (const [name, who] of [["alice", alice], ["bob", bob], ["carol", carol], ["dave", dave], ["deployer", deployer]] as const) {
    const v = await vault.holderOf(who.address);
    console.log(
      name.padEnd(9),
      who.address,
      "balance", ethers.formatEther(v.balance).padStart(22),
      "mult", (Number(v.multiplierBps) / 10_000).toFixed(1) + "×",
      "claimable", ethers.formatEther(v.claimableEth), "ETH",
    );
  }
  const s = await vault.stats();
  console.log("stats: epoch", s.currentEpoch, "totalWeightNow", s.totalWeightNow, "unallocated", ethers.formatEther(s.unallocatedEth), "outstanding", ethers.formatEther(s.outstandingEth));
  const block = await ethers.provider.getBlock("latest");
  console.log("node clock", new Date(Number(block!.timestamp) * 1000).toISOString(), "(wall clock", new Date().toISOString() + ")");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
