import React,{useEffect,useRef,useState} from 'react';
import api from '../../services/api';
export default function StoredUnitPhoto({unitId,photoId,alt}){
 const [source,setSource]=useState(null),ref=useRef(null);
 useEffect(()=>{let active=true,url,controller=new AbortController(),observer;
  const load=()=>api.get(`/re-units/${unitId}/stored-photos/${photoId}`,{responseType:'blob',signal:controller.signal}).then(response=>{if(active){url=URL.createObjectURL(response.data);setSource(url)}}).catch(()=>{});
  setSource(null);
  if('IntersectionObserver'in window){observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load()}},{rootMargin:'150px'});observer.observe(ref.current)}else load();
  return()=>{active=false;controller.abort();observer?.disconnect();if(url)URL.revokeObjectURL(url)};
 },[unitId,photoId]);
 return <div ref={ref} style={{width:'100%',height:170,background:'#f1f5f9'}}>{source&&<img src={source} alt={alt} style={{width:'100%',height:'100%',objectFit:'cover'}}/>}</div>;
}
