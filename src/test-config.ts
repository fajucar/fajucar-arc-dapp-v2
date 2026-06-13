// Test script to verify .env configuration
import { CONTRACT_ADDRESSES } from './config/contracts';

export function testConfig() {
  console.log('Testing frontend configuration...\n');
  
  const issues: string[] = [];
  
  // Check if addresses are set
  if (!CONTRACT_ADDRESSES.MOCK_USDC) {
    issues.push('❌ VITE_MOCK_USDC_ADDRESS is not set');
  } else {
    console.log('✅ MOCK_USDC_ADDRESS:', CONTRACT_ADDRESSES.MOCK_USDC);
  }
  
  if (!CONTRACT_ADDRESSES.GIFT_CARD_NFT) {
    issues.push('❌ VITE_GIFT_CARD_NFT_ADDRESS is not set');
  } else {
    console.log('✅ GIFT_CARD_NFT_ADDRESS:', CONTRACT_ADDRESSES.GIFT_CARD_NFT);
  }
  
  if (!CONTRACT_ADDRESSES.GIFT_CARD_MINTER) {
    issues.push('❌ VITE_GIFT_CARD_MINTER_ADDRESS is not set');
  } else {
    console.log('✅ GIFT_CARD_MINTER_ADDRESS:', CONTRACT_ADDRESSES.GIFT_CARD_MINTER);
  }
  
  // Validate address format (basic check - should start with 0x and be 42 chars)
  const addressRegex = /^0x[a-fA-F0-9]{40}$/;
  
  if (CONTRACT_ADDRESSES.MOCK_USDC && !addressRegex.test(CONTRACT_ADDRESSES.MOCK_USDC)) {
    issues.push('❌ MOCK_USDC_ADDRESS format is invalid (should be 0x followed by 40 hex characters)');
  }
  
  if (CONTRACT_ADDRESSES.GIFT_CARD_NFT && !addressRegex.test(CONTRACT_ADDRESSES.GIFT_CARD_NFT)) {
    issues.push('❌ GIFT_CARD_NFT_ADDRESS format is invalid (should be 0x followed by 40 hex characters)');
  }
  
  if (CONTRACT_ADDRESSES.GIFT_CARD_MINTER && !addressRegex.test(CONTRACT_ADDRESSES.GIFT_CARD_MINTER)) {
    issues.push('❌ GIFT_CARD_MINTER_ADDRESS format is invalid (should be 0x followed by 40 hex characters)');
  }
  
  console.log('\n--- Test Results ---');
  if (issues.length === 0) {
    console.log('✅ All configuration checks passed!');
    console.log('\nYour frontend is ready to use.');
    return true;
  } else {
    console.log('❌ Configuration issues found:');
    issues.forEach(issue => console.log(issue));
    return false;
  }
}

// Run test if imported directly
if (import.meta.hot) {
  testConfig();
}









