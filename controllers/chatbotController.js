/**
 * WhatsApp ChatBot Controller
 * CRUD operations for scenario bots, takeover management, and browser simulation.
 */

const db = require('../config/db');
const { takeOverConversation } = require('../services/chatbotRunnerService');

// @desc    Get all chatbots for tenant
// @route   GET /api/whatsapp/chatbots
exports.getChatbots = async (req, res) => {
  const tenantId = req.user.tenant_id;
  try {
    const result = await db.query(`
      SELECT 
        b.*,
        a.display_phone_number AS account_phone_number,
        a.label AS account_label,
        (SELECT COUNT(*) FROM whatsapp_bot_sessions s WHERE s.bot_id = b.id AND s.status = 'active') AS active_sessions_count,
        (SELECT COUNT(*) FROM whatsapp_bot_sessions s WHERE s.bot_id = b.id) AS total_sessions_count
      FROM whatsapp_chatbots b
      LEFT JOIN whatsapp_accounts a ON b.account_id = a.id
      WHERE b.tenant_id::text = $1::text
      ORDER BY b.created_at DESC
    `, [tenantId]);

    res.json({
      status: 'success',
      data: result.rows
    });
  } catch (err) {
    console.error('[getChatbots Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Create a new ChatBot
// @route   POST /api/whatsapp/chatbots
exports.createChatbot = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const {
    name,
    description = '',
    account_id = null,
    target_role_key = 'sales',
    trigger_type = 'keyword',
    trigger_keywords = [],
    scenario_nodes = []
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ status: 'error', message: 'Chatbot name is required' });
  }

  try {
    const result = await db.query(`
      INSERT INTO whatsapp_chatbots (
        tenant_id, account_id, name, description, target_role_key,
        trigger_type, trigger_keywords, version, is_active, scenario_nodes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 1, TRUE, $8)
      RETURNING *
    `, [
      tenantId,
      account_id ? parseInt(account_id, 10) : null,
      name.trim(),
      description.trim(),
      (target_role_key || 'sales').trim(),
      trigger_type || 'keyword',
      Array.isArray(trigger_keywords) ? trigger_keywords : [],
      JSON.stringify(scenario_nodes || [])
    ]);

    res.status(201).json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('[createChatbot Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Update an existing ChatBot (Bumps version if scenario nodes change)
// @route   PUT /api/whatsapp/chatbots/:id
exports.updateChatbot = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const botId = req.params.id;
  const {
    name,
    description,
    account_id,
    target_role_key,
    trigger_type,
    trigger_keywords,
    scenario_nodes,
    is_active
  } = req.body;

  try {
    // Check existing bot
    const existingRes = await db.query(`
      SELECT * FROM whatsapp_chatbots WHERE id = $1 AND tenant_id::text = $2::text
    `, [botId, tenantId]);

    if (existingRes.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Chatbot not found' });
    }

    const currentBot = existingRes.rows[0];
    let newVersion = currentBot.version || 1;

    // If scenario nodes changed, bump the version to protect active sessions
    if (scenario_nodes && JSON.stringify(scenario_nodes) !== JSON.stringify(currentBot.scenario_nodes)) {
      newVersion += 1;
      console.log(`🆙 [WhatsApp Bot Versioning] Bot "${currentBot.name}" bumped to version ${newVersion}`);
    }

    const updateRes = await db.query(`
      UPDATE whatsapp_chatbots
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          account_id = $3,
          target_role_key = COALESCE($4, target_role_key),
          trigger_type = COALESCE($5, trigger_type),
          trigger_keywords = COALESCE($6, trigger_keywords),
          scenario_nodes = COALESCE($7, scenario_nodes),
          version = $8,
          is_active = COALESCE($9, is_active),
          updated_at = NOW()
      WHERE id = $10 AND tenant_id::text = $11::text
      RETURNING *
    `, [
      name ? name.trim() : null,
      description !== undefined ? description.trim() : null,
      account_id !== undefined ? (account_id ? parseInt(account_id, 10) : null) : currentBot.account_id,
      target_role_key ? target_role_key.trim() : null,
      trigger_type || null,
      Array.isArray(trigger_keywords) ? trigger_keywords : null,
      scenario_nodes ? JSON.stringify(scenario_nodes) : null,
      newVersion,
      is_active !== undefined ? is_active : currentBot.is_active,
      botId,
      tenantId
    ]);

    res.json({
      status: 'success',
      data: updateRes.rows[0]
    });
  } catch (err) {
    console.error('[updateChatbot Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Toggle ChatBot active state
// @route   PATCH /api/whatsapp/chatbots/:id/toggle
exports.toggleChatbot = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const botId = req.params.id;

  try {
    const result = await db.query(`
      UPDATE whatsapp_chatbots
      SET is_active = NOT is_active, updated_at = NOW()
      WHERE id = $1 AND tenant_id::text = $2::text
      RETURNING id, name, is_active
    `, [botId, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Chatbot not found' });
    }

    res.json({
      status: 'success',
      data: result.rows[0]
    });
  } catch (err) {
    console.error('[toggleChatbot Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Delete a ChatBot
// @route   DELETE /api/whatsapp/chatbots/:id
exports.deleteChatbot = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const botId = req.params.id;

  try {
    const result = await db.query(`
      DELETE FROM whatsapp_chatbots
      WHERE id = $1 AND tenant_id::text = $2::text
      RETURNING id, name
    `, [botId, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Chatbot not found' });
    }

    res.json({
      status: 'success',
      message: 'Chatbot deleted successfully'
    });
  } catch (err) {
    console.error('[deleteChatbot Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Take over conversation from bot (Human Takeover)
// @route   POST /api/whatsapp/conversations/:id/takeover
exports.takeOverChat = async (req, res) => {
  const tenantId = req.user.tenant_id;
  const userId = req.user.id;
  const conversationId = req.params.id;

  try {
    const result = await takeOverConversation({
      tenantId,
      conversationId,
      userId
    });

    res.json({
      status: 'success',
      message: 'Conversation assigned to you. Bot has been paused for this chat.',
      data: result.conversation
    });
  } catch (err) {
    console.error('[takeOverChat Error]', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

// @desc    Simulate bot step (In-browser test simulator)
// @route   POST /api/whatsapp/chatbots/simulate
exports.simulateBotStep = async (req, res) => {
  const { nodes = [], currentNodeId, userInput } = req.body;

  try {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Nodes array is empty' });
    }

    // If no currentNodeId, return the root node prompt
    if (!currentNodeId) {
      const root = nodes[0];
      return res.json({
        status: 'success',
        data: {
          currentNodeId: root.id,
          botReply: root.message || root.text,
          options: root.options || [],
          action: 'prompt'
        }
      });
    }

    const current = nodes.find(n => String(n.id) === String(currentNodeId));
    if (!current) {
      return res.json({
        status: 'success',
        data: { botReply: 'End of simulation.', options: [], action: 'completed' }
      });
    }

    // Match user input
    let nextNodeId = null;
    let matchedOption = null;

    if (Array.isArray(current.options) && current.options.length > 0) {
      const cleanInput = String(userInput || '').toLowerCase().trim();
      matchedOption = current.options.find((opt, idx) => {
        const num = String(idx + 1);
        const text = String(opt.text || opt.label || '').toLowerCase().trim();
        const val = String(opt.value || '').toLowerCase().trim();
        const id = String(opt.id || '').toLowerCase().trim();
        return cleanInput === num ||
               cleanInput === text ||
               cleanInput === val ||
               cleanInput === id ||
               (cleanInput.length >= 3 && text.includes(cleanInput)) ||
               (cleanInput.length >= 3 && cleanInput.includes(text));
      });

      if (!matchedOption) {
        return res.json({
          status: 'success',
          data: {
            currentNodeId: current.id,
            botReply: `Please choose a valid option:\n` + current.options.map((o, i) => `${i + 1}. ${o.text || o.label}`).join('\n'),
            options: current.options,
            action: 'reprompt'
          }
        });
      }
    }

    const targetAction = matchedOption?.action || (matchedOption?.next_node_id ? 'next_step' : current.action) || 'next_step';
    nextNodeId = matchedOption?.next_node_id || (targetAction === 'next_step' ? current.next_node_id : null);
    const isHandoff = targetAction === 'handoff' || (!nextNodeId && current.action === 'handoff');
    const isComplete = targetAction === 'complete' || (!nextNodeId && current.action === 'complete');

    if (isHandoff) {
      return res.json({
        status: 'success',
        data: {
          currentNodeId: null,
          botReply: matchedOption?.handoff_message || current.handoff_message || 'Thank you! Handing you off to a live agent now.',
          options: [],
          action: 'handed_off'
        }
      });
    }

    if (isComplete) {
      return res.json({
        status: 'success',
        data: {
          currentNodeId: null,
          botReply: matchedOption?.completion_message || current.completion_message || 'Thank you! Your information has been recorded.',
          options: [],
          action: 'completed'
        }
      });
    }

    const next = nodes.find(n => String(n.id) === String(nextNodeId));
    if (next) {
      return res.json({
        status: 'success',
        data: {
          currentNodeId: next.id,
          botReply: next.message || next.text,
          options: next.options || [],
          action: 'prompt'
        }
      });
    } else {
      return res.json({
        status: 'success',
        data: {
          currentNodeId: null,
          botReply: current.completion_message || 'Thank you! Your information has been recorded.',
          options: [],
          action: 'completed'
        }
      });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};
