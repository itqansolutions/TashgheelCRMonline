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
 def setval(selector,value):
  ev('(()=>{let e=document.querySelector('+json.dumps(selector)+');Object.getOwnPropertyDescriptor(e.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype,"value").set.call(e,'+json.dumps(value)+');e.dispatchEvent(new Event(e.tagName==="SELECT"?"change":"input",{bubbles:true}));})()');time.sleep(.12)
 for tab in ['Expenses','Receipts','Payments','Vendor']:
  goto('/contacts/vendors' if tab=='Vendor' else '/finance?tab='+tab)
  if tab=='Vendor':ev('document.querySelector("main button[title]").parentElement.querySelectorAll("button")[1].click()')
  else:ev('document.querySelector("main .btn-primary").click()')
  time.sleep(.4)
  sel='#vendor-payment-treasury'if tab=='Vendor'else'#quick-treasury-account'
  check(tab+' explicit treasury shown',ev('!!document.querySelector('+json.dumps(sel)+')'))
  form='document.querySelector('+json.dumps(sel)+').closest("form")'
  setval('form input[type=number]','25')
  ev(form+'.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');time.sleep(.2)
  check(tab+' missing account prevents POST',ev('!(window.formPosts||[]).length'))
  method='#expense-payment-method' if tab=='Expenses' else ('form select' if tab=='Vendor' else 'form select:not(:first-of-type)')
  if tab in ['Receipts','Payments']:
   method=ev('[...document.querySelectorAll("form select")].map((e,i)=>({i,values:[...e.options].map(x=>x.value)})).filter(x=>x.values.includes("bank_transfer"))[0].i')
   ev('document.querySelectorAll("form select")['+str(method)+'].id="test-method"');method='#test-method'
  setval('form input[type=number]','25')
  setval(sel,'4')
  setval(method,'bank_transfer')
  check(tab+' method change clears selection',ev('document.querySelector('+json.dumps(sel)+').value')=='')
  check(tab+' bank-only filtering',ev('[...document.querySelector('+json.dumps(sel)+').options].filter(e=>e.value).map(e=>e.value)')==['5'])
  setval(method,'cash')
  if tab in ['Receipts','Payments']:
   ev('document.querySelector("#quick-treasury-account").closest("form").querySelector("select").value')
   setval('form select','other')
   txt=ev('[...document.querySelectorAll("form input[type=text]")].map(e=>e.outerHTML)')
   setval('form input[type=text]','Synthetic Party')
  if tab=='Expenses':setval('form input[type=text]','Synthetic Expense')
  setval('form input[type=number]','25')
  setval(sel,'4')
  time.sleep(5)
  img=call('Page.captureScreenshot',{'format':'png'})['data'];(out/('grouped-'+tab+'-'+os.environ.get('AUDIT_LANG','ar')+'-'+os.environ.get('AUDIT_WIDTH','360')+'.png')).write_bytes(base64.b64decode(img))
  ev('document.querySelectorAll("*").forEach(e=>{if(["auto","scroll"].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight)e.scrollTop=e.scrollHeight})');time.sleep(.2)
  img=call('Page.captureScreenshot',{'format':'png'})['data'];(out/('grouped-bottom-'+tab+'-'+os.environ.get('AUDIT_LANG','ar')+'-'+os.environ.get('AUDIT_WIDTH','360')+'.png')).write_bytes(base64.b64decode(img))
  ev(form+'.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));'+form+'.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}))');time.sleep(.4)
  posts=ev('window.formPosts||[]')
  check(tab+' one POST with exact selected account',len(posts)==1 and str(posts[0]['payload'].get('treasury_account_id'))=='4' and float(posts[0]['payload']['amount'])==25)
 print(json.dumps(results))

finally:p.terminate();p.wait(timeout=10);server.shutdown()
