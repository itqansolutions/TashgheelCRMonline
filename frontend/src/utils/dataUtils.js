/**
 * Resilient Data Utilities
 * Prevents 'TypeError: Cannot read properties of undefined' by enforcing type safety.
 */

export const safeArray = (data) => {
    return Array.isArray(data) ? data : [];
};

export const safeObject = (data) => {
    return (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
};

export const safeString = (data, fallback = '') => {
    return typeof data === 'string' ? data : fallback;
};

export const safeNumber = (data, fallback = 0) => {
    const num = Number(data);
    return !isNaN(num) ? num : fallback;
};
