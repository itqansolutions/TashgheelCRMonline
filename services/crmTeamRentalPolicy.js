'use strict';
// Pure policy helpers. No I/O, notifications, mutation or implicit ownership.
const ACTIONS = new Set(['called','whatsapp','meeting','email_sent','follow_up','visited','note','task']);
function same(a,b){return a!=null&&b!=null&&String(a)===String(b)}
function canUseTeam({tenantId,branchId,team,members,userId}) {
 if(!team||!same(team.tenant_id,tenantId)||team.is_active===false)return false;
 if(branchId&&team.branch_id&&!same(branchId,team.branch_id))return false;
 // member.is_active controls receipt of new leads, not membership itself.
 return members.some(m=>same(m.tenant_id,tenantId)&&same(m.team_id,team.id)&&same(m.user_id,userId));
}
function validateAssignment({tenantId,branchId,team,members,employeeId}) {
 if(!team||!same(team.tenant_id,tenantId)||team.is_active===false)throw Error('INVALID_TEAM');
 if(branchId&&team.branch_id&&!same(branchId,team.branch_id))throw Error('TEAM_BRANCH_MISMATCH');
 if(employeeId&&!canUseTeam({tenantId,branchId,team,members,userId:employeeId}))throw Error('EMPLOYEE_NOT_TEAM_MEMBER');
 return {assigned_team_id:team.id,assigned_to:employeeId||null};
}
function rentalDueDate(endDate,leadDays) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||!Number.isInteger(leadDays)||leadDays<0)throw Error('INVALID_NOTICE_TERM');
 const d=new Date(endDate+'T00:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==endDate)throw Error('INVALID_NOTICE_DATE');
 d.setUTCDate(d.getUTCDate()-leadDays);
 return {localDate:d.toISOString().slice(0,10),localTime:'09:00',timezone:'Africa/Cairo'};
}
function internalRecipients({tenantId,branchId,managerId,responsibleId,members,users,teamId}) {
 const eligible=id=>users.some(u=>same(u.id,id)&&same(u.tenant_id,tenantId)&&u.status!=='inactive'&&(!branchId||!u.branch_id||same(u.branch_id,branchId)));
 const out=new Set();
 if(managerId&&eligible(managerId))out.add(String(managerId));
 if(responsibleId){if(!eligible(responsibleId))throw Error('INVALID_RESPONSIBLE_EMPLOYEE');out.add(String(responsibleId));}
 else for(const m of members)if(same(m.tenant_id,tenantId)&&same(m.team_id,teamId)&&eligible(m.user_id))out.add(String(m.user_id));
 return [...out];
}
function activityBucket(row) {
 if(String(row.entity_type).toLowerCase()!=='deal'||!ACTIONS.has(row.action))return null;
 const meta=typeof row.meta==='string'?JSON.parse(row.meta):row.meta||{};
 return {actor:row.user_id==null?null:String(row.user_id),action:row.action,origin:meta.is_manual===true?'manual':'unverified'};
}
module.exports={canUseTeam,validateAssignment,rentalDueDate,internalRecipients,activityBucket};
