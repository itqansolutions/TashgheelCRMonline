'use strict';

// Rollbacks stay available for deliberate operator use. They are never startup work.
function isRollbackMigration(name) {
    return /(?:^|[_.-])rollback(?:[_.-]|$)/i.test(name)
        || /^\d+_down(?:[_.-]|$)/i.test(name)
        || /[_.-]down\.sql$/i.test(name);
}

function isForwardMigration(name) {
    return /^\d+_[A-Za-z0-9][A-Za-z0-9_.-]*\.sql$/i.test(name)
        && !isRollbackMigration(name);
}

module.exports = { isForwardMigration, isRollbackMigration };
