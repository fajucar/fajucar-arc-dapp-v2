const fs = require('fs');
const path = require('path');

const contractsPath = path.join(__dirname, '../contracts');
const packageJsonPath = path.join(contractsPath, 'package.json');

if (fs.existsSync(packageJsonPath)) {
  process.exit(0); // Contracts folder exists
} else {
  console.log('⚠️  Contracts folder not found. Skipping contracts commands.');
  process.exit(1); // Contracts folder doesn't exist
}

