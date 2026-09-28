import { HardhatUserConfig, task } from "hardhat/config";
import { TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import { exportAbis } from "./scripts/lib/exportAbi";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const accounts = DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [];

/**
 * Robinhood Chain (Arbitrum Orbit). Verified against
 * https://docs.robinhood.com/chain/connecting on 2026-09-28:
 *   mainnet  chain id 4663  (0x1237)  https://rpc.mainnet.chain.robinhood.com
 *   testnet  chain id 46630 (0xb626)  https://rpc.testnet.chain.robinhood.com
 */
const ROBINHOOD_RPC_URL =
  process.env.ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
const ROBINHOOD_TESTNET_RPC_URL =
  process.env.ROBINHOOD_TESTNET_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";

/**
 * Every successful `hardhat compile` re-exports the ABIs (and the creation
 * bytecode the site needs for address prediction) into ../src/lib/abi so the
 * front end can never drift from the contracts. SKIP_ABI_EXPORT=true opts out.
 */
task(TASK_COMPILE, async (args, hre, runSuper) => {
  const result = await runSuper(args);
  if (process.env.SKIP_ABI_EXPORT !== "true") {
    await exportAbis(hre);
  }
  return result;
});

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      // Deterministic timestamps make the epoch maths in the tests exact.
      allowUnlimitedContractSize: false,
      ...(process.env.FORK_URL
        ? {
            forking: {
              url: process.env.FORK_URL,
              ...(process.env.FORK_BLOCK ? { blockNumber: Number(process.env.FORK_BLOCK) } : {}),
            },
          }
        : {}),
    },
    // `npm run node` (port 8868) + `npm run deploy:local` + `npm run seed:local`.
    localhost: {
      url: "http://127.0.0.1:8868",
      chainId: 31337,
    },
    robinhoodTestnet: {
      url: ROBINHOOD_TESTNET_RPC_URL,
      chainId: 46630,
      accounts,
    },
    robinhood: {
      url: ROBINHOOD_RPC_URL,
      chainId: 4663,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      robinhood: process.env.ROBINHOOD_EXPLORER_API_KEY ?? "no-key-required",
      robinhoodTestnet: process.env.ROBINHOOD_EXPLORER_API_KEY ?? "no-key-required",
    },
    customChains: [
      {
        network: "robinhood",
        chainId: 4663,
        urls: {
          apiURL: "https://robinhoodchain.blockscout.com/api",
          browserURL: "https://robinhoodchain.blockscout.com",
        },
      },
      {
        network: "robinhoodTestnet",
        chainId: 46630,
        urls: {
          apiURL: "https://explorer.testnet.chain.robinhood.com/api",
          browserURL: "https://explorer.testnet.chain.robinhood.com",
        },
      },
    ],
  },
  sourcify: { enabled: false },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 180_000,
  },
};

export default config;
