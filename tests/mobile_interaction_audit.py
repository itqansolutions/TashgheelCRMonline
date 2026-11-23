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
 call('Emulation.setDeviceMetricsOverride',{'width':360,'height':740,'deviceScaleFactor':1,'mobile':True})
 def goto(path):
  call('Page.navigate',{'url':'http://127.0.0.1:8897'+path});time.sleep(.7)
 def check(name,condition):
  assert condition,name
  results.append({'check':name,'pass':True});print('PASS',name,flush=True)
 goto('/login')
 ev('localStorage.setItem("itqan_lang",'+json.dumps(os.environ.get('AUDIT_LANG','ar'))+');true')
 goto('/dashboard')
 check('notification counter keeps separate positioned class',ev('getComputedStyle(document.querySelector(".notification-count-badge")).position==="absolute"'))
 check('mobile navigation starts closed',ev('!document.querySelector(".mobile-sidebar-backdrop")'))
 ev('document.querySelector(".mobile-menu-toggle").click()');time.sleep(.35)
 check('toggle opens mobile navigation',ev('!!document.querySelector(".mobile-sidebar-backdrop")'))
 img=call('Page.captureScreenshot',{'format':'png'})['data'];(out/'mobile-menu-360.png').write_bytes(base64.b64decode(img))
 ev('document.querySelector(".mobile-sidebar-backdrop").click()');time.sleep(.2)
 check('backdrop closes navigation',ev('!document.querySelector(".mobile-sidebar-backdrop")'))
 goto('/whatsapp-chat')
 check('populated chat uses one pane',ev('getComputedStyle(document.querySelector(".chat-conversation-list")).display==="none"&&getComputedStyle(document.querySelector(".chat-message-pane")).display!=="none"'))
 ev('document.querySelector(".chat-mobile-back").click()');time.sleep(.25)
 check('chat back exposes conversation list',ev('getComputedStyle(document.querySelector(".chat-conversation-list")).display!=="none"&&getComputedStyle(document.querySelector(".chat-message-pane")).display==="none"'))
 ev('[...document.querySelectorAll(".chat-conversation-list span")].filter(e=>e.textContent.trim()==="Synthetic Buyer").at(-1).click()');time.sleep(.25)
 check('selecting conversation opens message pane',ev('getComputedStyle(document.querySelector(".chat-conversation-list")).display==="none"'))
 goto('/finance?tab=Invoices')
 badge=ev('(()=>{let b=[...document.querySelectorAll(".finance-status-badge")].find(e=>/سداد جزئي|Partial/i.test(e.textContent));if(!b)return null;b.scrollIntoView({block:"center"});return {text:b.textContent,position:getComputedStyle(b).position,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height}})()')
 check('actual Header plus invoice partial badge visible and static',badge and badge['position']=='static' and badge['width']>25 and badge['height']>15)
 img=call('Page.captureScreenshot',{'format':'png'})['data'];(out/'finance-partial-badge-360.png').write_bytes(base64.b64decode(img))
 for path in ['/customers','/contacts/customers','/contacts/employees','/finance?tab=Invoices','/erp/accounts','/hr/shifts','/purchases/requests']:
  goto(path)
  clicked=ev('(()=>{let b=document.querySelector("main .btn-primary")||[...document.querySelectorAll("main button")].find(e=>/^(Add|New|Create|إضافة|فاتورة جديدة)/.test(e.textContent.trim()));if(b){b.click();return b.textContent}return null})()');time.sleep(.5)
  geom=ev('(()=>{let d=document.querySelector("[role=dialog],.modal-content,.responsive-form-overlay>div")||[...document.querySelectorAll("div")].find(e=>getComputedStyle(e).position==="fixed"&&Number(getComputedStyle(e).zIndex)>=999&&e.querySelector("form,input"))?.firstElementChild;if(!d)return null;let r=d.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scroll:d.scrollHeight,client:d.clientHeight,bodyScroll:document.querySelector(".modal-body")?.scrollHeight}})()')
  results.append({'form':path,'clicked':clicked,'geometry':geom})
  if geom:
   check('dialog fits 360x740 '+path,geom['left']>=-1 and geom['right']<=361 and geom['top']>=-1 and geom['bottom']<=741)
   inner=ev('(()=>{let d=document.querySelector("[role=dialog],.modal-content,.responsive-form-overlay>div")||[...document.querySelectorAll("div")].find(e=>getComputedStyle(e).position==="fixed"&&Number(getComputedStyle(e).zIndex)>=999&&e.querySelector("form,input"))?.firstElementChild;if(!d)return [];let dr=d.getBoundingClientRect();return [...d.querySelectorAll("input,select,textarea,button")].filter(e=>{let a=e.parentElement;while(a&&a!==d){if(["auto","scroll"].includes(getComputedStyle(a).overflowX))return false;a=a.parentElement}let r=e.getBoundingClientRect();return r.width&&(r.left<dr.left-2||r.right>dr.right+2)}).map(e=>({tag:e.tagName,text:e.textContent,width:e.offsetWidth}))})()')
   check('form controls stay within dialog or local scroller '+path,not inner)
   ev('(()=>{let d=document.querySelector("[role=dialog],.modal-content,.responsive-form-overlay>div");if(d){[d,...d.querySelectorAll("*")].filter(e=>["auto","scroll"].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight).forEach(e=>e.scrollTop=e.scrollHeight)}})()');time.sleep(.2)
   img=call('Page.captureScreenshot',{'format':'png'})['data'];(out/('form-'+path.strip('/').replace('/','_').replace('?','_').replace('=','_')+'.png')).write_bytes(base64.b64decode(img))
 goto('/finance?tab=Receipts')
 ev('document.querySelector("main tbody .action-btn").click()');time.sleep(.4)
 for width in [360,390,430,1440]:
  call('Emulation.setDeviceMetricsOverride',{'width':width,'height':740 if width<768 else 1000,'deviceScaleFactor':1,'mobile':width<768})
  check('voucher document readable width '+str(width),ev('document.querySelector(".voucher-document").getBoundingClientRect().width>280'))
  check('voucher children contained '+str(width),ev('(()=>{let d=document.querySelector(".voucher-document"),r=d.getBoundingClientRect();return [...d.querySelectorAll("*")].every(e=>{let q=e.getBoundingClientRect();return !q.width||(q.left>=r.left-1&&q.right<=r.right+1)})})()'))
  if width==360:
   img=call('Page.captureScreenshot',{'format':'png'})['data'];(out/('voucher-mobile-'+os.environ.get('AUDIT_LANG','ar')+'.png')).write_bytes(base64.b64decode(img))
   ev('document.querySelector(".voucher-preview-scroll").scrollTop=10000');time.sleep(.2)
   img=call('Page.captureScreenshot',{'format':'png'})['data'];(out/('voucher-mobile-bottom-'+os.environ.get('AUDIT_LANG','ar')+'.png')).write_bytes(base64.b64decode(img))
   ev('document.querySelector(".voucher-preview-scroll").scrollTop=0')
 call('Emulation.setEmulatedMedia',{'media':'print'})
 check('print retains original document padding',ev('getComputedStyle(document.querySelector(".voucher-document")).paddingLeft==="44px"'))
 call('Emulation.setEmulatedMedia',{'media':'screen'})
 img=call('Page.captureScreenshot',{'format':'png'})['data'];(out/('voucher-desktop-'+os.environ.get('AUDIT_LANG','ar')+'.png')).write_bytes(base64.b64decode(img))
 (out/('interaction-results-'+os.environ.get('AUDIT_LANG','ar')+'.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2))
finally:p.terminate();p.wait(timeout=10);server.shutdown()
