'use strict';
const {createOnboardingWorkflow}=require('./whatsappOnboardingWorkflow');
const {createMetaAssetVerifier}=require('./metaAssetVerifier');
// No DDL, provider request or credential retrieval occurs at module load.
// New path requires separate flag AND existing coexistence flag. Neither is set
// by this candidate. Reviewed migration and verified legacy policy are required.
function createRuntime({db,axios,env}) {
 const {exchangeEmbeddedSignupCode,subscribeWabaWebhooks}=require('./whatsappCoexistenceService');
 const pair=async({appId,configId})=>{
  if(appId!==env.META_APP_ID || configId!==env.META_EMBEDDED_SIGNUP_CONFIG_ID || !env.META_APP_SECRET)throw Error('APP_CONFIG_NOT_AUTHORIZED');
  return {appId,configId,appSecret:env.META_APP_SECRET,inspectorToken:appId+'|'+env.META_APP_SECRET};
 };
 return createOnboardingWorkflow({pool:db.pool,loadAppPair:pair,
  exchange:async args=>(await exchangeEmbeddedSignupCode(args)).accessToken,
  verify:createMetaAssetVerifier({get:(...args)=>axios.get(...args)}),
  subscribe:subscribeWabaWebhooks});
}
module.exports={createRuntime};
