import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';

/**
 * useModule Hook
 * Returns whether the current tenant's plan includes a given module.
 *
 * Usage:
 *   const { can, modules, planName, trialDaysLeft } = useModule();
 *   if (!can('hr')) return <UpgradePrompt module="hr" />;
 */
export const useModule = () => {
    const { subscription } = useContext(AuthContext);

    const modules = subscription?.modules || {};
    const planName = subscription?.plan_name || subscription?.plan || 'basic';
    const trialDaysLeft = subscription?.trial_days_left ?? null;
    const isExpired = subscription?.is_expired || false;
    const status = subscription?.status || 'active';

    const can = (moduleName) => {
        if (!moduleName) return true;
        return modules[moduleName] === true;
    };

    return { can, modules, planName, trialDaysLeft, isExpired, status };
};
