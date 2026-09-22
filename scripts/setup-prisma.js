const fs = require('fs');
const path = require('path');

console.log('Setting up Prisma client (pre-generated, no WASM needed)...');

const targetPrisma = path.join(process.cwd(), 'node_modules', '.prisma', 'client');
const sourcePrisma = path.join(process.cwd(), 'prisma', 'generated', '.prisma', 'client');

const targetClient = path.join(process.cwd(), 'node_modules', '@prisma', 'client');
const sourceClient = path.join(process.cwd(), 'prisma', 'generated', '@prisma', 'client');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.log('Source not found:', src);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

try {
  copyDir(sourcePrisma, targetPrisma);
  console.log('Prisma client copied to node_modules/.prisma/client');
  copyDir(sourceClient, targetClient);
  console.log('@prisma/client copied to node_modules/@prisma/client');
  console.log('Prisma setup complete!');
} catch (err) {
  console.error('Prisma setup error:', err.message);
}
