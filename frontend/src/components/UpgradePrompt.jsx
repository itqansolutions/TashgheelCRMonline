import React from 'react';
import { Lock, Zap, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MODULE_LABELS = {
    hr:        { icon: '👥', label: 'HR & Attendance', requiredPlan: 'Pro' },
    inventory: { icon: '📦', label: 'Inventory & Warehousing', requiredPlan: 'Pro' },
    automation:{ icon: '⚙️', label: 'Workflow Automation', requiredPlan: 'Enterprise' },
    finance:   { icon: '💰', label: 'Finance & Invoicing', requiredPlan: 'Basic' },
};

/**
 * UpgradePrompt
 * Displayed when a locked module is accessed — SOFT LOCK (visible but locked).
 * Creates upsell urgency without hiding features.
 */
const UpgradePrompt = ({ module }) => {
    const navigate = useNavigate();
    const meta = MODULE_LABELS[module] || { icon: '🔒', label: module, requiredPlan: 'Pro' };

    return (
        <div className="upgrade-prompt-container">
            <style>{`
                .upgrade-prompt-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    min-height: 60vh;
                    padding: 40px;
                    text-align: center;
                }
                .up-card {
                    background: var(--bg-card);
                    border: 1.5px solid rgba(99,102,241,0.3);
                    border-radius: 24px;
                    padding: 56px 48px;
                    max-width: 480px;
                    width: 100%;
                    position: relative;
                    overflow: hidden;
                }
                .up-card::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: radial-gradient(circle at center top, rgba(99,102,241,0.06) 0%, transparent 70%);
                    pointer-events: none;
                }
                .up-icon-wrapper {
                    position: relative;
                    width: 88px;
                    height: 88px;
                    margin: 0 auto 24px;
                }
                .up-module-icon {
                    width: 88px;
                    height: 88px;
                    border-radius: 20px;
                    background: rgba(99,102,241,0.08);
                    border: 1.5px solid rgba(99,102,241,0.2);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 36px;
                }
                .up-lock-badge {
                    position: absolute;
                    bottom: -4px;
                    right: -4px;
                    background: #4f46e5;
                    border-radius: 50%;
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 2px solid var(--bg-card);
                }
                .up-title {
                    font-size: 24px;
                    font-weight: 900;
                    margin: 0 0 8px;
                    color: var(--text-main);
                }
                .up-subtitle {
                    font-size: 15px;
                    color: var(--text-muted);
                    margin: 0 0 32px;
                    line-height: 1.5;
                }
                .up-plan-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: linear-gradient(135deg, #4f46e5, #7c3aed);
                    color: white;
                    padding: 6px 14px;
                    border-radius: 20px;
                    font-size: 13px;
                    font-weight: 700;
                    margin-bottom: 28px;
                }
                .up-btn {
                    background: linear-gradient(135deg, #4f46e5, #6366f1);
                    color: white;
                    border: none;
                    padding: 14px 32px;
                    border-radius: 12px;
                    font-weight: 800;
                    font-size: 16px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.2s;
                    width: 100%;
                    justify-content: center;
                }
                .up-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 12px 30px -5px rgba(79,70,229,0.45);
                }
                .up-footer {
                    margin-top: 16px;
                    font-size: 13px;
                    color: var(--text-muted);
                }
            `}</style>

            <div className="up-card">
                <div className="up-icon-wrapper">
                    <div className="up-module-icon">{meta.icon}</div>
                    <div className="up-lock-badge"><Lock size={13} color="white"/></div>
                </div>

                <h2 className="up-title">{meta.label}</h2>
                <p className="up-subtitle">
                    This module is not included in your current plan.<br/>
                    Upgrade to unlock full access instantly.
                </p>

                <div className="up-plan-badge">
                    <Zap size={13}/> Available on {meta.requiredPlan} & above
                </div>

                <button className="up-btn" onClick={() => navigate('/pricing')}>
                    Upgrade Now <ArrowRight size={18}/>
                </button>

                <div className="up-footer">
                    All plans include a 14-day free trial.
                </div>
            </div>
        </div>
    );
};

export default UpgradePrompt;
