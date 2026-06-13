// Test script to verify .env configuration
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('Testing frontend .env configuration...\n');

const issues = [];
const warnings = [];

// Check if addresses are set
const mockUSDC = process.env.VITE_MOCK_USDC_ADDRESS;
const giftCardNFT = process.env.VITE_GIFT_CARD_NFT_ADDRESS;
const giftCardMinter = process.env.VITE_GIFT_CARD_MINTER_ADDRESS;

if (!mockUSDC || mockUSDC === '') {
  issues.push('❌ VITE_MOCK_USDC_ADDRESS is not set');
} else {
  console.log('✅ MOCK_USDC_ADDRESS:', mockUSDC);
}

if (!giftCardNFT || giftCardNFT === '') {
  issues.push('❌ VITE_GIFT_CARD_NFT_ADDRESS is not set');
} else {
  console.log('✅ GIFT_CARD_NFT_ADDRESS:', giftCardNFT);
}

if (!giftCardMinter || giftCardMinter === '') {
  issues.push('❌ VITE_GIFT_CARD_MINTER_ADDRESS is not set');
} else {
  console.log('✅ GIFT_CARD_MINTER_ADDRESS:', giftCardMinter);
}

// Validate address format (should start with 0x and be 42 chars)
const addressRegex = /^0x[a-fA-F0-9]{40}$/;

if (mockUSDC) {
  if (!addressRegex.test(mockUSDC)) {
    issues.push('❌ MOCK_USDC_ADDRESS format is invalid (should be 0x followed by 40 hex characters)');
  } else {
    console.log('   ✓ Format is valid');
  }
}

if (giftCardNFT) {
  if (!addressRegex.test(giftCardNFT)) {
    issues.push('❌ GIFT_CARD_NFT_ADDRESS format is invalid (should be 0x followed by 40 hex characters)');
  } else {
    console.log('   ✓ Format is valid');
  }
}

if (giftCardMinter) {
  if (!addressRegex.test(giftCardMinter)) {
    issues.push('❌ GIFT_CARD_MINTER_ADDRESS format is invalid (should be 0x followed by 40 hex characters)');
  } else {
    console.log('   ✓ Format is valid');
  }
}

// Check for duplicate addresses
const addresses = [mockUSDC, giftCardNFT, giftCardMinter].filter(Boolean);
const uniqueAddresses = new Set(addresses);
if (addresses.length !== uniqueAddresses.size) {
  warnings.push('⚠️  Warning: Some contract addresses are duplicates');
}

console.log('\n--- Test Results ---');
if (issues.length === 0 && warnings.length === 0) {
  console.log('✅ All configuration checks passed!');
  console.log('\nYour frontend .env file is correctly configured.');
  console.log('You can now run: npm run dev');
  process.exit(0);
} else {
  if (issues.length > 0) {
    console.log('❌ Configuration issues found:');
    issues.forEach(issue => console.log('  ' + issue));
  }
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(warning => console.log('  ' + warning));
  }
  console.log('\nPlease fix the issues above and try again.');
  process.exit(1);
}









