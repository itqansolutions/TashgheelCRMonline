// Returns true when both dates are set and date_from is after date_to (YYYY-MM-DD strings compare lexicographically).
export const isInvalidDateRange = (dateFrom, dateTo) =>
  Boolean(dateFrom && dateTo && dateFrom > dateTo);
