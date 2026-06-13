// Test script to verify .env configuration
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

console.log('Testing frontend .env configuration...\n');

const issues = [];
const warnings = [];

// Check if collection address is set
const collectionAddress = process.env.VITE_FAJUCAR_COLLECTION_ADDRESS;

if (!collectionAddress || collectionAddress === '') {
  issues.push('❌ VITE_FAJUCAR_COLLECTION_ADDRESS is not set');
} else {
  console.log('✅ FAJUCAR_COLLECTION_ADDRESS:', collectionAddress);
}

// Validate address format (should start with 0x and be 42 chars)
const addressRegex = /^0x[a-fA-F0-9]{40}$/;

if (collectionAddress) {
  if (!addressRegex.test(collectionAddress)) {
    issues.push('❌ FAJUCAR_COLLECTION_ADDRESS format is invalid (should be 0x followed by 40 hex characters)');
  } else {
    console.log('   ✓ Format is valid');
  }
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
