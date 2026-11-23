// In-process route dispatch with synthetic identity only. No app/database startup.
const assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..');
const mock=(f,exports)=>{const id=require.resolve(root+'/'+f);require.cache[id]={id,filename:id,loaded:true,exports};};
mock('middleware/auth',(q,s,n)=>n());
for(const c of ['hrShiftsController','hrDevicesController','hrActivityController']){const id=require.resolve(root+'/controllers/'+c);const source=require('fs').readFileSync(id,'utf8');const names=[...source.matchAll(/exports\.(\w+)\s*=/g)].map(x=>x[1]);if(c==='hrActivityController')names.push(...['getActivityTypes','createActivityType','updateActivityType','deleteActivityType']);mock('controllers/'+c,Object.fromEntries(names.map(n=>[n,(q,s)=>s.json({called:n})])));}
let checks=0;
for(const route of ['hrShiftsRoutes','hrDevicesRoutes','hrActivityRoutes']){const r=require(root+'/routes/'+route);for(const layer of r.stack.filter(x=>x.route&&(x.route.methods.post||x.route.methods.put))){for(const role of ['employee','sales','user','admin','manager']){let code=200,body;const req={user:{role}},res={status(n){code=n;return this},json(x){body=x;return this}};let i=0;const run=()=>layer.route.stack[i++]?.handle(req,res,run);run();if(['admin','manager'].includes(role)){assert.equal(code,200);assert.ok(body.called);}else{assert.equal(code,403);assert.ok(!body.called);}checks++;}}}
console.log('PASS HR management POST/PUT route boundaries',checks,'synthetic dispatch checks; admin/manager allowed, other roles rejected');
