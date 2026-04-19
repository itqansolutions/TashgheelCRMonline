const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, '..', 'controllers');

const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('.js'));

let updatedFilesCount = 0;

for (const file of files) {
  const filePath = path.join(controllersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Regex to match tenant_id = $1, c.tenant_id = $2, etc. (with optional spacing)
  // But avoid replacing if it already has ::text
  
  // Replace tenant_id = $1
  content = content.replace(/(?<!::text\s*)(\btenant_id)\s*=\s*\$(\d+)(?!::text)/g, '$1::text = $$$2::text');
  
  // Replace branch_id = $1
  content = content.replace(/(?<!::text\s*)(\bbranch_id)\s*=\s*\$(\d+)(?!::text)/g, '$1::text = $$$2::text');

  // Replace unit_id = $1 just in case
  content = content.replace(/(?<!::text\s*)(\bunit_id)\s*=\s*\$(\d+)(?!::text)/g, '$1::text = $$$2::text');
  
  // Fix dealsController JOIN: "ON d.unit_id = ru.id" -> "ON d.unit_id::text = ru.id::text"
  content = content.replace(/ON\s+(\w+)\.unit_id\s*=\s*(\w+)\.id/g, 'ON $1.unit_id::text = $2.id::text');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
    updatedFilesCount++;
  }
}

console.log(`Refactored ${updatedFilesCount} controller files.`);
