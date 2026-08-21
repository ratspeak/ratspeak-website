import { createPublicClient, formatUnits, http } from 'viem';
import { base } from 'viem/chains';
import {
  ERC20_ABI,
  TOKEN_ADDRESS,
  isEligibleBalance,
  parseRawBalance
} from './vote-core.js';

export const DEFAULT_BASE_RPC_URL = 'https://mainnet.base.org';
export const ELIGIBILITY_RULE_LABEL = '>=1 RATSPEAK at snapshot block';

export function getBaseRpcUrl() {
  return process.env.BASE_RPC_URL || DEFAULT_BASE_RPC_URL;
}

// snapshotBlock null/undefined reads the balance at the latest block.
export async function readSnapshotBalance(voter, snapshotBlock, options = {}) {
  const rpcUrl = options.rpcUrl || getBaseRpcUrl();
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const balanceRead = {
    address: TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [voter]
  };
  if (snapshotBlock != null) balanceRead.blockNumber = BigInt(snapshotBlock);
  const [decimals, symbol, rawBalance] = await Promise.all([
    client.readContract({ address: TOKEN_ADDRESS, abi: ERC20_ABI, functionName: 'decimals' }),
    client.readContract({ address: TOKEN_ADDRESS, abi: ERC20_ABI, functionName: 'symbol' }),
    client.readContract(balanceRead)
  ]);

  return {
    decimals,
    symbol,
    rawBalance
  };
}

export function serializeSnapshotBalance(snapshot) {
  const decimals = Number.isInteger(snapshot?.decimals) ? snapshot.decimals : 18;
  const rawBalance = parseRawBalance(snapshot?.rawBalance);
  const symbol = snapshot?.symbol || 'RATSPEAK';

  return {
    tokenContract: TOKEN_ADDRESS,
    tokenSymbol: symbol,
    tokenDecimals: decimals,
    rawBalance: rawBalance.toString(),
    displayBalance: formatUnits(rawBalance, decimals),
    eligible: isEligibleBalance(rawBalance, decimals),
    eligibilityRule: ELIGIBILITY_RULE_LABEL
  };
}
