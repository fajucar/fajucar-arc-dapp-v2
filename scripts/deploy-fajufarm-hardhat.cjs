/**
 * Deploy FajuFarm via Hardhat
 * Usage: npx hardhat run scripts/deploy-fajufarm-hardhat.cjs --network arcTestnet --config hardhat.config.cjs
 */
require('dotenv').config();
const hre = require('hardhat');

const FAJU = '0x0e8147CdB023474f440636051AA26f7DCaf2aEa7';
const REWARD_PER_SECOND = hre.ethers.parseEther('1');
const START_TIME = Math.floor(Date.now() / 1000);
const END_TIME = START_TIME + 30 * 86400;

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  const FajuFarm = await hre.ethers.getContractFactory('FajuFarm');
  const farm = await FajuFarm.deploy(FAJU, REWARD_PER_SECOND, START_TIME, END_TIME);
  await farm.waitForDeployment();
  const address = await farm.getAddress();

  console.log('FajuFarm deployed:', address);
  console.log('VITE_FAJU_FARM_ADDRESS=' + address);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
