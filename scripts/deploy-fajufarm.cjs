/**
 * Deploy FajuFarm to Arc Testnet
 *
 * Prerequisites:
 * - DEPLOYER_PRIVATE_KEY in .env
 * - FAJU token address (or use ARC_TESTNET.addresses.faju)
 *
 * Usage:
 *   node scripts/deploy-fajufarm.cjs
 *
 * Or with Hardhat:
 *   hardhat run scripts/deploy-fajufarm-hardhat.cjs --network arcTestnet
 *
 * After deploy: add FajuFarm address to .env as VITE_FAJU_FARM_ADDRESS
 *               and run farm.addPool(lpTokenAddress, allocPoint) for each pool.
 */

require('dotenv').config();
const { ethers } = require('ethers');

const RPC = process.env.VITE_RPC_URL || process.env.VITE_ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const CHAIN_ID = 5042002;

// Arc Testnet addresses (do NOT modify core contracts)
const FAJU = '0x0e8147CdB023474f440636051AA26f7DCaf2aEa7';
const USDC_EURC_PAIR = '0x8a674025863ae28F47dA98d95368586F07Be7142';
const ARCX_EURC_PAIR = '0x33B62Df8cd0B37df83A30eDB12F0e3Ec3a8A7995';

// Default: 1 FAJU per second, start now, 30 days
const REWARD_PER_SECOND = ethers.parseEther('1');
const START_TIME = Math.floor(Date.now() / 1000);
const END_TIME = START_TIME + 30 * 86400;

const FARM_ARTIFACT = require('../artifacts/contracts/FajuFarm.sol/FajuFarm.json');

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error('❌ DEPLOYER_PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(pk, provider);

  console.log('Deploying FajuFarm to Arc Testnet...');
  console.log('  Reward token (FAJU):', FAJU);
  console.log('  Reward per second:', ethers.formatEther(REWARD_PER_SECOND), 'FAJU');
  console.log('  Start:', new Date(START_TIME * 1000).toISOString());
  console.log('  End:', new Date(END_TIME * 1000).toISOString());

  const factory = new ethers.ContractFactory(FARM_ARTIFACT.abi, FARM_ARTIFACT.bytecode, wallet);
  const farm = await factory.deploy(FAJU, REWARD_PER_SECOND, START_TIME, END_TIME);
  await farm.waitForDeployment();
  const address = await farm.getAddress();

  console.log('\n✅ FajuFarm deployed:', address);
  console.log('\nAdd to .env:');
  console.log('VITE_FAJU_FARM_ADDRESS=' + address);
  console.log('\nNext steps (via Remix or script):');
  console.log('1. Transfer FAJU to farm for rewards: rewardToken.transfer(farm, amount)');
  console.log('2. Add pools: farm.addPool(lpToken, allocPoint)');
  console.log('   - USDC/EURC pair:', USDC_EURC_PAIR, '(e.g. allocPoint 100)');
  console.log('   - ARCX/EURC pair:', ARCX_EURC_PAIR, '(e.g. allocPoint 100)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
