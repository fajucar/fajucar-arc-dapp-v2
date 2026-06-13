require('@nomicfoundation/hardhat-ethers')
require('dotenv').config()

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY
const ARC_RPC_URL = process.env.ARC_RPC_URL ?? 'https://rpc.testnet.arc.network'

module.exports = {
  solidity: {
    compilers: [
      { version: '0.5.16', settings: { optimizer: { enabled: true, runs: 999999 } } },
      { version: '0.6.6', settings: { optimizer: { enabled: true, runs: 999999 } } },
    ],
  },
  networks: {
    arcTestnet: {
      url: ARC_RPC_URL,
      chainId: 5042002,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
}
