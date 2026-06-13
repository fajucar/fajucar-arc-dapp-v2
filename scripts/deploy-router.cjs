/**
 * Deploy ArcDEXRouter (patchado, compatível com USDC precompile) na Arc Testnet.
 *
 * Uso:
 *   1. No .env, defina DEPLOYER_PRIVATE_KEY=0x... (chave da carteira que vai pagar o gas).
 *   2. Rode: npx hardhat run scripts/deploy-router.cjs --network arcTestnet
 *   3. Copie a linha VITE_DEX_ROUTER_ADDRESS=... exibida no final e atualize seu .env.
 *   4. Reinicie o app (npm run dev) e aprove USDC de novo na tela de Swap.
 */
const hre = require("hardhat");

const FACTORY_ADDRESS = "0x4b6F738717c46A8998990EBCb17FEf032DC5958B";

async function main() {
  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    console.error("\n❌ ERRO: Nenhuma conta configurada para deploy.");
    console.error("\nSolução:");
    console.error("1. Adicione DEPLOYER_PRIVATE_KEY no seu .env:");
    console.error("   DEPLOYER_PRIVATE_KEY=0x... (sua chave privada com fundos na Arc Testnet)");
    console.error("\n2. Certifique-se de que a carteira tem ARC para pagar o gas.");
    console.error("\n3. Rode novamente: npm run deploy:router");
    process.exit(1);
  }
  const [deployer] = signers;
  console.log("Deployando com a conta:", deployer.address);
  console.log("Factory (constructor):", FACTORY_ADDRESS);
  
  // Verificar saldo antes de deployar
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Saldo da conta:", hre.ethers.formatEther(balance), "USDC (gas)");
  if (balance === 0n) {
    console.warn("\n⚠️  AVISO: A conta não tem USDC para gas. O deploy pode falhar.");
    console.warn("   Faça um faucet na Arc Testnet primeiro.");
  }

  const ArcDEXRouter = await hre.ethers.getContractFactory("ArcDEXRouter");
  const router = await ArcDEXRouter.deploy(FACTORY_ADDRESS);
  await router.waitForDeployment();
  const address = await router.getAddress();

  console.log("\n--- ArcDEXRouter deployado ---");
  console.log("Endereço:", address);
  console.log("\nAtualize seu .env com:");
  console.log("VITE_DEX_ROUTER_ADDRESS=" + address);
  console.log("\nDepois: reinicie o app (npm run dev) e aprove USDC de novo na tela de Swap.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
