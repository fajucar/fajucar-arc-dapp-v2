const hre = require('hardhat')

const WETH9 = '0x392016cA446b46df8122D41C9968bb927E5c93b6'

const TOKENS = {
  USDC: '0x3600000000000000000000000000000000000000',
  EURC: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
  FAJU: '0x0e8147CdB023474f440636051AA26f7DCaf2aEa7',
  ARCX: '0xA99F353665F89784f0442FB666ea775b6C1af87d',
  cirBTC: '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF',
}

const PAIRS_TO_CREATE = [
  ['USDC', 'EURC'],
  ['USDC', 'FAJU'],
  ['USDC', 'ARCX'],
  ['USDC', 'cirBTC'],
  ['FAJU', 'ARCX'],
]

async function main() {
  const [deployer] = await hre.ethers.getSigners()
  console.log('Deployer:', deployer.address)
  console.log('Balance :', (await hre.ethers.provider.getBalance(deployer.address)).toString())

  console.log('\n--- Deploying UniswapV2Factory ---')
  const Factory = await hre.ethers.getContractFactory('contracts/v2-core/UniswapV2Factory.sol:UniswapV2Factory')
  const factory = await Factory.deploy(deployer.address)
  await factory.waitForDeployment()
  const factoryAddress = await factory.getAddress()
  console.log('UniswapV2Factory deployed at:', factoryAddress)

  console.log('\n--- Deploying UniswapV2Router02 ---')
  const Router = await hre.ethers.getContractFactory('contracts/v2-periphery/UniswapV2Router02.sol:UniswapV2Router02')
  const router = await Router.deploy(factoryAddress, WETH9)
  await router.waitForDeployment()
  const routerAddress = await router.getAddress()
  console.log('UniswapV2Router02 deployed at:', routerAddress)

  console.log('\n--- Creating pairs ---')
  const pairAddresses = {}
  for (const [symA, symB] of PAIRS_TO_CREATE) {
    const tokenA = TOKENS[symA]
    const tokenB = TOKENS[symB]
    const tx = await factory.createPair(tokenA, tokenB)
    const receipt = await tx.wait()
    const pairAddress = await factory.getPair(tokenA, tokenB)
    pairAddresses[`${symA}/${symB}`] = pairAddress
    console.log(`${symA}/${symB} pair created at:`, pairAddress, ' (tx:', receipt.hash, ')')
  }

  console.log('\n=== SUMMARY ===')
  console.log('Factory:', factoryAddress)
  console.log('Router :', routerAddress)
  console.log('WETH9  :', WETH9)
  for (const [label, addr] of Object.entries(pairAddresses)) {
    console.log(`Pair ${label}:`, addr)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
