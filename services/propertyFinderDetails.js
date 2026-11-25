'use strict';
/** Extract unit detail fields from a Property Finder listing payload. Pure function. */
const text = (v) => { const s = typeof v === 'string' ? v.trim() : ''; return s || null; };

function mapListingDetails(listing) {
  const l = listing || {};
  const d = l.description && typeof l.description === 'object' ? l.description : {};
  const rawBath = l.bathrooms === undefined || l.bathrooms === null ? '' : String(l.bathrooms).trim();
  const bathrooms = /^\d{1,3}$/.test(rawBath) ? Number(rawBath) : null;
  const furn = typeof l.furnishingType === 'string' ? l.furnishingType.trim().toLowerCase().slice(0, 32) : '';
  return { description_ar: text(d.ar), description_en: text(d.en), bathrooms, furnishing: furn || null };
}

/** SQL that fills only NULL columns, so existing/staff-edited values are never overwritten. */
const FILL_SQL = `UPDATE re_units SET
    description_ar = COALESCE(description_ar, $1),
    description_en = COALESCE(description_en, $2),
    bathrooms = COALESCE(bathrooms, $3),
    furnishing = COALESCE(furnishing, $4)
  WHERE id::text = $5::text AND tenant_id::text = $6::text`;

module.exports = { mapListingDetails, FILL_SQL };
