const activityService = require('../../domains/shared/services/activityService');
const notificationDispatcher = require('../../domains/shared/services/notificationDispatcher');
const globalSearchService = require('../../domains/shared/services/globalSearchService');

/**
 * 🧰 DomainSDK (Unified Cross-Domain Developer Facade)
 * High-level internal SDK interface for inter-domain consumption.
 */
class DomainSDK {
    constructor() {
        this.CRM = {
            logActivity: activityService.logActivity.bind(activityService),
            getTimeline: activityService.getEntityTimeline.bind(activityService)
        };

        this.Notifications = {
            dispatch: notificationDispatcher.dispatch.bind(notificationDispatcher)
        };

        this.Search = {
            query: globalSearchService.search.bind(globalSearchService)
        };
    }
}

module.exports = new DomainSDK();
