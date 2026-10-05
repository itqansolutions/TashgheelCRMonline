const fs = require('fs');
const path = require('path');

const controllersDir = path.join(process.cwd(), 'controllers');
const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('.js'));

console.log(`Scanning ${files.length} controller files...`);

const results = [];

files.forEach(file => {
  const content = fs.readFileSync(path.join(controllersDir, file), 'utf8');
  
  // Find all db.query or client.query matches
  const queryRegex = /(?:db|client)\.query\s*\(\s*([`'"])([\s\S]*?)\1\s*(?:,\s*(\[[^\]]*\]))?/g;
  let match;
  while ((match = queryRegex.exec(content)) !== null) {
    const rawSql = match[2];
    const params = match[3] || '[]';
    const lineNumber = content.substring(0, match.index).split('\n').length;

    // Skip internal DDL or information_schema queries or system setup queries
    if (/information_schema|pg_tables|table_name|column_name|ALTER TABLE|CREATE TABLE/i.test(rawSql)) continue;

    // Check if query is SELECT/UPDATE/DELETE with WHERE clause
    const whereMatch = rawSql.match(/WHERE\s+([\s\S]*?)(?:GROUP|ORDER|LIMIT|RETURNING|$)/i);
    if (!whereMatch) continue;
    const whereClause = whereMatch[1];

    // Check if WHERE clause uses an ID parameter or condition
    const hasIdInWhere = /\b(?:id|unit_id|deal_id|invoice_id|customer_id|lead_id|user_id|contract_id|installment_id|voucher_id|branch_id)\b/i.test(whereClause);
    
    // Check if tenant_id is in WHERE clause
    const hasTenantInWhere = /\btenant_id\b/i.test(whereClause);

    if (hasIdInWhere && !hasTenantInWhere) {
      results.push({
        file,
        line: lineNumber,
        sql: rawSql.replace(/\s+/g, ' ').trim().substring(0, 120),
        params: params.replace(/\s+/g, ' ').trim()
      });
    }
  }
});

console.log(`\n=== RESULTS: Total queries matching [WHERE with ID parameter but NO tenant_id IN SAME QUERY]: ${results.length} ===\n`);
results.forEach(r => console.log(`${r.file}:${r.line}\n  SQL: ${r.sql}\n  PARAMS: ${r.params}\n`));
