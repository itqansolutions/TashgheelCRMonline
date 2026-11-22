/**
 * Utility functions for resolving file and image URLs consistently across environments.
 */

/**
 * Resolves an attachment or image path to a full accessible URL.
 * Handles:
 * - Blob URLs and data URLs (local preview)
 * - Absolute URLs (https://...)
 * - Relative paths with or without 'uploads/' prefix
 * - Redundant duplicate 'uploads/uploads/' prefixes
 * - Backend API origin derivation from VITE_API_URL when configured
 * 
 * @param {string} filePath - Stored file path or filename
 * @returns {string} - Properly formatted URL
 */
export const getFileUrl = (filePath) => {
  if (!filePath || typeof filePath !== 'string') return '';

  const trimmed = filePath.trim();
  if (
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }

  // Normalize backslashes to forward slashes and strip leading slashes
  let cleanPath = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');

  // Strip duplicate 'uploads/' prefixes if any exist
  while (cleanPath.toLowerCase().startsWith('uploads/uploads/')) {
    cleanPath = cleanPath.slice(8);
  }

  // Ensure path starts with 'uploads/'
  if (!cleanPath.toLowerCase().startsWith('uploads/')) {
    cleanPath = `uploads/${cleanPath}`;
  }

  // Determine host prefix if VITE_API_URL is an absolute URL
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl && typeof apiUrl === 'string' && (apiUrl.startsWith('http://') || apiUrl.startsWith('https://'))) {
    try {
      const parsed = new URL(apiUrl);
      return `${parsed.origin}/${cleanPath}`;
    } catch {
      // Fallback to relative URL
    }
  }

  return `/${cleanPath}`;
};
