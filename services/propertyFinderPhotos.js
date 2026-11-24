'use strict';
const net=require('node:net');
// Provider URLs only. No network downloads, credential forwarding or DB writes.
function safeImageUrl(value){
 if(typeof value!=='string'||value.length>8192)return null;
 try{const u=new URL(value.trim());const h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!h.includes('.')||h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')||net.isIP(h))return null;
  u.hash='';return u.href;
 }catch{return null;}
}
function extractPhotos(payload){
 if(typeof payload==='string'){try{payload=JSON.parse(payload)}catch{return[]}}
 if(!payload||typeof payload!=='object')return[];
 const candidates=Array.isArray(payload.media?.images)?payload.media.images:Array.isArray(payload.images)?payload.images:[];
 const seen=new Set(),photos=[];
 for(const image of candidates.slice(0,200)){
  const variants=typeof image==='string'?[image]:image&&typeof image==='object'?[image.original?.error?null:image.original?.url,image.large?.url,image.medium?.url,image.watermarked?.error?null:image.watermarked?.url,image.url,image.thumbnail?.url]:[];
  const url=variants.map(safeImageUrl).find(Boolean);if(!url||seen.has(url))continue;seen.add(url);
  photos.push({url,original_name:'Property Finder photo '+(photos.length+1),source:'property_finder'});
 }
 return photos;
}
module.exports={safeImageUrl,extractPhotos};
