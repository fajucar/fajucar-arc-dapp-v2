// Simple verification script
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

console.log('Verifying frontend .env configuration...\n');

if (!fs.existsSync(envPath)) {
  console.log('❌ .env file not found at:', envPath);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));

console.log('Found .env file with', lines.length, 'configuration lines\n');

const addresses = {
  MOCK_USDC: null,
  GIFT_CARD_NFT: null,
  GIFT_CARD_MINTER: null,
};

lines.forEach(line => {
  const [key, ...valueParts] = line.split('=');
  const value = valueParts.join('=').trim();
  
  if (key === 'VITE_MOCK_USDC_ADDRESS') {
    addresses.MOCK_USDC = value;
  } else if (key === 'VITE_GIFT_CARD_NFT_ADDRESS') {
    addresses.GIFT_CARD_NFT = value;
  } else if (key === 'VITE_GIFT_CARD_MINTER_ADDRESS') {
    addresses.GIFT_CARD_MINTER = value;
  }
});

// Validate
const addressRegex = /^0x[a-fA-F0-9]{40}$/;
let allValid = true;

console.log('Contract Addresses:');
console.log('==================\n');

if (addresses.MOCK_USDC) {
  const isValid = addressRegex.test(addresses.MOCK_USDC);
  console.log(`MOCK_USDC: ${addresses.MOCK_USDC}`);
  console.log(`  ${isValid ? '✅ Valid format' : '❌ Invalid format'}\n`);
  if (!isValid) allValid = false;
} else {
  console.log('MOCK_USDC: ❌ Not set\n');
  allValid = false;
}

if (addresses.GIFT_CARD_NFT) {
  const isValid = addressRegex.test(addresses.GIFT_CARD_NFT);
  console.log(`GIFT_CARD_NFT: ${addresses.GIFT_CARD_NFT}`);
  console.log(`  ${isValid ? '✅ Valid format' : '❌ Invalid format'}\n`);
  if (!isValid) allValid = false;
} else {
  console.log('GIFT_CARD_NFT: ❌ Not set\n');
  allValid = false;
}

if (addresses.GIFT_CARD_MINTER) {
  const isValid = addressRegex.test(addresses.GIFT_CARD_MINTER);
  console.log(`GIFT_CARD_MINTER: ${addresses.GIFT_CARD_MINTER}`);
  console.log(`  ${isValid ? '✅ Valid format' : '❌ Invalid format'}\n`);
  if (!isValid) allValid = false;
} else {
  console.log('GIFT_CARD_MINTER: ❌ Not set\n');
  allValid = false;
}

// Check for duplicates
const uniqueAddresses = new Set(Object.values(addresses).filter(Boolean));
if (Object.values(addresses).filter(Boolean).length !== uniqueAddresses.size) {
  console.log('⚠️  Warning: Duplicate addresses detected\n');
}

console.log('==================');
if (allValid) {
  console.log('✅ All addresses are valid!');
  console.log('Your frontend configuration is ready.\n');
  process.exit(0);
} else {
  console.log('❌ Some addresses are missing or invalid.');
  console.log('Please check your .env file.\n');
  process.exit(1);
}









