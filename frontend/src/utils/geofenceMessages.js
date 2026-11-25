// Arabic text for attendance-location server errors. Keyed by the server error code,
// with an English-message fallback for older responses that carry no code.
const AR_BY_CODE = {
  GEO_MOBILE_ONLY: 'سجّل حضورك وانصرافك من موبايلك.',
  GEO_FIX_REQUIRED: 'لازم تفتح الموقع (GPS) عشان نحدد مكانك بدقة.',
  GEO_FIX_STALE: 'تحديد موقعك قديم أو ساعة جهازك مظبوطة غلط. اضبط الساعة وجرّب تاني.',
  GEO_OUTSIDE_AREA: 'إنت برّه نطاق الفرع المسموح أو دقة الـGPS ضعيفة. قرّب من الفرع أو استنى إشارة أوضح وجرّب تاني.',
  GEO_FIX_INVALID: 'تحديد الموقع مش صالح. جرّب تاني.',
  GEO_NO_AREA: 'تسجيل الحضور محتاج نطاق فرع متحدد. كلّم الأدمن.',
  GEO_POLICY_INVALID: 'إعدادات موقع الفرع مش سليمة. كلّم الأدمن.',
  GEO_POLICY_UNAVAILABLE: 'إعدادات نطاق الحضور مش متاحة دلوقتي. حاول بعد شوية.',
  GEO_SAVE_INVALID: 'لازم تدخل مركز ونطاق وعمر موقع وسماح ساعة صحيحين.',
  GEO_BRANCH_MISMATCH: 'الفرع ده مش تابع لشركتك.',
  GEO_SAVE_FAILED: 'مقدرناش نحفظ نطاق الفرع. جرّب تاني.',
  GEO_LOCATION_DENIED: 'لازم تسمح بالوصول للموقع.'
};
const AR_BY_MESSAGE = {
  'Location access is required.': AR_BY_CODE.GEO_LOCATION_DENIED,
  'Use your mobile phone for manual attendance.': AR_BY_CODE.GEO_MOBILE_ONLY,
  'A fresh precise location fix is required.': AR_BY_CODE.GEO_FIX_REQUIRED,
  'Location fix is stale or has an invalid timestamp.': AR_BY_CODE.GEO_FIX_STALE,
  'Invalid location fix.': AR_BY_CODE.GEO_FIX_INVALID,
  'Manual attendance requires a configured branch area.': AR_BY_CODE.GEO_NO_AREA,
  'Branch location policy is invalid.': AR_BY_CODE.GEO_POLICY_INVALID,
  'Attendance area policy unavailable. No location operation may proceed.': AR_BY_CODE.GEO_POLICY_UNAVAILABLE,
  'Valid center, radius and explicit freshness policy are required.': AR_BY_CODE.GEO_SAVE_INVALID,
  'Branch policy ownership mismatch.': AR_BY_CODE.GEO_BRANCH_MISMATCH,
  'Unable to save attendance area policy.': AR_BY_CODE.GEO_SAVE_FAILED,
  'Location is outside the allowed branch area or accuracy is insufficient. Retry with a clearer GPS signal.': AR_BY_CODE.GEO_OUTSIDE_AREA
};
export function geofenceMessage(err, isRTL, fallback) {
  const code = err?.response?.data?.code;
  const msg = err?.response?.data?.message || err?.message;
  if (isRTL) {
    if (code && AR_BY_CODE[code]) return AR_BY_CODE[code];
    if (msg && AR_BY_MESSAGE[msg]) return AR_BY_MESSAGE[msg];
  }
  return msg || fallback;
}
export const GEOFENCE_DEFAULTS = { radius_m: 150, max_fix_age_seconds: 60, max_future_skew_seconds: 5 };
