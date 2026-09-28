import rewardsAbiJson from "./abi/StayrRewards.json";
import tokenAbiJson from "./abi/StayrToken.json";

/**
 * ABIs are exported by `hardhat compile` (contracts/scripts/lib/exportAbi.ts)
 * so the site can never drift from the contracts. Re-typed `as const` here
 * so viem infers argument and return types.
 */
export const rewardsAbi = rewardsAbiJson as unknown as typeof rewardsAbiShape;
export const tokenAbi = tokenAbiJson as unknown as typeof tokenAbiShape;

// Hand-written shapes for the calls the site makes. The JSON is the source
// of truth for encoding; these are only for TypeScript. If a signature
// changes in Solidity, `npm run typecheck` fails here rather than at runtime.
export const rewardsAbiShape = [
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "router", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "weth", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "usdg", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "currentEpoch", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  {
    type: "function",
    name: "config",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "genesis", type: "uint64" },
          { name: "epochSeconds", type: "uint32" },
          { name: "feeBps", type: "uint16" },
          { name: "baseMultiplierBps", type: "uint16" },
          { name: "milestoneEpochs", type: "uint32[3]" },
          { name: "milestoneMultiplierBps", type: "uint16[3]" },
          { name: "harvestCapBps", type: "uint16" },
          { name: "harvestCooldown", type: "uint32" },
          { name: "forfeitPendingOnSale", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "holderOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "balance", type: "uint256" },
          { name: "startEpoch", type: "uint64" },
          { name: "sinceEpoch", type: "uint64" },
          { name: "tier", type: "uint8" },
          { name: "multiplierBps", type: "uint16" },
          { name: "weight", type: "uint256" },
          { name: "claimableEth", type: "uint256" },
          { name: "claimableUsdg", type: "uint256" },
          { name: "nextMilestoneEpoch", type: "uint64" },
          { name: "nextMultiplierBps", type: "uint16" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "stats",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "currentEpoch", type: "uint64" },
          { name: "syncedEpoch", type: "uint64" },
          { name: "totalWeightSynced", type: "uint256" },
          { name: "totalWeightNow", type: "uint256" },
          { name: "weightNowExact", type: "bool" },
          { name: "unallocatedEth", type: "uint256" },
          { name: "unallocatedUsdg", type: "uint256" },
          { name: "outstandingEth", type: "uint256" },
          { name: "outstandingUsdg", type: "uint256" },
          { name: "totalEthAllocated", type: "uint256" },
          { name: "totalUsdgAllocated", type: "uint256" },
          { name: "totalEthClaimed", type: "uint256" },
          { name: "totalUsdgClaimed", type: "uint256" },
          { name: "checkpointCount", type: "uint256" },
          { name: "tokenFeeBalance", type: "uint256" },
          { name: "lastHarvestAt", type: "uint64" },
          { name: "harvestReadyAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "harvestable",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "cap", type: "uint256" },
      { name: "readyAt", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "payout", type: "uint8" },
      { name: "minUsdgOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
  { type: "function", name: "harvest", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "allocate", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "sync", stateMutability: "nonpayable", inputs: [{ name: "maxWords", type: "uint256" }], outputs: [{ type: "bool" }] },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "account", type: "address", indexed: true },
      { name: "payout", type: "uint8", indexed: false },
      { name: "ethAmount", type: "uint256", indexed: false },
      { name: "usdgAmount", type: "uint256", indexed: false },
      { name: "ethSwapped", type: "uint256", indexed: false },
      { name: "usdgReceived", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Allocated",
    inputs: [
      { name: "epoch", type: "uint64", indexed: true },
      { name: "ethAmount", type: "uint256", indexed: false },
      { name: "usdgAmount", type: "uint256", indexed: false },
      { name: "totalWeight", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Harvested",
    inputs: [
      { name: "caller", type: "address", indexed: true },
      { name: "tokensSold", type: "uint256", indexed: false },
      { name: "ethReceived", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "NothingToClaim", inputs: [] },
  { type: "error", name: "EthTransferFailed", inputs: [] },
  { type: "error", name: "Expired", inputs: [] },
  { type: "error", name: "HarvestNotReady", inputs: [{ name: "readyAt", type: "uint64" }] },
  { type: "error", name: "NothingToHarvest", inputs: [] },
  { type: "error", name: "NoPool", inputs: [] },
] as const;

export const tokenAbiShape = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  { type: "function", name: "wethPair", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "usdgPair", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "rewards", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "factory", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "isPool", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "bool" }] },
] as const;

export const routerAbi = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

export const pairAbi = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
