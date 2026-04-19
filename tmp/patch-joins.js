const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, '..', 'controllers');

const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(controllersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Cast specific UUID to anything JOINs
  content = content.replace(/ru\.vendor_id\s*=\s*c\.id/g, 'ru.vendor_id::text = c.id::text');
  content = content.replace(/ru\.responsible_person_id\s*=\s*u\.id/g, 'ru.responsible_person_id::text = u.id::text');
  content = content.replace(/d\.unit_id\s*=\s*ru\.id/g, 'd.unit_id::text = ru.id::text');
  content = content.replace(/rp\.unit_id\s*=\s*ru\.id/g, 'rp.unit_id::text = ru.id::text');
  content = content.replace(/rp\.deal_id\s*=\s*d\.id/g, 'rp.deal_id::text = d.id::text');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated JOINs in ${file}`);
  }
}
