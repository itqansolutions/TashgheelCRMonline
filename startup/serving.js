// Startup/core readiness only, not certification of ordinary API schema or effects.
const {validateGroup}=require('./groupPrerequisites');
const {validateWarehouseDelete}=require('./warehouseDeletePrerequisites');
exports.validateSchema=async(db,workerMode)=>{
 await validateGroup(db,'core');
 await validateGroup(db,'events');
 await validateWarehouseDelete(db);
 if(workerMode==='preserve-existing'){
  await validateGroup(db,'activity-reminders');
  await validateGroup(db,'contract-expiry');
  await validateGroup(db,'existing-background-workers');
 }
};
exports.startServing=async({db,workerMode,registerEvents,startWorkers,listen,validate=exports.validateSchema})=>{
 let server;const handles=[];
 const originalTimeout=global.setTimeout,originalInterval=global.setInterval;
 const stop=async()=>{
  for(const h of handles){clearTimeout(h);clearInterval(h);}
  if(server?.listening)await new Promise(resolve=>server.close(resolve));
 };
 try{
  if(!['preserve-existing','paused-maintenance'].includes(workerMode))throw Error('Explicit STARTUP_WORKER_MODE decision required');
  await validate(db,workerMode);await registerEvents();
  // Legacy starters register timers synchronously. Capture every handle even on partial failure.
  if(workerMode==='preserve-existing'){
   global.setTimeout=(...args)=>{const h=originalTimeout(...args);handles.push(h);return h;};
   global.setInterval=(...args)=>{const h=originalInterval(...args);handles.push(h);return h;};
   try{await startWorkers();}finally{global.setTimeout=originalTimeout;global.setInterval=originalInterval;}
  }
  server=listen();
  await new Promise((resolve,reject)=>{
   if(server.listening)return resolve();
   const onListening=()=>{server.removeListener('error',onError);resolve();};
   const onError=error=>{server.removeListener('listening',onListening);reject(error);};
   server.once('listening',onListening);server.once('error',onError);
  });
  server.stopRuntime=stop;return server;
 }catch(e){global.setTimeout=originalTimeout;global.setInterval=originalInterval;await stop();throw e;}
};
