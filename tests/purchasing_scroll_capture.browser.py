import subprocess,tempfile,json,urllib.request,time,websocket,base64,pathlib
root=pathlib.Path(pathlib.Path('/tmp/purchasing-fixture-dir').read_text())
p=subprocess.Popen(['google-chrome','--headless','--no-sandbox','--disable-gpu','--remote-debugging-port=9227','--remote-allow-origins=*','--user-data-dir='+tempfile.mkdtemp(),'about:blank'],stdout=open('/tmp/company-cdp-chrome.log','w'),stderr=subprocess.STDOUT)
try:
 for _ in range(60):
  try: targets=json.load(urllib.request.urlopen('http://127.0.0.1:9227/json'));break
  except:time.sleep(.1)
 ws=websocket.create_connection(targets[0]['webSocketDebuggerUrl']);seq=0
 def call(method,params={}):
  global seq
  seq+=1;ws.send(json.dumps({'id':seq,'method':method,'params':params}))
  while True:
   r=json.loads(ws.recv())
   if r.get('id')==seq:return r.get('result',r)
 def js(s):return call('Runtime.evaluate',{'expression':s,'returnByValue':True}).get('result',{}).get('value')
 call('Emulation.setDeviceMetricsOverride',{'width':360,'height':1000,'deviceScaleFactor':1,'mobile':True})
 call('Page.navigate',{'url':'file://'+str(root)+'/index.html?lang=ar&state=orders'})
 for _ in range(60):
  if js('!!document.body.dataset.result'):break
  time.sleep(.1)
 for part,selector in [('amounts','.purchasing-read-page .responsive-table-region'),('ledger','.purchasing-read-page .responsive-table-region')]:
  print(js("document.querySelector('"+selector+"').scrollIntoView({block:'start',behavior:'instant'});JSON.stringify({y:scrollY,viewport:innerWidth,width:document.documentElement.scrollWidth,target:document.querySelector('"+selector+"').getBoundingClientRect().toJSON()})"))
  time.sleep(.3)
  if part=='amounts':
   print(js("(()=>{const e=document.querySelector('.purchasing-read-page .responsive-table-region');e.scrollLeft=-550;return JSON.stringify({left:e.scrollLeft,width:e.scrollWidth,client:e.clientWidth})})()"))
  if part=='ledger':
   print(js("(()=>{const e=document.querySelector('.purchasing-read-page .responsive-table-region');e.scrollLeft=-e.scrollWidth;return JSON.stringify({left:e.scrollLeft,width:e.scrollWidth,client:e.clientWidth})})()"))
  img=call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})
  pathlib.Path('/downloads/ui-phase1/Purchasing-real-scroll-'+part+'.png').write_bytes(base64.b64decode(img['data']))
finally:p.terminate();p.wait()
