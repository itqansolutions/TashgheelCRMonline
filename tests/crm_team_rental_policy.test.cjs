'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const p=require('../services/crmTeamRentalPolicy');
const team={id:7,tenant_id:'a',branch_id:'b',is_active:true};
const members=[{team_id:7,tenant_id:'a',user_id:1,is_active:false},{team_id:7,tenant_id:'a',user_id:2,is_active:true}];
test('team-only remains unassigned to an individual',()=>assert.deepEqual(p.validateAssignment({tenantId:'a',branchId:'b',team,members}),{assigned_team_id:7,assigned_to:null}));
test('lead-receiving disabled is still a team member',()=>assert(p.canUseTeam({tenantId:'a',branchId:'b',team,members,userId:1})));
test('outsider, removed membership, cross tenant and branch denied',()=>{
 for(const data of [{userId:3},{userId:1,members:[]},{userId:1,tenantId:'x'},{userId:1,branchId:'x'}])assert.equal(p.canUseTeam({tenantId:'a',branchId:'b',team,members,...data}),false);
 assert.throws(()=>p.validateAssignment({tenantId:'a',branchId:'b',team,members,employeeId:3}),/EMPLOYEE_NOT_TEAM_MEMBER/);
});
test('calendar arithmetic returns local Cairo 09:00 without hardcoded UTC offset',()=>{
 assert.deepEqual(p.rentalDueDate('2027-01-01',7),{localDate:'2026-12-25',localTime:'09:00',timezone:'Africa/Cairo'});
 assert.equal(p.rentalDueDate('2028-03-01',1).localDate,'2028-02-29');
 for(const date of ['2027-02-29','2026-13-01','bad'])assert.throws(()=>p.rentalDueDate(date,1));
 assert.throws(()=>p.rentalDueDate('2027-01-01',-1));
});
test('audience manager plus responsible, no broad fallback',()=>{
 const users=[{id:1,tenant_id:'a',branch_id:'b'},{id:2,tenant_id:'a',branch_id:'b'},{id:3,tenant_id:'x',branch_id:'b'}];
 const base={tenantId:'a',branchId:'b',teamId:7,members,users};
 assert.deepEqual(p.internalRecipients({...base,managerId:1,responsibleId:2}),['1','2']);
 assert.deepEqual(p.internalRecipients({...base,managerId:1,responsibleId:1}),['1']);
 assert.deepEqual(p.internalRecipients({...base,managerId:1}),['1','2']);
 assert.deepEqual(p.internalRecipients({...base,members:[]}),[]);
 assert.throws(()=>p.internalRecipients({...base,responsibleId:3}),/INVALID_RESPONSIBLE_EMPLOYEE/);
});
test('logged action attribution never follows deal owner or claims verified delivery',()=>{
 assert.deepEqual(p.activityBucket({entity_type:'deal',user_id:1,assigned_to:2,action:'whatsapp',meta:{is_manual:true}}),{actor:'1',action:'whatsapp',origin:'manual'});
 assert.equal(p.activityBucket({entity_type:'customer',action:'called'}),null);
 assert.equal(p.activityBucket({entity_type:'deal',action:'created'}),null);
 assert.equal(p.activityBucket({entity_type:'deal',action:'called',meta:{}}).origin,'unverified');
});
