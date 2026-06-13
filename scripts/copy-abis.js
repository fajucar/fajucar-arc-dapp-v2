const fs = require('fs');
const path = require('path');

// Paths
const artifactsDir = path.join(__dirname, '../../artifacts/contracts');
const frontendDir = path.join(__dirname, '../src/abis');

// Contracts to copy
const contracts = [
  'MockUSDC.sol/MockUSDC.json',
  'GiftCardNFT.sol/GiftCardNFT.json',
  'GiftCardMinter.sol/GiftCardMinter.json',
];

// Create abis directory if it doesn't exist
if (!fs.existsSync(frontendDir)) {
  fs.mkdirSync(frontendDir, { recursive: true });
}

// Copy ABIs
contracts.forEach((contract) => {
  const sourcePath = path.join(artifactsDir, contract);
  const contractName = path.basename(contract, '.json');
  const destPath = path.join(frontendDir, `${contractName}.json`);

  if (fs.existsSync(sourcePath)) {
    const artifact = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    const abi = artifact.abi;
    
    fs.writeFileSync(destPath, JSON.stringify(abi, null, 2));
    console.log(`✓ Copied ABI for ${contractName}`);
  } else {
    console.warn(`⚠ Contract artifact not found: ${sourcePath}`);
  }
});

console.log('\n✅ ABI copying complete!');









