export const isValidCustomerEmail = value => value == null || value === '' || (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
