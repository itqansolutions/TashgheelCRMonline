import React, { useEffect, useRef, useState } from 'react';
import api from '../services/api';
export default function WhatsAppInboundOperations({ accountId, accountLabel, requestContext, resolutionEnabled=false }) {
 const [state,setState]=useState({loading:false,data:null,error:null});
 const request=useRef(0);
 const contextNow=()=>JSON.stringify([accountId,requestContext||'',localStorage.getItem('branch_id'),localStorage.getItem('token')]);
 const context=contextNow();
 useEffect(()=>{request.current++;setState({loading:false,data:null,error:null});},[context]);
 const labels={prepared:'تم تجهيز خطوة البوت',dispatching:'محاولة إرسال البوت',review:'تحتاج مراجعة',captured:'بانتظار التجهيز',staged:'تم تجهيز الدفعة',pending:'بانتظار المعالجة',processing:'جار المعالجة',applied:'تمت المعالجة',quarantined:'تحتاج مراجعة',EVENT_IDENTITY_CONFLICT:'تعارض في بيانات الحدث',TARGET_CONTEXT_CHANGED:'تغير ربط الحساب',INBOX_SCHEMA_UNSUPPORTED:'صيغة دفعة غير مدعومة',OPERATION_SCHEMA_UNSUPPORTED:'صيغة حدث غير مدعومة',MANUAL_REVIEW_REQUIRED:'مراجعة يدوية مطلوبة',awaiting_outbound_target:'بانتظار ربط حالة التسليم بالرسالة المرسلة',manual_review_required:'مراجعة يدوية مطلوبة',BOT_DISPATCH_OUTCOME_REQUIRES_REVIEW:'نتيجة إرسال البوت تحتاج مراجعة',BOT_TURN_MANUAL_REVIEW:'خطوة بوت تحتاج مراجعة'};
 const label=code=>labels[code]||'حالة تحتاج مراجعة';
 async function refresh(){
  const generation=++request.current,capturedContext=contextNow();
  setState({loading:true,data:null,error:null,context:capturedContext});
  try{const response=await api.get(`/whatsapp/coexistence/verified/operations/accounts/${accountId}`,{assertRequestContext:()=>contextNow()===capturedContext});if(request.current===generation&&contextNow()===capturedContext)setState({loading:false,data:response.data.data,error:null,context:capturedContext});}
  catch{if(request.current===generation&&contextNow()===capturedContext)setState({loading:false,data:null,error:'تعذر تحميل حالة الاستقبال. لا تعتبر عدم ظهور التنبيهات تأكيداً بأن كل الرسائل اتعالجت.'});}
 }
 async function finalizeAccepted(turn){
  if(!resolutionEnabled||!window.confirm('تأكيد استكمال حالة البوت بعد إرسال مؤكد؟ لن يتم إرسال أي رسالة جديدة.'))return;
  const generation=++request.current,capturedContext=contextNow();
  setState({loading:true,data:null,error:null,context:capturedContext});
  try{await api.post(`/whatsapp/coexistence/verified/operations/accounts/${accountId}/turns/${turn.id}/finalize-accepted`,{confirm:true},{assertRequestContext:()=>contextNow()===capturedContext});if(request.current===generation&&contextNow()===capturedContext)await refresh();}
  catch{if(request.current===generation&&contextNow()===capturedContext)setState({loading:false,data:null,error:'تعذر استكمال الخطوة. لم نطلب إرسال رسالة جديدة. راجع حالة الربط والسجل قبل المحاولة.',context:capturedContext});}
 }
 const d=state.context===context?state.data:null;
 return <section dir="rtl" aria-label="حالة استقبال واتساب" style={{padding:16,marginTop:16,border:'1px solid #cbd5e1',borderRadius:8,background:'#f8fafc',color:'#0f172a',lineHeight:1.7}}>
  <strong>حالة استقبال واتساب: <bdi>{accountLabel||`#${accountId}`}</bdi></strong>
  <p style={{margin:'4px 0'}}>{resolutionEnabled?'متابعة واستكمال حالة البوت بعد تأكيد الإرسال فقط، بدون إرسال جديد.':'عرض للمتابعة فقط. الرسائل التي تحتاج مراجعة لا يتم إرسالها من جديد تلقائياً.'}</p>
  <button type="button" disabled={state.loading} onClick={refresh} style={{padding:'7px 14px',border:'1px solid #94a3b8',borderRadius:6,background:'white',cursor:'pointer'}}>{state.loading?'جار التحميل...':'تحديث حالة الاستقبال'}</button>
  {!d&&!state.loading&&!state.error&&<p role="status">اضغط تحديث لعرض الحالة للرقم والفرع الحالي. تم إخفاء أي نتيجة سابقة عند تغيير السياق.</p>}
  {state.error&&<p role="alert" style={{color:'#b91c1c',fontWeight:600}}>{state.error}</p>}
  {d&&<div>
   <p>حالة دفعات الاستقبال: {d.inbox.length?d.inbox.map(x=>`${label(x.state)}: ${x.count}`).join(' | '):'لا توجد دفعات مسجلة لهذا الرقم والفرع'}</p>
   <p>حالة المعالجة: {d.queue.length?d.queue.map(x=>`${label(x.state)}: ${x.count}`).join(' | '):'لا توجد مهام مسجلة'}</p>
   <p>جهات اتصال واتساب للربط الحالي: {d.contacts.total}، منها المحذوفة من دفتر العناوين: {d.contacts.removed}. لا يحذف هذا عملاء CRM.</p>
   {(d.inboxReview.length>0||d.review.length>0)&&<div role="status" style={{background:'#fffbeb',padding:12,border:'1px solid #fcd34d',borderRadius:6}}>
    <strong>توجد عناصر تحتاج متابعة</strong>
    <ul>{d.inboxReview.map(x=><li key={'i'+x.id}>دفعة #{x.id}: {label(x.reason)} <small dir="ltr">({x.reason})</small></li>)}{d.review.map(x=><li key={'w'+x.id}>مهمة #{x.id}: {label(x.reason)} <small dir="ltr">({x.reason})</small></li>)}</ul>
    <p>لا تعِد إرسال رسالة من هنا. المراجعة اليدوية مطلوبة قبل أي إعادة معالجة غير مؤكدة.</p>
   </div>}
   {d.botTurns?.available&&<div><p>خطوات البوت: {d.botTurns.states.map(x=>`${label(x.state)}: ${x.count}`).join(' | ')||'لا توجد خطوات مسجلة'}</p>{d.botTurns.review.map(x=><p key={x.id}>{label(x.reason)} <small dir="ltr">({x.id})</small>، مرجع الإرسال: <bdi>{x.journal_id}</bdi>. لا تُعِد الإرسال تلقائياً. {resolutionEnabled&&x.can_finalize_accepted&&<button type="button" disabled={state.loading} onClick={()=>finalizeAccepted(x)}>استكمال حالة البوت فقط، بدون إرسال</button>}</p>)}</div>}
   <small>نسبة الدفعة للفرع محفوظة وقت الاستقبال. صلاحية العرض تعتمد على حسابك والفرع الحالي، وليست موافقة على إعادة التشغيل.</small>
  </div>}
 </section>;
}
