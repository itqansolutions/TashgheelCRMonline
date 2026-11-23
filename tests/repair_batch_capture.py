import subprocess,tempfile,time,json,urllib.request,websocket,base64,os
from pathlib import Path
out=Path(os.environ.get('BATCH_FIXTURE_DIR','/downloads/batch-two-ui'))
p=subprocess.Popen(['google-chrome','--headless','--no-sandbox','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=9227','--user-data-dir='+tempfile.mkdtemp(),'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
try:
 for _ in range(60):
  try:
   tabs=json.load(urllib.request.urlopen('http://localhost:9227/json'));break
  except:time.sleep(.1)
 ws=websocket.create_connection(tabs[0]['webSocketDebuggerUrl']);num=0
 def call(method,params={}):
  global num
  num+=1;ws.send(json.dumps({'id':num,'method':method,'params':params}))
  while True:
   r=json.loads(ws.recv())
   if r.get('id')==num:
    if 'error'in r:raise RuntimeError(r['error'])
    return r.get('result',{})
 def ev(js):return call('Runtime.evaluate',{'expression':js,'returnByValue':True}).get('result',{}).get('value')
 for view,lang in [('invoice','ar'),('invoice','en'),('email','en'),('reservations','ar'),('reservations','en'),('customer','ar')]:
  for width,height,suffix in [(390,844,''),(1440,1000,'-desktop')]:
   call('Emulation.setDeviceMetricsOverride',{'width':width,'height':height,'deviceScaleFactor':1,'mobile':False})
   url='file://'+str(out/'index.html')+'?view='+view+'&lang='+lang+('&preview=1' if view in ['email','invoice'] else '')
   call('Page.navigate',{'url':url})
   selector='#invoice-payment-treasury' if view=='invoice' else '#customer-email-error' if view=='email' else '.re-mobile-cards' if view=='reservations' else '.c360-identity'
   for _ in range(120):
    if ev('!!document.querySelector('+json.dumps(selector)+')'):break
    time.sleep(.1)
   else:raise RuntimeError('preview not ready '+view+' '+lang)
   time.sleep(.3)
   shot={'format':'png','captureBeyondViewport':False}
   if view=='reservations' and width==390:
    full=call('Page.getLayoutMetrics')['cssContentSize'];shot={'format':'png','captureBeyondViewport':True,'clip':{'x':0,'y':0,'width':390,'height':full['height'],'scale':1}}
   img=call('Page.captureScreenshot',shot)['data'];(out/(view+'-'+lang+suffix+'.png')).write_bytes(base64.b64decode(img))
   if view=='reservations':
    display=ev('getComputedStyle(document.querySelector(".re-mobile-cards table")).display');assert display==('block' if width==390 else 'table'),display
   print('CAPTURE',view,lang,width,'ready')
finally:
 p.terminate();p.wait(timeout=10)
