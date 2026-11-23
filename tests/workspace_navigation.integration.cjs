// Isolated component regression tests. Never imports the app entrypoint or connects to APIs.
// Uses existing frontend dev dependencies: npm --prefix frontend ci, then run this file.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const frontend = path.join(root, 'frontend');
const frontendRequire = createRequire(path.join(frontend, 'package.json'));
const esbuild = frontendRequire('esbuild');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-navigation-'));
const cases = [
  { name: 'vendors-only manager', role: 'manager', pages: ['/contacts/vendors'], modules: { purchasing: true }, workspace: 'contacts', link: '/contacts/vendors' },
  { name: 'payroll-only HR manager', role: 'manager', pages: ['/hr/payroll'], modules: { hr: true }, workspace: 'hr', link: '/hr/payroll' },
  { name: 'warehouses-only user', role: 'user', pages: ['/inventory/warehouses'], modules: { inventory: true }, workspace: 'inventory', link: '/inventory/warehouses' },
  { name: 'files-only manager', role: 'manager', pages: ['/files'], modules: {}, workspace: 'admin', link: '/files' },
  { name: 'purchase-order child permission', role: 'user', pages: ['/purchases/orders'], modules: { purchasing: true }, workspace: 'inventory', link: '/purchases/orders' },
  { name: 'sales child permission', role: 'user', pages: ['/sales/salesmen'], modules: { sales: true }, workspace: 'sales', link: '/sales/salesmen' },
  { name: 'marketing child permission', role: 'user', pages: ['/marketing/whatsapp-chatbots'], modules: { marketing: true }, workspace: 'marketing', link: '/marketing/whatsapp-chatbots' },
  { name: 'stale saved admin workspace', role: 'manager', pages: ['/contacts/vendors'], modules: { purchasing: true }, saved: 'admin', workspace: 'contacts', link: '/contacts/vendors' },
  { name: 'valid saved workspace retained', role: 'manager', pages: ['/contacts/vendors', '/inventory/warehouses'], modules: { purchasing: true, inventory: true }, saved: 'inventory', workspace: 'inventory', link: '/inventory/warehouses' },
  { name: 'storage unavailable', role: 'manager', pages: ['/contacts/vendors'], modules: { purchasing: true }, storageThrows: true, workspace: 'contacts', link: '/contacts/vendors' },
  { name: 'no grants and stale selection', role: 'user', pages: [], modules: {}, saved: 'admin', workspace: null, absent: ['/files', '/settings', '/contacts/vendors'] },
  { name: 'disabled purchasing stays hidden', role: 'manager', pages: ['/contacts/vendors'], modules: {}, workspace: null, absent: ['/contacts/vendors'] },
  { name: 'disabled HR stays hidden', role: 'manager', pages: ['/hr/payroll'], modules: {}, workspace: null, absent: ['/hr/payroll'] },
  { name: 'disabled inventory stays hidden', role: 'user', pages: ['/inventory/warehouses'], modules: {}, workspace: null, absent: ['/inventory/warehouses'] },
  { name: 'category boundary is not a string prefix grant', role: 'user', pages: ['/inventory-archive'], modules: { inventory: true }, workspace: null, absent: ['/inventory/warehouses'] },
  { name: 'unauthorized sibling links stay hidden', role: 'manager', pages: ['/files'], modules: {}, workspace: 'admin', link: '/files', absent: ['/settings', '/settings/company', '/logs', '/billing'] },
  { name: 'admin enabled-module control', role: 'admin', pages: [], modules: { real_estate: true, crm: true, sales: true, purchasing: true, inventory: true, hr: true, marketing: true, finance: true, reports: true }, workspace: 'admin', link: '/contracts', admin: true }
];
const entry = `
import React from 'react';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {StaticRouter} from 'react-router-dom/server';
import {WorkspaceProvider,useWorkspace} from ${JSON.stringify(path.join(frontend, 'src/context/WorkspaceContext.jsx'))};
import Sidebar from ${JSON.stringify(path.join(frontend, 'src/components/Layout/Sidebar.jsx'))};
import ProtectedRoute from ${JSON.stringify(path.join(frontend, 'src/components/ProtectedRoute.jsx'))};
let context;
function Probe(){context=useWorkspace();return null;}
const results=[];
for(const c of ${JSON.stringify(cases)}){
  const user={role:c.role,allowedPages:c.pages};
  globalThis.__fixture={user,modules:c.modules};
  const before=JSON.stringify(globalThis.__fixture);
  const writes=[];
  globalThis.localStorage={getItem:()=>{if(c.storageThrows)throw Error('unavailable');return c.saved||null;},setItem:(k,v)=>{if(c.storageThrows)throw Error('unavailable');writes.push([k,v]);}};
  const html=renderToStaticMarkup(<StaticRouter location={c.link||'/my-profile'}><WorkspaceProvider><Probe/><Sidebar isOpen={true} toggleSidebar={()=>{}}/></WorkspaceProvider></StaticRouter>);
  const links=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&'));
  assert.equal(context.activeWorkspace,c.workspace,c.name+': workspace compatibility');
  assert(!html.includes('class="workspace-trigger'),c.name+': legacy selector visible');
  assert.equal(links.length,new Set(links).size,c.name+': duplicated destination');
  if(c.link){
    assert(links.includes(c.link),c.name+': permitted link missing');
    const guarded=renderToStaticMarkup(<StaticRouter location={c.link}><ProtectedRoute><b>allowed-marker</b></ProtectedRoute></StaticRouter>);
    assert(guarded.includes('allowed-marker'),c.name+': destination guard changed');
  }
  for(const p of c.absent||[])assert(!links.includes(p),c.name+': unauthorized or disabled link shown '+p);
  if(!c.admin){
    const expected=new Set([...c.pages,'/my-payroll','/activity-balance','/my-profile']);
    for(const p of links)assert(expected.has(p),c.name+': unexpected sibling link '+p);
  }
  assert.equal(JSON.stringify(globalThis.__fixture),before,c.name+': permission fixture changed');
  context.setActiveWorkspace('not-a-workspace');
  assert.equal(writes.length,0,c.name+': denied switch persisted');
  results.push({name:c.name,status:'PASS',activeWorkspace:context.activeWorkspace,accessibleWorkspaces:context.accessibleWorkspaces.map(w=>w.id)});
}
console.log(JSON.stringify({count:results.length,results},null,2));
`;
const fixtures = { name: 'isolated-auth-fixtures', setup(build) {
  build.onResolve({ filter: /(AuthContext|LanguageContext|useModule)(\.jsx?)?$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'js', contents:
    args.path.includes('AuthContext') ? 'export const useAuth=()=>({user:globalThis.__fixture.user,isAuthenticated:true,loading:false});'
    : args.path.includes('LanguageContext') ? 'export const useLanguage=()=>({t:k=>k,isRTL:false});'
    : 'export const useModule=()=>({can:m=>globalThis.__fixture.modules[m]===true,planName:"synthetic",trialDaysLeft:null});'
  }));
} };
(async () => {
  try {
    const outfile = path.join(temp, 'run.cjs');
    await esbuild.build({ stdin: { contents: entry, loader: 'jsx', resolveDir: frontend }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', outfile, plugins: [fixtures],
      alias: Object.fromEntries(['react', 'react-dom', 'react-router-dom'].map(n => [n, path.dirname(frontendRequire.resolve(n + '/package.json'))])) });
    const result = spawnSync(process.execPath, [outfile], { encoding: 'utf8' });
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    if (result.error) throw result.error;
    process.exitCode = result.status === null ? 1 : result.status;
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
