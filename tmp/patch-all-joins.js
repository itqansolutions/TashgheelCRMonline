const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, '..', 'controllers');
const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(controllersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let newContent = content;

  // Fix dealsController JOINs
  newContent = newContent.replace(/ON d\.client_id = c\.id/g, 'ON d.client_id::text = c.id::text');
  newContent = newContent.replace(/ON d\.product_id = p\.id/g, 'ON d.product_id::text = p.id::text');
  newContent = newContent.replace(/ON d\.assigned_to = u\.id/g, 'ON d.assigned_to::text = u.id::text');
  newContent = newContent.replace(/ON d\.id = rp\.deal_id/g, 'ON d.id::text = rp.deal_id::text');
  newContent = newContent.replace(/ON p\.id = d\.product_id/g, 'ON p.id::text = d.product_id::text');
  
  // Fix financeController payments invoice_id Subqueries
  newContent = newContent.replace(/p\.invoice_id = i\.id/g, 'p.invoice_id::text = i.id::text');

  // Fix reportsController invalid column `client_id` -> `customer_id` and add missing casts
  newContent = newContent.replace(/i\.client_id::text/g, 'i.customer_id::text');
  newContent = newContent.replace(/i\.client_id/g, 'i.customer_id');

  // Fix customersController joins
  newContent = newContent.replace(/ON c\.assigned_to = u\.id/g, 'ON c.assigned_to::text = u.id::text');
  newContent = newContent.replace(/ON c\.source_id = ls\.id/g, 'ON c.source_id::text = ls.id::text');

  if (newContent !== content) {
    fs.writeFileSync(filePath, newContent);
    console.log(`Updated ${file}`);
  }
}
