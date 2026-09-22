/**
 * WhatsApp ChatBot Runner & Scenario Engine
 * Zero-LLM, state-driven execution with versioned scenario nodes,
 * CRM auto-registration/updates, and least-loaded agent handoff.
 */

const db = require('../config/db');
const {
  sendDirectTextMessage,
  callWhatsAppApi,
  normalisePhone,
  getWhatsAppSettings
} = require('./whatsappService');

// ---------------------------------------------------------------------------
// 1. Automated Greeting Sequence Trigger
// ---------------------------------------------------------------------------
/**
 * Triggers automated greeting template if configured and matching triggerType.
 * @param {object} params
 * @param {string} params.tenantId
 * @param {number|null} params.accountId
 * @param {number|null} params.customerId
 * @param {string} params.phone
 * @param {string} params.name
 * @param {string} params.triggerType  'meta_lead' | 'manual_customer' | 'first_inbound'
 */
async function triggerGreetingIfConfigured({
  tenantId,
  accountId = null,
  customerId = null,
  phone,
  name,
  triggerType = 'meta_lead'
}) {
  try {
    const sRes = await db.query(`
      SELECT 
        phone_number_id,
        access_token,
        default_country_code,
        auto_greeting_enabled,
        auto_greeting_triggers,
        auto_greeting_template,
        auto_greeting_language
      FROM whatsapp_settings
      WHERE tenant_id::text = $1::text AND is_active = TRUE
      LIMIT 1
    `, [tenantId]);

    if (sRes.rows.length === 0) return { sent: false, reason: 'settings_inactive' };
    const settings = sRes.rows[0];

    if (!settings.auto_greeting_enabled) {
      return { sent: false, reason: 'greeting_disabled' };
    }

    const triggers = Array.isArray(settings.auto_greeting_triggers) ? settings.auto_greeting_triggers : [];
    if (!triggers.includes(triggerType)) {
      return { sent: false, reason: 'trigger_type_unmatched' };
    }

    const templateName = (settings.auto_greeting_template || '').trim();
    if (!templateName) {
      return { sent: false, reason: 'no_template_configured' };
    }

    const normPhone = normalisePhone(phone, settings.default_country_code || '20');
    if (!normPhone) {
      return { sent: false, reason: 'invalid_phone' };
    }

    const recipientName = (name || '').trim() || normPhone;
    const lang = (settings.auto_greeting_language || 'ar').trim();

    // Call WhatsApp Cloud API with greeting template
    const sendResult = await callWhatsAppApi({
      phoneNumberId: settings.phone_number_id,
      accessToken: settings.access_token,
      toPhone: normPhone,
      templateName,
      languageCode: lang,
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: recipientName }]
        }
      ],
      tenantId
    });

    if (!sendResult.success) {
      console.warn(`[Greeting Trigger] Failed to send greeting to ${normPhone}:`, sendResult.error);
      return { sent: false, error: sendResult.error };
    }

    // Mirror greeting message in conversation & chat
    const msgText = `[Greeting: ${templateName}]`;
    const phoneVariants = Array.from(new Set([
      normPhone,
      phone,
      `+${phone}`,
      phone ? String(phone).replace(/^\+/, '') : null,
      normPhone.replace(/^\+/, ''),
      normPhone.startsWith('+20') ? `0${normPhone.slice(3)}` : null
    ].filter(Boolean)));

    let convId = null;
    const existingConv = await db.query(`
      SELECT id FROM whatsapp_conversations
      WHERE tenant_id::text = $1::text AND phone_number = ANY($2::text[])
      ORDER BY last_message_at DESC NULLS LAST LIMIT 1
    `, [tenantId, phoneVariants]);

    if (existingConv.rows.length > 0) {
      convId = existingConv.rows[0].id;
      await db.query(`
        UPDATE whatsapp_conversations
        SET last_message_body = $1,
            last_message_at = NOW(),
            last_message_direction = 'outbound',
            account_id = COALESCE(account_id, $2),
            customer_id = COALESCE(customer_id, $3),
            contact_name = COALESCE(contact_name, $4),
            updated_at = NOW()
        WHERE id = $5
      `, [msgText, accountId, customerId, recipientName, convId]);
    } else {
      const newConv = await db.query(`
        INSERT INTO whatsapp_conversations (
          tenant_id, account_id, phone_number, contact_name, customer_id,
          last_message_body, last_message_at, last_message_direction,
          unread_count, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'outbound', 0, NOW(), NOW())
        RETURNING id
      `, [tenantId, accountId, normPhone, recipientName, customerId, msgText]);
      convId = newConv.rows[0]?.id;
    }

    if (convId) {
      await db.query(`
        INSERT INTO whatsapp_messages (
          conversation_id, tenant_id, account_id, meta_message_id,
          direction, sender_type, message_type, body, template_name, status, created_at
        )
        VALUES ($1, $2, $3, $4, 'outbound', 'system', 'template', $5, $6, 'sent', NOW())
        ON CONFLICT (meta_message_id) DO NOTHING
      `, [convId, tenantId, accountId, sendResult.messageId || null, msgText, templateName]);
    }

    console.log(`✅ [Greeting Trigger] Auto-greeting [${templateName}] sent to ${normPhone} for trigger ${triggerType}`);
    return { sent: true, messageId: sendResult.messageId, conversationId: convId };
  } catch (err) {
    console.error('[triggerGreetingIfConfigured error]:', err.message);
    return { sent: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// 2. Least-Loaded Agent Availability Resolver (Department / Role Based)
// ---------------------------------------------------------------------------
async function resolveLeastLoadedAgent({ tenantId, targetRoleKey = 'sales' }) {
  try {
    const rolePattern = (targetRoleKey || 'sales').toLowerCase().trim();
    const queryRole = (rolePattern === 'all' || rolePattern === '*' || !rolePattern) ? null : rolePattern;

    const res = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.department_id, d.name AS department_name,
             COUNT(c.id) AS active_chats
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.id
      LEFT JOIN whatsapp_conversations c 
        ON c.assigned_user_id = u.id 
        AND c.bot_status IN ('active', 'waiting_agent', 'handed_off')
        AND (c.is_archived IS NOT TRUE)
      WHERE u.tenant_id::text = $1::text 
        AND (
          $2::text IS NULL 
          OR (u.department_id::text = $2::text)
          OR LOWER(COALESCE(d.name, '')) = LOWER($2)
          OR LOWER(COALESCE(d.name, '')) LIKE '%' || LOWER($2) || '%'
          OR LOWER(COALESCE(u.role, '')) = LOWER($2)
          OR LOWER(COALESCE(u.role, '')) LIKE '%' || LOWER($2) || '%'
        )
        AND (u.is_active IS NOT FALSE)
      GROUP BY u.id, u.name, u.email, u.role, u.department_id, d.name
      ORDER BY active_chats ASC, u.id ASC
      LIMIT 1
    `, [tenantId, queryRole]);

    if (res.rows.length > 0) {
      return res.rows[0];
    }

    // Fallback: any active user in tenant
    const fallbackRes = await db.query(`
      SELECT u.id, u.name, u.email, u.role, COUNT(c.id) AS active_chats
      FROM users u
      LEFT JOIN whatsapp_conversations c ON c.assigned_user_id = u.id AND (c.is_archived IS NOT TRUE)
      WHERE u.tenant_id::text = $1::text AND (u.is_active IS NOT FALSE)
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY active_chats ASC, u.id ASC
      LIMIT 1
    `, [tenantId]);

    return fallbackRes.rows[0] || null;
  } catch (err) {
    console.error('[resolveLeastLoadedAgent error]:', err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. Human Takeover Action
// ---------------------------------------------------------------------------
async function takeOverConversation({ tenantId, conversationId, userId }) {
  try {
    // 1. Mark session as handed off
    await db.query(`
      UPDATE whatsapp_bot_sessions
      SET status = 'handed_off',
          last_interaction_at = NOW()
      WHERE conversation_id::text = $1::text AND tenant_id::text = $2::text AND status IN ('active', 'waiting_agent')
    `, [conversationId, tenantId]);

    // 2. Mark conversation as handed off to human
    const convRes = await db.query(`
      UPDATE whatsapp_conversations
      SET bot_status = 'handed_off',
          assigned_user_id = $1,
          updated_at = NOW()
      WHERE id::text = $2::text AND tenant_id::text = $3::text
      RETURNING *
    `, [userId, conversationId, tenantId]);

    return { success: true, conversation: convRes.rows[0] };
  } catch (err) {
    console.error('[takeOverConversation error]:', err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 4. CRM Customer Synchronization Helper (Maps to Customer Insert Sections)
// ---------------------------------------------------------------------------
async function syncCustomerWithBotData({ tenantId, phone, collectedData = {}, customerName = null }) {
  try {
    const rawDigits = String(phone || '').replace(/\D/g, '');
    const normPhone = normalisePhone(phone) || `+${rawDigits}`;

    const phoneVariants = Array.from(new Set([
      normPhone,
      `+${rawDigits}`,
      rawDigits,
      rawDigits.startsWith('20') ? `0${rawDigits.slice(2)}` : null,
      normPhone.replace(/^\+/, ''),
      normPhone.startsWith('+20') ? `0${normPhone.slice(3)}` : null
    ].filter(Boolean)));

    const cFind = await db.query(`
      SELECT id, name, email, company_name, address, preferred_location, budget_min, budget_max, preferred_rooms, notes
      FROM customers
      WHERE tenant_id::text = $1::text AND phone = ANY($2::text[])
      LIMIT 1
    `, [tenantId, phoneVariants]);

    // Extract all fields based on the Customer Insert Form sections
    const extractedName = (collectedData.name || collectedData.customer_name || customerName || '').trim();
    const extractedEmail = (collectedData.email || '').trim();
    const extractedCompany = (collectedData.company_name || collectedData.company || '').trim();
    const extractedAddress = (collectedData.address || '').trim();
    const extractedLocation = (collectedData.preferred_location || collectedData.location || '').trim();
    const extractedEntityType = (collectedData.entity_type || 'customer').trim();
    const extractedStatus = (collectedData.status || 'lead').trim();
    const extractedSource = (collectedData.source || 'whatsapp_bot').trim();
    const extractedClassification = (collectedData.classification_name || '').trim();

    const cleanBudgetMin = parseFloat(collectedData.budget_min) || (parseFloat(collectedData.budget) || 0);
    const cleanBudgetMax = parseFloat(collectedData.budget_max) || 0;
    const cleanRooms = parseInt(collectedData.preferred_rooms, 10) || (parseInt(collectedData.rooms, 10) || 0);
    const cleanAreaMin = parseFloat(collectedData.preferred_area_min) || 0;
    const cleanAreaMax = parseFloat(collectedData.preferred_area_max) || 0;

    const collectedNotesSummary = Object.entries(collectedData)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ');

    if (cFind.rows.length > 0) {
      // Customer already exists -> update fields and append to notes
      const existing = cFind.rows[0];
      const newNotes = existing.notes 
        ? `${existing.notes}\n[WhatsApp Bot]: ${collectedNotesSummary}`
        : `[WhatsApp Bot]: ${collectedNotesSummary}`;

      const updateRes = await db.query(`
        UPDATE customers
        SET name = COALESCE(NULLIF($1, ''), name),
            email = COALESCE(NULLIF($2, ''), email),
            company_name = COALESCE(NULLIF($3, ''), company_name),
            address = COALESCE(NULLIF($4, ''), address),
            preferred_location = COALESCE(NULLIF($5, ''), preferred_location),
            budget_min = CASE WHEN $6 > 0 THEN $6 ELSE budget_min END,
            budget_max = CASE WHEN $7 > 0 THEN $7 ELSE budget_max END,
            preferred_rooms = CASE WHEN $8 > 0 THEN $8 ELSE preferred_rooms END,
            notes = $9,
            updated_at = NOW()
        WHERE id = $10
        RETURNING id, name
      `, [
        extractedName,
        extractedEmail,
        extractedCompany,
        extractedAddress,
        extractedLocation,
        cleanBudgetMin,
        cleanBudgetMax,
        cleanRooms,
        newNotes,
        existing.id
      ]);

      return { customerId: existing.id, customerName: updateRes.rows[0]?.name || existing.name, created: false };
    } else {
      // Customer does not exist -> Auto-create new customer in CRM!
      const finalName = extractedName || `WhatsApp Lead (${normPhone})`;
      const initialNotes = `[Auto-created via WhatsApp Bot]\n${collectedNotesSummary}`;

      const insertRes = await db.query(`
        INSERT INTO customers (
          tenant_id, name, phone, email, company_name, address, preferred_location,
          budget_min, budget_max, preferred_rooms, preferred_area_min, preferred_area_max,
          notes, source, status, entity_type, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW())
        RETURNING id, name
      `, [
        tenantId,
        finalName,
        normPhone,
        extractedEmail || null,
        extractedCompany || null,
        extractedAddress || null,
        extractedLocation || null,
        cleanBudgetMin,
        cleanBudgetMax,
        cleanRooms,
        cleanAreaMin,
        cleanAreaMax,
        initialNotes,
        extractedSource,
        extractedStatus,
        extractedEntityType
      ]);

      console.log(`👤 [WhatsApp Bot] Auto-registered new customer "${finalName}" (${normPhone}) in CRM!`);
      return { customerId: insertRes.rows[0].id, customerName: finalName, created: true };
    }
  } catch (err) {
    console.error('[syncCustomerWithBotData error]:', err.message);
    return { customerId: null, customerName: null, created: false };
  }
}

// ---------------------------------------------------------------------------
// 5. Inbound Bot Interaction Execution Engine
// ---------------------------------------------------------------------------
/**
 * Evaluates inbound message against active bot sessions or keyword triggers,
 * executes scenario nodes, synchronizes CRM, and sends next reply.
 */
async function handleInboundBotInteraction({
  tenantId,
  accountId = null,
  conversationId,
  fromPhone,
  messageText = '',
  contactProfileName = null
}) {
  try {
    const text = (messageText || '').trim();
    if (!text) return { handled: false, reason: 'empty_text' };

    // 1. Check if conversation has human takeover state
    const convCheck = await db.query(`
      SELECT id, bot_status, bot_id, bot_session_id, customer_id, contact_name
      FROM whatsapp_conversations
      WHERE id::text = $1::text
      LIMIT 1
    `, [conversationId]);

    const conv = convCheck.rows[0];
    if (conv && conv.bot_status === 'handed_off') {
      return { handled: false, reason: 'human_takeover_active' };
    }

    // 2. Resolve credentials for dispatching replies
    const settings = await getWhatsAppSettings(tenantId);
    if (!settings || !settings.phone_number_id || !settings.access_token) {
      return { handled: false, reason: 'credentials_missing' };
    }
    const { phone_number_id, access_token } = settings;

    // 3. Check for active bot session for this phone number
    const sessionRes = await db.query(`
      SELECT s.*, b.name AS bot_name, b.scenario_nodes, b.version AS current_bot_version, b.target_role_key
      FROM whatsapp_bot_sessions s
      JOIN whatsapp_chatbots b ON s.bot_id = b.id
      WHERE s.tenant_id::text = $1::text 
        AND s.phone_number = $2
        AND ($3::int IS NULL OR s.account_id = $3::int OR s.account_id IS NULL)
        AND s.status = 'active'
      ORDER BY s.last_interaction_at DESC
      LIMIT 1
    `, [tenantId, fromPhone, accountId]);

    let session = sessionRes.rows[0] || null;
    let bot = null;
    let isNewSession = false;

    // 4. If no active session, check for matching trigger
    if (!session) {
      // Find active bot matching trigger
      const botsRes = await db.query(`
        SELECT * FROM whatsapp_chatbots
        WHERE tenant_id::text = $1::text 
          AND is_active = TRUE
          AND ($2::int IS NULL OR account_id = $2::int OR account_id IS NULL)
        ORDER BY (account_id IS NOT NULL) DESC, id ASC
      `, [tenantId, accountId]);

      const availableBots = botsRes.rows;
      if (availableBots.length === 0) {
        return { handled: false, reason: 'no_active_bots' };
      }

      // Check keyword match or default trigger
      for (const candidate of availableBots) {
        const keywords = Array.isArray(candidate.trigger_keywords) ? candidate.trigger_keywords : [];
        const isMatch = candidate.trigger_type === 'all_inbound' ||
          keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase().trim()));

        if (isMatch) {
          bot = candidate;
          break;
        }
      }

      if (!bot) {
        return { handled: false, reason: 'no_trigger_matched' };
      }

      // Parse initial root node
      const nodes = Array.isArray(bot.scenario_nodes) ? bot.scenario_nodes : [];
      if (nodes.length === 0) {
        return { handled: false, reason: 'bot_nodes_empty' };
      }

      const rootNode = nodes[0];

      // Create new session
      const createSessionRes = await db.query(`
        INSERT INTO whatsapp_bot_sessions (
          tenant_id, account_id, bot_id, bot_version, conversation_id,
          phone_number, current_node_id, collected_data, status, last_interaction_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb, 'active', NOW())
        RETURNING *
      `, [
        tenantId,
        accountId,
        bot.id,
        bot.version || 1,
        conversationId,
        fromPhone,
        rootNode.id
      ]);

      session = createSessionRes.rows[0];
      session.scenario_nodes = bot.scenario_nodes;
      session.target_role_key = bot.target_role_key;
      session.bot_name = bot.name;
      isNewSession = true;

      // Update conversation state
      await db.query(`
        UPDATE whatsapp_conversations
        SET bot_id = $1,
            bot_session_id = $2,
            bot_status = 'active',
            updated_at = NOW()
        WHERE id::text = $3::text
      `, [bot.id, session.id, conversationId]);

      // Send the first prompt of the root node
      const promptText = rootNode.message || rootNode.text || `Welcome! How can we help you?`;
      await sendBotReply({
        phoneNumberId: phone_number_id,
        accessToken: access_token,
        toPhone: fromPhone,
        text: promptText,
        options: rootNode.options || [],
        conversationId,
        tenantId,
        accountId
      });

      return {
        handled: true,
        action: 'session_started',
        botName: bot.name,
        nodeId: rootNode.id
      };
    }

    // -----------------------------------------------------------------------
    // Processing an In-Flight Session Node
    // -----------------------------------------------------------------------
    const nodes = Array.isArray(session.scenario_nodes) ? session.scenario_nodes : [];
    const currentNode = nodes.find(n => String(n.id) === String(session.current_node_id));

    if (!currentNode) {
      // Stale node from older version -> complete session
      await db.query(`
        UPDATE whatsapp_bot_sessions SET status = 'completed' WHERE id = $1
      `, [session.id]);
      await db.query(`
        UPDATE whatsapp_conversations SET bot_status = 'completed' WHERE id::text = $1::text
      `, [conversationId]);
      return { handled: false, reason: 'node_not_found_completed' };
    }

    // 1. Capture customer answer
    let capturedField = currentNode.save_to_field || currentNode.field || null;
    let collectedData = session.collected_data || {};
    let matchedOption = null;

    if (Array.isArray(currentNode.options) && currentNode.options.length > 0) {
      // Find option by index (1, 2, 3) or label text
      matchedOption = currentNode.options.find((opt, idx) => {
        const optionNumber = String(idx + 1);
        const optText = String(opt.text || opt.label || '').toLowerCase().trim();
        const inputLower = text.toLowerCase();
        return text === optionNumber || inputLower === optText || inputLower.includes(optText);
      });

      if (matchedOption) {
        if (capturedField) {
          collectedData[capturedField] = matchedOption.value || matchedOption.text || matchedOption.label;
        }
      } else {
        // Did not match an option -> politely prompt again
        const retryPrompt = `يرجى اختيار أحد الأرقام المتاحة:\n` +
          currentNode.options.map((o, idx) => `${idx + 1}. ${o.text || o.label}`).join('\n');
        
        await sendBotReply({
          phoneNumberId: phone_number_id,
          accessToken: access_token,
          toPhone: fromPhone,
          text: retryPrompt,
          options: currentNode.options,
          conversationId,
          tenantId,
          accountId
        });

        return { handled: true, action: 'reprompt_options' };
      }
    } else {
      // Free-form input capture (name, interest, notes, budget)
      if (capturedField) {
        collectedData[capturedField] = text;
      }
    }

    // 2. Synchronize collected data into CRM customers table
    const syncRes = await syncCustomerWithBotData({
      tenantId,
      phone: fromPhone,
      collectedData,
      customerName: contactProfileName
    });

    if (syncRes.customerId) {
      await db.query(`
        UPDATE whatsapp_conversations
        SET customer_id = $1,
            contact_name = COALESCE(contact_name, $2)
        WHERE id::text = $3::text
      `, [syncRes.customerId, syncRes.customerName, conversationId]);
    }

    // 3. Determine next node or action
    let nextNodeId = matchedOption?.next_node_id || currentNode.next_node_id || null;
    const isHandoff = currentNode.action === 'handoff' || matchedOption?.action === 'handoff' || !nextNodeId;

    if (isHandoff) {
      // Execute Least-Loaded Agent Handoff
      const targetRole = currentNode.target_role_key || session.target_role_key || 'sales';
      const assignedAgent = await resolveLeastLoadedAgent({ tenantId, targetRoleKey: targetRole });

      if (assignedAgent) {
        await db.query(`
          UPDATE whatsapp_bot_sessions
          SET status = 'handed_off',
              collected_data = $1,
              last_interaction_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(collectedData), session.id]);

        await db.query(`
          UPDATE whatsapp_conversations
          SET bot_status = 'handed_off',
              assigned_user_id = $1,
              updated_at = NOW()
        WHERE id::text = $2::text
        `, [assignedAgent.id, conversationId]);

        const handoffMessage = currentNode.handoff_message || 
          `شكراً لك! تم تحويل محادثتك لأحد ممثلي خدمة العملاء وسيقوم بالرد عليك في أقرب وقت.`;

        await sendBotReply({
          phoneNumberId: phone_number_id,
          accessToken: access_token,
          toPhone: fromPhone,
          text: handoffMessage,
          conversationId,
          tenantId,
          accountId
        });

        console.log(`🤝 [WhatsApp Bot] Handed off conversation ${conversationId} to agent ${assignedAgent.name} (Role: ${targetRole})`);
        return { handled: true, action: 'handed_off', agentId: assignedAgent.id, agentName: assignedAgent.name };
      } else {
        // No agent online -> place in waiting queue
        await db.query(`
          UPDATE whatsapp_bot_sessions
          SET status = 'waiting_agent',
              collected_data = $1,
              last_interaction_at = NOW()
          WHERE id = $2
        `, [JSON.stringify(collectedData), session.id]);

        await db.query(`
          UPDATE whatsapp_conversations
          SET bot_status = 'waiting_agent',
              assigned_user_id = NULL,
              updated_at = NOW()
        WHERE id::text = $1::text
        `, [conversationId]);

        const waitMessage = currentNode.waiting_message ||
          `تم استلام طلبك وبانتظار تواصل أحد مسؤولي المبيعات معك قريباً.`;

        await sendBotReply({
          phoneNumberId: phone_number_id,
          accessToken: access_token,
          toPhone: fromPhone,
          text: waitMessage,
          conversationId,
          tenantId,
          accountId
        });

        return { handled: true, action: 'waiting_agent' };
      }
    }

    // Advance to next node
    const nextNode = nodes.find(n => String(n.id) === String(nextNodeId));
    if (nextNode) {
      await db.query(`
        UPDATE whatsapp_bot_sessions
        SET current_node_id = $1,
            collected_data = $2,
            last_interaction_at = NOW()
        WHERE id = $3
      `, [nextNode.id, JSON.stringify(collectedData), session.id]);

      const nextPrompt = nextNode.message || nextNode.text || '';
      await sendBotReply({
        phoneNumberId: phone_number_id,
        accessToken: access_token,
        toPhone: fromPhone,
        text: nextPrompt,
        options: nextNode.options || [],
        conversationId,
        tenantId,
        accountId
      });

      return { handled: true, action: 'advanced_node', nextNodeId: nextNode.id };
    } else {
      // Completed scenario
      await db.query(`
        UPDATE whatsapp_bot_sessions
        SET status = 'completed',
            collected_data = $1,
            last_interaction_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(collectedData), session.id]);

      await db.query(`
        UPDATE whatsapp_conversations
        SET bot_status = 'completed',
            updated_at = NOW()
        WHERE id::text = $1::text
      `, [conversationId]);

      const completionMessage = currentNode.completion_message || `شكراً لتواصلك معنا!`;
      await sendBotReply({
        phoneNumberId: phone_number_id,
        accessToken: access_token,
        toPhone: fromPhone,
        text: completionMessage,
        conversationId,
        tenantId,
        accountId
      });

      return { handled: true, action: 'completed' };
    }

  } catch (err) {
    console.error('[handleInboundBotInteraction Error]:', err.message);
    return { handled: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Helper: Send Outbound Bot Message & Mirror into Chat
// ---------------------------------------------------------------------------
async function sendBotReply({
  phoneNumberId,
  accessToken,
  toPhone,
  text,
  options = [],
  conversationId,
  tenantId,
  accountId = null
}) {
  try {
    let formattedText = text;
    if (Array.isArray(options) && options.length > 0) {
      const optionLines = options.map((opt, idx) => `${idx + 1}. ${opt.text || opt.label}`).join('\n');
      formattedText = `${text}\n\n${optionLines}`;
    }

    const sendRes = await sendDirectTextMessage({
      phoneNumberId,
      accessToken,
      toPhone,
      text: formattedText
    });

    if (sendRes.success) {
      const messageId = sendRes.messageId || null;

      // Insert message into chat thread
      await db.query(`
        INSERT INTO whatsapp_messages (
          conversation_id, tenant_id, account_id, meta_message_id,
          direction, sender_type, message_type, body, status, created_at
        )
        VALUES ($1, $2, $3, $4, 'outbound', 'system', 'text', $5, 'sent', NOW())
        ON CONFLICT (meta_message_id) DO NOTHING
      `, [conversationId, tenantId, accountId, messageId, formattedText]);

      // Update conversation summary
      await db.query(`
        UPDATE whatsapp_conversations
        SET last_message_body = $1,
            last_message_at = NOW(),
            last_message_direction = 'outbound',
            updated_at = NOW()
        WHERE id::text = $2::text
      `, [formattedText, conversationId]);

      return true;
    } else {
      console.warn(`[sendBotReply] WhatsApp send error:`, sendRes.error);
      return false;
    }
  } catch (err) {
    console.error('[sendBotReply error]:', err.message);
    return false;
  }
}

module.exports = {
  triggerGreetingIfConfigured,
  handleInboundBotInteraction,
  resolveLeastLoadedAgent,
  takeOverConversation,
  syncCustomerWithBotData
};
