/**
 * Validates an optional date range supplied via query params.
 * Returns null when valid, otherwise a human-readable error message.
 * Never swaps dates: the caller must reject the request (HTTP 400).
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

const validateDateRange = (date_from, date_to) => {
    const check = (v, label) => {
        if (v === undefined || v === null || v === '') return null;
        if (typeof v !== 'string' || !ISO_DATE.test(v) || Number.isNaN(Date.parse(v))) {
            return `Invalid ${label}: expected format YYYY-MM-DD`;
        }
        return null;
    };
    const err = check(date_from, 'date_from') || check(date_to, 'date_to');
    if (err) return err;
    if (date_from && date_to && date_from.slice(0, 10) > date_to.slice(0, 10)) {
        return 'Invalid date range: date_from must not be after date_to';
    }
    return null;
};

module.exports = { validateDateRange };
