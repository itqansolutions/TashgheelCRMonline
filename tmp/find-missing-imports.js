const fs = require('fs');
const path = require('path');

function findFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        findFiles(fullPath);
      }
    } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('<Link') && !content.includes("import { Link }") && !content.includes("import {Link}")) {
        console.log(`❌ Missing Link import in: ${fullPath}`);
      }
    }
  }
}

findFiles('frontend/src');
