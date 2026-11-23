const db = require('../config/db');
const fail = (message, status = 409) => { const e = new Error(message); e.status = status; throw e; };
function localParts(instant, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));
  return {day:`${parts.year}-${parts.month}-${parts.day}`, minutes:Number(parts.hour)*60+Number(parts.minute), stamp:`${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`};
}
async function timezoneFor(client, tenant, branch) {
  const r=await client.query('SELECT timezone FROM branches WHERE id::text=$1::text AND tenant_id::text=$2::text',[branch,tenant]);
  const zone=r.rows[0]?.timezone;
  try { if(!zone) throw Error(); localParts(new Date(),zone); } catch (_) { fail('Attendance requires a valid timezone on the active branch.',400); }
  return zone;
}
function deviceInstant(stamp, zone) {
  if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(stamp)) fail('Invalid device timestamp.',400);
  const base=Date.parse(stamp.replace(' ','T')+'Z');
  if(!Number.isFinite(base)) fail('Invalid device timestamp.',400);
  const offsets=new Set();
  for(const delta of [-36,0,36]) { const t=base+delta*3600000; const s=localParts(new Date(t),zone).stamp;offsets.add(Date.parse(s.replace(' ','T')+'Z')-t); }
  const matches=[...offsets].map(o=>new Date(base-o)).filter(d=>localParts(d,zone).stamp===stamp);
  if(matches.length!==1) fail('Ambiguous or nonexistent device local time.',400);
  return matches[0];
}
async function lateness(client,user,tenant,day,instant,zone) {
 const r=await client.query(`SELECT s.start_time,s.grace_minutes FROM hr_user_shifts us JOIN hr_shifts s ON s.id=us.shift_id
 WHERE us.user_id=$1 AND us.tenant_id::text=$2::text AND s.tenant_id::text=$2::text AND us.effective_from<=$3::date
 AND (us.effective_to IS NULL OR us.effective_to>=$3::date) AND s.is_active=TRUE ORDER BY us.effective_from DESC LIMIT 1`,[user,tenant,day]);
 let deadline=555;
 if(r.rows.length){const [h,m]=String(r.rows[0].start_time||'09:00').split(':').map(Number);deadline=h*60+m+Number(r.rows[0].grace_minutes||0);}
 const late=Math.max(0,localParts(instant,zone).minutes-deadline);return {late,status:late?'late':'present'};
}
async function transact({tenant,branch,user,mode,instant=new Date(),stamp,ip}) {
 const client=await db.connect();
 try {
  await client.query('BEGIN');
  const zone=await timezoneFor(client,tenant,branch);
  if(stamp) instant=deviceInstant(stamp,zone);
  const day=localParts(instant,zone).day;
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",[String(tenant),`${user}:${day}`]);
  const r=await client.query(`SELECT * FROM hr_attendance WHERE user_id=$1 AND tenant_id::text=$2::text
   AND (attendance_date=$3::date OR (attendance_date IS NULL AND (check_in AT TIME ZONE $4)::date=$3::date)) FOR UPDATE`,[user,tenant,day,zone]);
  if(r.rows.length>1) fail('Multiple attendance records need review. No records were changed.');
  const row=r.rows[0];
  if(row&&String(row.branch_id)!==String(branch)) fail('Attendance for this day belongs to another branch.');
  if(mode==='in'&&row) fail('Already checked in today.',400);
  if(mode==='out'&&(!row||row.check_out)) fail('No active open session to check out from.',400);
  let saved;
  if(!row) {
   const l=await lateness(client,user,tenant,day,instant,zone);
   saved=await client.query(`INSERT INTO hr_attendance(user_id,tenant_id,branch_id,check_in,attendance_date,status,late_minutes,ip_address,source)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[user,tenant,branch,instant,day,l.status,l.late,ip||null,mode==='device'?'device':'manual']);
  } else {
   const oldIn=new Date(row.check_in),oldOut=row.check_out?new Date(row.check_out):null;
   let first=oldIn,last;
   if(mode==='out') {last=instant;if(last<first) fail('Checkout cannot precede check-in.',400);}
   else { first=new Date(Math.min(oldIn.getTime(),instant.getTime()));const end=Math.max(oldIn.getTime(),oldOut?.getTime()||0,instant.getTime());last=end>first.getTime()?new Date(end):null; }
   const l=await lateness(client,user,tenant,day,first,zone);
   const hours=last?Number(((last-first)/3600000).toFixed(2)):null;
   saved=await client.query(`UPDATE hr_attendance SET check_in=$1,check_out=$2,work_hours=$3,status=$4,late_minutes=$5
    WHERE id=$6 AND tenant_id::text=$7::text AND branch_id::text=$8::text RETURNING *`,[first,last,hours,l.status,l.late,row.id,tenant,branch]);
  }
  await client.query('COMMIT');return {row:saved.rows[0],timezone:zone,attendance_date:day};
 } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
}
module.exports={localParts,timezoneFor,deviceInstant,transact};
