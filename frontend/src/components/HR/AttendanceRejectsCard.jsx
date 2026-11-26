import React,{useState,useEffect} from 'react';
import api from '../../services/api';
import {useLanguage} from '../../context/LanguageContext';
const REASONS={
 GEO_OUTSIDE_AREA:['خارج نطاق الفرع','Outside branch area'],
 GEO_FIX_STALE:['موقع قديم / ساعة الجهاز غلط','Stale location / device clock'],
 GEO_FIX_REQUIRED:['الموقع (GPS) مش مفعّل','Location not provided'],
 GEO_FIX_INVALID:['موقع غير صالح','Invalid location'],
 GEO_MOBILE_ONLY:['محاولة من غير موبايل','Not a mobile device']
};
// Read-only list of refused attendance punches (distance and accuracy only, no coordinates). Kept 90 days.
export default function AttendanceRejectsCard({branchKey}){
 const {isRTL}=useLanguage();const text=(ar,en)=>isRTL?ar:en;
 const [rows,setRows]=useState(null),[days,setDays]=useState(30),[error,setError]=useState('');
 useEffect(()=>{let live=true;setRows(null);setError('');
  api.get('/hr/attendance-policy/rejects',{params:{days,limit:100}}).then(r=>{if(live)setRows(r.data.data||[])}).catch(()=>{if(live)setError(text('سجل الرفض غير متاح دلوقتي.','Rejection log is unavailable right now.'))});
  return()=>{live=false}},[branchKey,days]);
 const fmt=v=>v===null||v===undefined?'-':Math.round(Number(v));
 const when=v=>{try{return new Date(v).toLocaleString(isRTL?'ar-EG':'en-GB')}catch{return v}};
 const th={textAlign:isRTL?'right':'left',padding:'8px 10px',fontSize:12,color:'#64748b',borderBottom:'1px solid #e2e8f0',whiteSpace:'nowrap'};
 const td={padding:'8px 10px',fontSize:13,borderBottom:'1px solid #f1f5f9'};
 return <section dir={isRTL?'rtl':'ltr'} style={{padding:16,border:'1px solid #cbd5e1',borderRadius:12,marginTop:20,background:'#fff'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginBottom:6}}>
   <h3 style={{margin:0,fontSize:16,fontWeight:800}}>{text('سجل رفض الحضور (الموقع)','Attendance location rejections')}</h3>
   <select value={days} onChange={e=>setDays(Number(e.target.value))} style={{padding:'6px 10px',borderRadius:8,border:'1px solid #cbd5e1'}}>
    {[7,30,90].map(d=><option key={d} value={d}>{text(`آخر ${d} يوم`,`Last ${d} days`)}</option>)}
   </select>
  </div>
  <p style={{margin:'0 0 10px',fontSize:12,color:'#64748b'}}>{text('للعرض فقط. بيتسجل المسافة والدقة بس، من غير إحداثيات، وبيتمسح بعد 90 يوم.','View only. Records distance and accuracy only, no coordinates, kept 90 days.')}</p>
  {error?<div style={{color:'#b91c1c',fontSize:13}}>{error}</div>
  :rows===null?<div style={{color:'#64748b',fontSize:13}}>{text('جاري التحميل...','Loading...')}</div>
  :rows.length===0?<div style={{color:'#64748b',fontSize:13}}>{text('مفيش حالات رفض في الفترة دي.','No rejections in this period.')}</div>
  :<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr>
    {[text('الموظف','Employee'),text('النوع','Type'),text('السبب','Reason'),text('المسافة (م)','Distance (m)'),text('النطاق (م)','Radius (m)'),text('دقة GPS (م)','Accuracy (m)'),text('الوقت','Time')].map(h=><th key={h} style={th}>{h}</th>)}
   </tr></thead><tbody>{rows.map(r=><tr key={r.id}>
    <td style={td}>{r.user_name||`#${r.user_id}`}</td>
    <td style={td}>{r.mode==='out'?text('انصراف','Check-out'):text('حضور','Check-in')}</td>
    <td style={td}>{(REASONS[r.reason_code]||[r.reason_code,r.reason_code])[isRTL?0:1]}</td>
    <td style={td}>{fmt(r.distance_m)}</td><td style={td}>{fmt(r.radius_m)}</td><td style={td}>{fmt(r.accuracy_m)}</td>
    <td style={td}>{when(r.created_at)}</td></tr>)}</tbody></table></div>}
 </section>;
}
