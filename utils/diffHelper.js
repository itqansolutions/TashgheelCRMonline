/**
 * Generates a structured diff between two objects
 * @param {Object} oldData The original state
 * @param {Object} newData The new state
 * @param {Array} excludeFields Fields to ignore (e.g., updated_at, id)
 * @returns {Object|null} { before: {}, after: {} } or null if no changes
 */
exports.generateDiff = (oldData, newData, excludeFields = ['updated_at', 'created_at', 'id']) => {
  const before = {};
  const after = {};
  let hasChanges = false;

  // We only compare keys that exist in both or are being updated
  for (const key in newData) {
    if (excludeFields.includes(key)) continue;

    const oldValue = oldData[key];
    const newValue = newData[key];

    // Simple comparison for primitives
    if (String(oldValue) !== String(newValue)) {
      before[key] = oldValue === null ? 'None' : oldValue;
      after[key] = newValue === null ? 'None' : newValue;
      hasChanges = true;
    }
  }

  return hasChanges ? { before, after } : null;
};
