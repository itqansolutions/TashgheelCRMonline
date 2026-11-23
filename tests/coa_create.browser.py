import subprocess,tempfile,time,json,urllib.request,websocket,base64,os,threading,http.server
from pathlib import Path
# Build fixture first: FINANCE_FORM_TEST=1 node tests/mobile_app_fixture.cjs
# Run with AUDIT_LANG=ar|en and AUDIT_WIDTH=360|1440. No live URLs or real writes.
root=Path(__file__).resolve().parent.parent;out=Path('/downloads/mobile-campaign');app=out/'app'
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(app),**kwargs)
 def do_GET(self):
  if self.path.split('?')[0]not in ['/bundle.js','/bundle.css']:self.path='/index.html'
  return super().do_GET()
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',8897),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
p=subprocess.Popen(['google-chrome','--headless','--no-sandbox','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=9227','--user-data-dir='+tempfile.mkdtemp(),'about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
results=[]
try:
 for _ in range(60):
  try:tabs=json.load(urllib.request.urlopen('http://localhost:9227/json'));break
  except:time.sleep(.1)
 ws=websocket.create_connection(tabs[0]['webSocketDebuggerUrl']);num=0;events=[]
 def call(method,params={}):
  global num
  num+=1;ws.send(json.dumps({'id':num,'method':method,'params':params}))
  while True:
   r=json.loads(ws.recv())
   if r.get('method')=='Runtime.exceptionThrown':events.append(r)
   if r.get('id')==num:
    if 'error'in r:raise RuntimeError(r['error'])
    return r.get('result',{})
 def ev(js):return call('Runtime.evaluate',{'expression':js,'returnByValue':True}).get('result',{}).get('value')
 call('Runtime.enable');paths=[]
 call('Emulation.setDeviceMetricsOverride',{'width':int(os.environ.get('AUDIT_WIDTH','360')),'height':740,'deviceScaleFactor':1,'mobile':True})
 def goto(path):
  call('Page.navigate',{'url':'http://127.0.0.1:8897'+path});time.sleep(.7)
 def check(name,condition):
  assert condition,name
  results.append({'check':name,'pass':True});print('PASS',name,flush=True)
 goto('/login')
 ev('localStorage.setItem("itqan_lang",'+json.dumps(os.environ.get('AUDIT_LANG','ar'))+');true')
 goto('/erp/accounts')
 ev('[...document.querySelectorAll("main button")].find(e=>e.textContent.includes("Add Account")).click()');time.sleep(.2)
 check('COA add opens dialog',ev('!!document.querySelector("[role=dialog]")'))
 ev('[...document.querySelectorAll("[role=dialog] button")].find(e=>["Cancel","إلغاء"].includes(e.textContent)).click()');time.sleep(.1)
 check('cancel closes without write',ev('!document.querySelector("[role=dialog]")&&!(window.coaPosts||[]).length'))
 ev('[...document.querySelectorAll("main button")].find(e=>e.textContent.includes("Add Account")).click()');time.sleep(.1)
 for sel,val in [('#coa-code','1199'),('#coa-name','Synthetic Posting'),('#coa-parent','1')]:
  ev('(()=>{let e=document.querySelector('+json.dumps(sel)+');Object.getOwnPropertyDescriptor(e.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype,"value").set.call(e,'+json.dumps(val)+');e.dispatchEvent(new Event(e.tagName==="SELECT"?"change":"input",{bubbles:true}));})()');time.sleep(.1)
 ev('document.querySelectorAll("*").forEach(e=>{if(["auto","scroll"].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight)e.scrollTop=e.scrollHeight})');time.sleep(.1)
 img=call('Page.captureScreenshot',{'format':'png'})['data'];(out/('coa-'+os.environ.get('AUDIT_LANG','ar')+'-'+os.environ.get('AUDIT_WIDTH','360')+'.png')).write_bytes(base64.b64decode(img))
 ev('document.querySelector("[role=dialog] form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));document.querySelector("[role=dialog] form").dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');time.sleep(.4)
 posts=ev('window.coaPosts||[]');check('single correct COA payload',len(posts)==1 and posts[0]['code']=='1199'and posts[0]['parent_id']=='1'and posts[0]['type']=='asset')
 check('save closes and refetched row displayed',ev('!document.querySelector("[role=dialog]")&&document.querySelector("main").innerText.includes("Synthetic Posting")'))
 print(json.dumps(results))

finally:p.terminate();p.wait(timeout=10);server.shutdown()
