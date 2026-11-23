// User-approved policy: apply the effective assigned shift's band per day,
// sum deduction days for the month. Salary divisor is deliberately unchanged.
function penaltyDays(lateMinutes, rules) {
    const late = Number(lateMinutes || 0);
    if (!Number.isFinite(late) || late < 0) throw new Error('Invalid attendance lateness.');
    if (late === 0) return 0;
    if (!Array.isArray(rules) || rules.length === 0) throw new Error('Late attendance requires configured shift penalty rules.');
    const bands = rules.map(r => {
        if (!r || ['from_min','to_min','deduct_days'].some(k => r[k] === null || r[k] === undefined || r[k] === '')) throw new Error('Shift penalty rules contain missing values.');
        return {from:Number(r.from_min), to:Number(r.to_min), days:Number(r.deduct_days)};
    }).sort((a,b)=>a.from-b.from);
    for (let i=0;i<bands.length;i++) {
        const b=bands[i];
        if (![b.from,b.to,b.days].every(Number.isFinite) || b.from<0 || b.to<b.from || b.days<0 || (i && b.from<=bands[i-1].to)) throw new Error('Shift penalty rules are invalid or overlapping.');
    }
    const band=bands.find(b=>late>=b.from && late<=b.to);
    if (!band) throw new Error('No configured shift penalty band covers this attendance lateness.');
    return band.days;
}
async function calculate(client,{user,tenant,branch,month,year,timezone}) {
    const result=await client.query(`SELECT a.id,a.work_hours,a.late_minutes,
        COALESCE(a.attendance_date,(a.check_in AT TIME ZONE $6)::date)::text AS work_date,
        s.deduction_rules
        FROM hr_attendance a
        LEFT JOIN LATERAL (
            SELECT sh.deduction_rules FROM hr_user_shifts us JOIN hr_shifts sh ON sh.id=us.shift_id
            WHERE us.user_id=a.user_id AND us.tenant_id::text=$2::text AND sh.tenant_id::text=$2::text
              AND us.effective_from<=COALESCE(a.attendance_date,(a.check_in AT TIME ZONE $6)::date)
              AND (us.effective_to IS NULL OR us.effective_to>=COALESCE(a.attendance_date,(a.check_in AT TIME ZONE $6)::date))
              AND sh.is_active=TRUE ORDER BY us.effective_from DESC,us.id DESC LIMIT 1
        ) s ON TRUE
        WHERE a.user_id=$1 AND a.tenant_id::text=$2::text AND a.branch_id::text=$3::text
          AND EXTRACT(MONTH FROM COALESCE(a.attendance_date,(a.check_in AT TIME ZONE $6)::date))=$4
          AND EXTRACT(YEAR FROM COALESCE(a.attendance_date,(a.check_in AT TIME ZONE $6)::date))=$5
        ORDER BY work_date,a.id`,[user,tenant,branch,month,year,timezone]);
    const seen=new Set();let days=0,hours=0,minutes=0;
    for(const row of result.rows){
        if(seen.has(row.work_date))throw new Error('Multiple attendance rows for a day require review before payroll.');
        seen.add(row.work_date);days+=penaltyDays(row.late_minutes,row.deduction_rules);hours+=Number(row.work_hours)||0;minutes+=Number(row.late_minutes)||0;
    }
    return {days:Number(days.toFixed(6)),hours,minutes};
}
module.exports={penaltyDays,calculate};
