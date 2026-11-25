// Prepared geofence enforcement. Caller supplies server-loaded branch policy.
// Browser-reported location and mobile User-Agent can be spoofed; not attestation.
const failure=(message,code,details)=>{const e=new Error(message);e.status=403;e.code=code;if(details)e.details=details;throw e;};
function distanceMeters(a,b,c,d){const rad=x=>x*Math.PI/180;const q=Math.sin(rad(c-a)/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;return 6371008.8*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));}
function validate(policy,location,userAgent,now=Date.now()){
 if(!policy)failure('Manual attendance requires a configured branch area.','GEO_NO_AREA');
 const p=policy,l=location||{};
 for(const k of ['center_lat','center_lng','radius_m','max_fix_age_seconds','max_future_skew_seconds'])if(p[k]===null||p[k]===undefined||p[k]===''||!Number.isFinite(Number(p[k])))failure('Branch location policy is invalid.','GEO_POLICY_INVALID');
 if(Math.abs(Number(p.center_lat))>90||Math.abs(Number(p.center_lng))>180||Number(p.radius_m)<=0||Number(p.max_fix_age_seconds)<=0||Number(p.max_future_skew_seconds)<0||p.require_mobile!==true)failure('Branch location policy is invalid.','GEO_POLICY_INVALID');
 if(p.require_mobile&&!/Android|iPhone|iPod|IEMobile|Windows Phone/i.test(userAgent||''))failure('Use your mobile phone for manual attendance.','GEO_MOBILE_ONLY');
 for(const k of ['latitude','longitude','accuracy','timestamp'])if(typeof l[k]!=='number'||!Number.isFinite(l[k]))failure('A fresh precise location fix is required.','GEO_FIX_REQUIRED');
 if(Math.abs(l.latitude)>90||Math.abs(l.longitude)>180||l.accuracy<0)failure('Invalid location fix.','GEO_FIX_INVALID');
 const age=now-l.timestamp;
 if(age>p.max_fix_age_seconds*1000||age < -p.max_future_skew_seconds*1000)failure('Location fix is stale or has an invalid timestamp.','GEO_FIX_STALE',{fix_age_seconds:Math.round(age/1000),radius_m:Number(p.radius_m)});
 const dist=distanceMeters(Number(p.center_lat),Number(p.center_lng),l.latitude,l.longitude);
 if(!Number.isFinite(dist)||dist+l.accuracy>Number(p.radius_m))failure('Location is outside the allowed branch area or accuracy is insufficient. Retry with a clearer GPS signal.','GEO_OUTSIDE_AREA',{distance_m:Math.round(dist),accuracy_m:Math.round(l.accuracy),radius_m:Number(p.radius_m),fix_age_seconds:Math.round(age/1000)});
 return {distance_m:dist,accuracy_m:l.accuracy,fix_timestamp:l.timestamp};
}
async function enforce(db,req){
 if(req.locationTransaction)await db.query("SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",['attendance-policy',String(req.user.tenant_id).toLowerCase()+':'+String(req.branchId).toLowerCase()]);
 const r=await db.query('SELECT * FROM hr_branch_attendance_policy WHERE branch_id::text=$1::text AND tenant_id::text=$2::text',[req.branchId,req.user.tenant_id]);
 // Staged rollout: no policy or disabled policy preserves existing attendance until explicit admin activation.
 if(!r.rows[0]?.enforcement_enabled)return null;
 return validate(r.rows[0],req.body?.location,req.headers['user-agent']);
}
module.exports={distanceMeters,validate,enforce};
