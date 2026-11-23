import subprocess,tempfile,time,json,urllib.request,websocket,base64,os,threading,http.server
from pathlib import Path
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
 for x in json.loads((root/'tests/mobile-route-inventory.json').read_text())['routes']:
  s=x['path']
  if s not in ['(index)','*','/','pricing','hub','upgrades','registrations','audit'] and not x['redirect'] and not x['dynamic']:
   s='/'+s.lstrip('/')
   if s not in paths:paths.append(s)
 paths+=['/','/public/units/synthetic/gallery','/finance/invoice-preview/479','/finance/quotation-preview/1','/itqan-crm-hud/hub','/itqan-crm-hud/pricing','/itqan-crm-hud/upgrades','/itqan-crm-hud/registrations','/itqan-crm-hud/audit'];paths+=['/finance?tab='+x for x in ['Invoices','Quotations','Receipts','Payments','Expenses','Customers','Vendors','Treasury','Reports']]
 if os.environ.get('AUDIT_PATHS'):paths=os.environ['AUDIT_PATHS'].split(',')
 configs=[(int(os.environ.get('AUDIT_WIDTH','390')),l)for l in os.environ.get('AUDIT_LANGS','ar').split(',')]
 if os.environ.get('AUDIT_MATRIX'):configs=[(w,l)for w in [360,390,430,1440]for l in ['ar','en']]
 for width,lang in configs:
  call('Emulation.setDeviceMetricsOverride',{'width':width,'height':900,'deviceScaleFactor':1,'mobile':width<769})
  call('Page.navigate',{'url':'http://127.0.0.1:8897/login'});time.sleep(.15)
  ev('localStorage.setItem("itqan_lang",'+json.dumps(lang)+');localStorage.setItem("lang",'+json.dumps(lang)+');true')
  for path in paths:
   call('Page.navigate',{'url':'http://127.0.0.1:8897'+path})
   time.sleep(.42)
   for _ in range(20):
    if ev('document.readyState==="complete"&&document.body.innerText.trim().length>0'):break
    time.sleep(.05)
   data=ev('''(()=>{const vw=innerWidth;const visible=e=>!!(e.offsetWidth||e.offsetHeight)&&getComputedStyle(e).visibility!=='hidden';const issues=[...document.querySelectorAll('main *, .modal-content *')].filter(visible).filter(e=>{let r=e.getBoundingClientRect();if(!r.width)return false;let a=e.parentElement;while(a&&a!==document.body){if(['auto','scroll'].includes(getComputedStyle(a).overflowX))return false;a=a.parentElement}return r.right>vw+2||r.left< -2}).slice(0,10).map(e=>({tag:e.tagName,cls:e.className?.baseVal??e.className,text:e.innerText?.slice(0,65),width:Math.round(e.getBoundingClientRect().width)}));return{path:location.pathname+location.search,title:document.querySelector('main h1,main h2')?.innerText||document.querySelector('h1,h2')?.innerText,body:document.body.innerText.slice(-200),documentWidth:document.documentElement.scrollWidth,viewport:vw,issues,header:document.querySelector('header')?{client:document.querySelector('header').clientWidth,scroll:document.querySelector('header').scrollWidth}:null,error:/Something went wrong|Cannot read properties|Render Error|حدث خطأ غير متوقع|ReferenceError|TypeError/.test(document.body.innerText)}})()''')
   data['rendered']=bool(ev('document.body.innerText.trim().length>0'));data.update(requested=path,language=lang,width=width);results.append(data)
   if os.environ.get('AUDIT_CAPTURE') and (os.environ.get('AUDIT_CAPTURE')=='all' or data['issues'] or data['error']):
    name=path.strip('/').replace('/','_').replace('?','_').replace('=','_')+'-'+lang+'-'+str(width)+'.png';img=call('Page.captureScreenshot',{'format':'png'})['data'];(out/name).write_bytes(base64.b64decode(img))
   print(width,lang,path,'ERROR'if data['error']else 'OVERFLOW'if data['issues']else 'geometry-ok',flush=True)
 print('EXCEPTION_COUNT',len(events));(out/os.environ.get('AUDIT_RESULT','before.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2))
finally:p.terminate();p.wait(timeout=10);server.shutdown()
