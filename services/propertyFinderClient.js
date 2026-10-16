const axios = require('axios');
const { decrypt } = require('../utils/encryption');

/**
 * 🏢 Property Finder Enterprise API Client
 * Official MENA / Egypt Real Estate Integration
 * Handles OAuth2 client_credentials token lifecycle, bounded retries,
 * RFC 7807 error parsing, rate limiting, and zero-leakage logging.
 */

// Per the Enterprise API docs excerpt supplied by the product owner:
//   POST https://atlas.propertyfinder.com/v1/auth/token  { apiKey, apiSecret }
// NOTE: the official docs portal returned HTTP 403 to our tooling (partner-gated),
// so this has NOT been independently verified by the engineer; confirm at live smoke test.
const AUTH_URL_PRODUCTION = process.env.PF_AUTH_URL || 'https://atlas.propertyfinder.com/v1/auth/token';
const API_BASE_PRODUCTION = process.env.PF_API_BASE_URL || 'https://atlas.propertyfinder.com/v1';
// Sandbox host is not documented in our excerpt: must be provided via env, else falls back to production host.
const API_BASE_SANDBOX = process.env.PF_SANDBOX_API_BASE_URL || API_BASE_PRODUCTION;

const MAX_PER_PAGE = 50;
const MAX_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000; // createdAtFrom cannot be older than ~3 months

// In-memory token cache: Map<cacheKey, { accessToken, expiresAt }>
const tokenCache = new Map();

class PropertyFinderClient {
  /**
   * @param {Object} config
   * @param {string} config.apiKey - Plaintext or encrypted API key
   * @param {string} config.apiSecret - Plaintext or encrypted API secret
   * @param {string} [config.environment='sandbox'] - 'sandbox' | 'production'
   * @param {string} [config.countryCode='EG'] - ISO country code
   * @param {string} [config.tenantId] - Tashgheel tenant context
   * @param {boolean} [config.mockMode=false] - For local deterministic testing
   */
  constructor({
    apiKey,
    apiSecret,
    environment = 'sandbox',
    countryCode = 'EG',
    tenantId = null,
    mockMode = false
  }) {
    this.apiKey = apiKey ? decrypt(apiKey) : '';
    this.apiSecret = apiSecret ? decrypt(apiSecret) : '';
    this.environment = environment === 'production' ? 'production' : 'sandbox';
    this.countryCode = (countryCode || 'EG').toUpperCase();
    this.tenantId = tenantId;
    this.mockMode = Boolean(mockMode || process.env.MOCK_PROPERTY_FINDER === 'true');

    this.baseUrl = this.environment === 'production' ? API_BASE_PRODUCTION : API_BASE_SANDBOX;
    this.authUrl = AUTH_URL_PRODUCTION;
  }

  /**
   * Generates a cache key for token caching
   */
  _getTokenCacheKey() {
    const keyFingerprint = this.apiKey ? this.apiKey.slice(0, 8) : 'anon';
    return `${this.tenantId || 'global'}:${this.environment}:${keyFingerprint}`;
  }

  /**
   * Authenticates using OAuth2 client_credentials and returns valid Bearer token.
   * Auto-refreshes when expired.
   */
  async getAccessToken(forceRefresh = false) {
    if (this.mockMode) {
      return 'mock_pf_access_token_' + Date.now();
    }

    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Property Finder API Key and Secret are required for authentication.');
    }

    const cacheKey = this._getTokenCacheKey();
    const cached = tokenCache.get(cacheKey);
    const now = Date.now();

    // Re-use token if valid for at least 5 more minutes (300,000 ms)
    if (!forceRefresh && cached && cached.expiresAt > now + 300000) {
      return cached.accessToken;
    }

    try {
      const response = await axios.post(
        this.authUrl,
        { apiKey: this.apiKey, apiSecret: this.apiSecret },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 20000
        }
      );

      const data = response.data || {};
      const accessToken = data.accessToken || data.access_token || data.token;
      const expiresIn = Number(data.expiresIn || data.expires_in) || 1800; // conservative default if not returned

      if (!accessToken) {
        throw new Error('Token response did not contain an access token.');
      }

      tokenCache.set(cacheKey, {
        accessToken,
        expiresAt: now + expiresIn * 1000
      });

      return accessToken;
    } catch (err) {
      this._handleApiError(err, 'OAuth Token Authentication');
    }
  }

  /**
   * Executes HTTP request with automatic token injection, bounded exponential retries,
   * rate-limiting handling (HTTP 429), and RFC 7807 error parsing.
   */
  async request({ method = 'GET', endpoint, data = null, params = null, retries = 3 }) {
    if (this.mockMode) {
      return this._handleMockRequest({ method, endpoint, data, params });
    }

    let attempt = 0;
    while (attempt <= retries) {
      attempt++;
      try {
        const token = await this.getAccessToken(attempt > 1);
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;

        const axiosConfig = {
          method,
          url,
          params,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Country-Code': this.countryCode,
            'User-Agent': 'Tashgheel-CRM/1.0 (ITQAN Solutions; RealEstate Egypt)'
          },
          timeout: 25000
        };
        // IMPORTANT: never pass `data: null` — axios serializes it as the body "null"
        // (Content-Length: 4) even on GET, and CloudFront rejects that with HTTP 403.
        if (data !== null && data !== undefined) {
          axiosConfig.data = data;
        }

        const response = await axios(axiosConfig);

        return response.data;
      } catch (err) {
        // If 401 Unauthorized, invalidate token cache and retry once if within retries
        if (err.response?.status === 401 && attempt <= retries) {
          tokenCache.delete(this._getTokenCacheKey());
          continue;
        }

        // If 429 Too Many Requests, honor Retry-After header
        if (err.response?.status === 429 && attempt <= retries) {
          const retryAfterSec = parseInt(err.response.headers['retry-after'], 10) || Math.pow(2, attempt);
          const waitMs = Math.min(retryAfterSec * 1000, 30000);
          console.warn(`⏳ [Property Finder] Rate limit reached. Waiting ${waitMs}ms before retry ${attempt}/${retries}...`);
          await new Promise(res => setTimeout(res, waitMs));
          continue;
        }

        // Retry transient 5xx server errors
        if (err.response?.status >= 500 && attempt <= retries) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise(res => setTimeout(res, backoffMs));
          continue;
        }

        this._handleApiError(err, `${method} ${endpoint}`);
      }
    }
  }

  /**
   * Tests credentials by requesting an OAuth token and verifying account status.
   */
  async testConnection() {
    if (this.mockMode) {
      return {
        success: true,
        environment: this.environment,
        countryCode: this.countryCode,
        message: 'Mock connection verified successfully.'
      };
    }

    try {
      const token = await this.getAccessToken(true);
      // Attempt reachability check on listings or account profile endpoint
      let accountInfo = null;
      try {
        accountInfo = await this.request({
          method: 'GET',
          endpoint: '/account/profile',
          retries: 0
        });
      } catch (subErr) {
        // If account profile is not implemented or 404, token itself is verified proof of valid credentials
        accountInfo = { status: 'authenticated_via_token' };
      }

      return {
        success: true,
        environment: this.environment,
        countryCode: this.countryCode,
        tokenValid: Boolean(token),
        accountInfo,
        message: 'Property Finder credentials validated successfully.'
      };
    } catch (err) {
      return {
        success: false,
        environment: this.environment,
        countryCode: this.countryCode,
        message: err.message || 'Authentication failed'
      };
    }
  }

  // --------------------------------------------------------------------------
  // LISTINGS API OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Retrieve list of properties from Property Finder with pagination.
   */
  async getListings({ page = 1, perPage = null, limit = MAX_PER_PAGE, status = null, updatedAfter = null } = {}) {
    const cleanPage = Math.max(1, Number(page) || 1);
    const effectivePerPage = Math.min(MAX_PER_PAGE, Math.max(1, Number(perPage ?? limit) || MAX_PER_PAGE));
    const params = {
      page: cleanPage,
      perPage: effectivePerPage,
      limit: effectivePerPage,
      country: this.countryCode
    };
    if (status) params.status = status;
    if (updatedAfter) params.updated_after = updatedAfter;

    return this.request({
      method: 'GET',
      endpoint: '/listings',
      params
    });
  }

  /**
   * Retrieve single listing by Property Finder external ID.
   */
  async getListing(listingId) {
    if (!listingId) throw new Error('Listing ID is required.');
    return this.request({
      method: 'GET',
      endpoint: `/listings/${encodeURIComponent(listingId)}`
    });
  }

  /**
   * Create or publish a new listing to Property Finder.
   */
  async createListing(listingPayload) {
    return this.request({
      method: 'POST',
      endpoint: '/listings',
      data: listingPayload
    });
  }

  /**
   * Update an existing listing on Property Finder.
   */
  async updateListing(listingId, listingPayload) {
    if (!listingId) throw new Error('Listing ID is required.');
    return this.request({
      method: 'PUT',
      endpoint: `/listings/${encodeURIComponent(listingId)}`,
      data: listingPayload
    });
  }

  /**
   * Unpublish or archive a listing on Property Finder.
   */
  async unpublishListing(listingId) {
    if (!listingId) throw new Error('Listing ID is required.');
    return this.request({
      method: 'PUT',
      endpoint: `/listings/${encodeURIComponent(listingId)}/status`,
      data: { status: 'unpublished' }
    });
  }

  // --------------------------------------------------------------------------
  // LEADS API OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Query leads for the account.
   */
  async getLeads({ page = 1, perPage = MAX_PER_PAGE, createdAtFrom = null } = {}) {
    const params = {
      page: Math.max(1, Number(page) || 1),
      perPage: Math.min(MAX_PER_PAGE, Math.max(1, Number(perPage) || MAX_PER_PAGE))
    };
    if (createdAtFrom) {
      // The API rejects createdAtFrom older than 3 months: clamp (with a 1-day safety margin).
      const floor = Date.now() - MAX_LOOKBACK_MS + 24 * 60 * 60 * 1000;
      const requested = new Date(createdAtFrom).getTime();
      params.createdAtFrom = new Date(Number.isFinite(requested) ? Math.max(requested, floor) : floor).toISOString();
    }

    return this.request({
      method: 'GET',
      endpoint: '/leads',
      params
    });
  }

  /**
   * Extract the lead array from a response regardless of envelope naming (unverified schema).
   */
  static extractLeads(response) {
    if (Array.isArray(response)) return response;
    const r = response || {};
    for (const key of ['data', 'results', 'leads', 'items']) {
      if (Array.isArray(r[key])) return r[key];
    }
    return [];
  }

  /**
   * Extract the listings array from a response regardless of envelope naming.
   * Atlas GET /listings returns { results: [ ... ], pagination: { ... } }.
   */
  static extractListings(response) {
    if (Array.isArray(response)) return response;
    const r = response || {};
    for (const key of ['results', 'data', 'listings', 'items']) {
      if (Array.isArray(r[key])) return r[key];
    }
    return [];
  }

  /**
   * Determine whether another page exists (supports several pagination envelope shapes).
   * Ensures null or empty pagination totals never override a valid nextPage indicator
   * or prematurely terminate pagination on a full page.
   */
  static hasNextPage(response, page, leadsOnPage, perPage) {
    const p = response?.pagination || response?.meta || {};

    // 1. Explicit nextPage indicator always takes precedence over missing/null/zero totals
    if (p.nextPage || p.next_page || response?.next) return true;
    if (p.hasNextPage === true || p.has_next_page === true) return true;
    if (p.hasNextPage === false || p.has_next_page === false) return false;

    const rawPerPage = [p.perPage, p.per_page, p.limit, perPage].find(
      v => v !== null && v !== undefined && String(v).trim() !== '' && Number(v) > 0
    );
    const effectivePerPage = rawPerPage !== undefined ? Number(rawPerPage) : 50;

    // 2. Explicit totalPages (ignore null, undefined, or empty string)
    const rawTotalPages = [p.totalPages, p.total_pages, p.lastPage, p.last_page].find(
      v => v !== null && v !== undefined && String(v).trim() !== ''
    );
    if (rawTotalPages !== undefined) {
      const totalPages = Number(rawTotalPages);
      if (Number.isFinite(totalPages) && totalPages > 0) {
        return page < totalPages;
      }
    }

    // 3. Explicit total item count (ignore null, undefined, or empty string so Number(null) !== 0)
    const rawTotalItems = [p.total, p.totalCount, p.total_count].find(
      v => v !== null && v !== undefined && String(v).trim() !== ''
    );
    if (rawTotalItems !== undefined) {
      const totalItems = Number(rawTotalItems);
      if (Number.isFinite(totalItems) && totalItems >= 0) {
        if (totalItems === 0 && leadsOnPage > 0) {
          return leadsOnPage >= effectivePerPage;
        }
        return page * effectivePerPage < totalItems;
      }
    }

    // 4. Fallback: a full page implies there may be another page
    return leadsOnPage >= effectivePerPage;
  }


  /**
   * Retrieve single lead by ID.
   */
  async getLead(leadId) {
    if (!leadId) throw new Error('Lead ID is required.');
    return this.request({
      method: 'GET',
      endpoint: `/leads/${encodeURIComponent(leadId)}`
    });
  }

  // --------------------------------------------------------------------------
  // WEBHOOK SUBSCRIPTIONS API OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Register a webhook subscription URL with Property Finder.
   */
  async registerWebhookSubscription({ callbackUrl, events = ['leads.create', 'listings.status_change'], secret = null }) {
    return this.request({
      method: 'POST',
      endpoint: '/webhooks/subscriptions',
      data: {
        url: callbackUrl,
        events,
        secret,
        country: this.countryCode
      }
    });
  }

  /**
   * List active webhook subscriptions.
   */
  async getWebhookSubscriptions() {
    return this.request({
      method: 'GET',
      endpoint: '/webhooks/subscriptions'
    });
  }

  /**
   * Delete a webhook subscription.
   */
  async deleteWebhookSubscription(subscriptionId) {
    if (!subscriptionId) throw new Error('Subscription ID is required.');
    return this.request({
      method: 'DELETE',
      endpoint: `/webhooks/subscriptions/${encodeURIComponent(subscriptionId)}`
    });
  }

  // --------------------------------------------------------------------------
  // ERROR PARSER & MOCK ENGINE
  // --------------------------------------------------------------------------

  /**
   * Sanitizes objects and strings to prevent API secrets, API keys, or tokens from leaking.
   */
  _sanitizeForLogging(data) {
    if (data === null || data === undefined) return null;
    try {
      let str = typeof data === 'string' ? data : JSON.stringify(data);
      if (this.apiSecret) {
        str = str.replace(new RegExp(this.apiSecret, 'g'), '[REDACTED_SECRET]');
      }
      if (this.apiKey) {
        str = str.replace(new RegExp(this.apiKey, 'g'), '[REDACTED_KEY]');
      }
      str = str.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED_TOKEN]');
      return typeof data === 'string' ? str : JSON.parse(str);
    } catch (_) {
      return String(data);
    }
  }

  /**
   * Parses RFC 7807 problem details or standard HTTP errors into structured error.
   * Extracts error code, detail, and trace_id without sensitive token or secret leakage.
   */
  _handleApiError(err, context = 'API Call') {
    const statusCode = err.response?.status || 500;
    const rawData = err.response?.data;
    const headers = err.response?.headers || {};

    let code = null;
    let detail = null;
    let traceId = null;

    if (rawData && typeof rawData === 'object') {
      // 1. Direct fields: code, detail, attributes.trace_id (Property Finder Atlas API pattern)
      code = rawData.code || rawData.errorCode || rawData.error || null;
      detail = rawData.detail || rawData.message || rawData.title || rawData.error_description || null;
      traceId = rawData.attributes?.trace_id || rawData.trace_id || rawData.traceId || null;

      // 2. Nested JSON:API / RFC 7807 errors array
      if (Array.isArray(rawData.errors) && rawData.errors.length > 0) {
        const firstErr = rawData.errors[0];
        if (firstErr && typeof firstErr === 'object') {
          code = code || firstErr.code || firstErr.title || null;
          detail = detail || firstErr.detail || firstErr.message || null;
          traceId = traceId || firstErr.attributes?.trace_id || firstErr.trace_id || null;
        }
      }
    } else if (typeof rawData === 'string' && rawData.trim()) {
      detail = rawData.slice(0, 500);
    }

    // Header fallbacks for trace ID
    traceId = traceId || headers['x-trace-id'] || headers['x-request-id'] || headers['x-amzn-trace-id'] || null;

    // Clean human-readable message and detail (sanitized against secrets)
    const cleanDetail = this._sanitizeForLogging(detail);
    const cleanErrMessage = this._sanitizeForLogging(err.message);
    const baseMessage = cleanDetail || cleanErrMessage || `Request failed with status code ${statusCode}`;

    // Sanitized response body for deep diagnostics
    const sanitizedBody = this._sanitizeForLogging(rawData);

    // Build structured details payload
    const structuredDetails = {
      status: statusCode,
      endpoint: context,
      environment: this.environment,
      country_code: this.countryCode,
      tenant_id: this.tenantId,
      code: code || `HTTP_${statusCode}`,
      detail: cleanDetail || baseMessage,
      trace_id: traceId || null,
      auth_header_sent: true,
      response_body: sanitizedBody
    };

    // Construct informative, user-facing error message
    let formattedMessage = `[Property Finder ${context}] (${this.environment})`;
    if (code) formattedMessage += ` [${code}]`;
    formattedMessage += `: ${baseMessage}`;
    if (traceId) formattedMessage += ` (trace_id: ${traceId})`;
    formattedMessage += ` (Status: ${statusCode})`;

    // Sanitize the formatted message itself
    formattedMessage = this._sanitizeForLogging(formattedMessage);

    const customError = new Error(formattedMessage);
    customError.status = statusCode;
    customError.details = structuredDetails;
    customError.code = code || `HTTP_${statusCode}`;
    customError.traceId = traceId || null;

    console.error(`🚨 ${formattedMessage}`, {
      status: statusCode,
      endpoint: context,
      environment: this.environment,
      code,
      trace_id: traceId,
      response: sanitizedBody
    });

    throw customError;
  }

  /**
   * Mock responder for deterministic automated test scenarios.
   */
  _handleMockRequest({ method, endpoint, data, params }) {
    if (endpoint === '/account/profile') {
      return { id: 'mock_broker_123', name: 'Demo Real Estate Egypt', country: this.countryCode, active: true };
    }

    if (endpoint === '/listings' && method === 'GET') {
      return {
        data: [
          {
            id: 'pf_ext_101',
            reference: 'REF-CAIRO-101',
            title: 'Luxury 3BHK Apartment in New Cairo',
            description: 'Spacious apartment with private terrace and garden view.',
            property_type: 'Apartment',
            offering_type: 'sale',
            price: 4500000,
            currency: 'EGP',
            bedrooms: 3,
            bathrooms: 2,
            area_sqm: 185,
            location: {
              city: 'New Cairo',
              community: 'Fifth Settlement',
              sub_community: 'North Investors Area'
            },
            status: 'live',
            portal_url: 'https://www.propertyfinder.eg/en/plp/buy/apartment-for-sale-cairo-101.html',
            images: [
              'https://images.propertyfinder.eg/listings/101/main.jpg',
              'https://images.propertyfinder.eg/listings/101/bedroom.jpg'
            ],
            created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'pf_ext_102',
            reference: 'REF-ZAYED-202',
            title: 'Standalone Villa in Sheikh Zayed',
            description: 'Modern luxury standalone villa with private swimming pool.',
            property_type: 'Villa',
            offering_type: 'sale',
            price: 12500000,
            currency: 'EGP',
            bedrooms: 5,
            bathrooms: 5,
            area_sqm: 420,
            location: {
              city: 'Giza',
              community: 'Sheikh Zayed',
              sub_community: 'Beverly Hills'
            },
            status: 'live',
            portal_url: 'https://www.propertyfinder.eg/en/plp/buy/villa-for-sale-zayed-202.html',
            images: [
              'https://images.propertyfinder.eg/listings/202/exterior.jpg'
            ],
            created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
            updated_at: new Date().toISOString()
          }
        ],
        meta: {
          page: params?.page || 1,
          limit: params?.limit || 50,
          total: 2
        }
      };
    }

    if (endpoint.startsWith('/listings/') && method === 'GET') {
      const id = endpoint.split('/')[2];
      return {
        id,
        reference: `REF-${id}`,
        title: `Property ${id}`,
        property_type: 'Apartment',
        offering_type: 'sale',
        price: 3200000,
        currency: 'EGP',
        bedrooms: 2,
        bathrooms: 2,
        area_sqm: 120,
        status: 'live',
        location: { city: 'Cairo' },
        updated_at: new Date().toISOString()
      };
    }

    if (endpoint === '/listings' && method === 'POST') {
      const generatedId = 'pf_ext_' + Date.now();
      return {
        id: generatedId,
        reference: data.reference || `REF-${generatedId}`,
        status: 'pending_review',
        portal_url: `https://www.propertyfinder.eg/en/plp/buy/unit-${generatedId}.html`,
        created_at: new Date().toISOString()
      };
    }

    if (endpoint.startsWith('/listings/') && method === 'PUT') {
      const id = endpoint.split('/')[2];
      return {
        id,
        updated: true,
        status: data.status || 'live',
        updated_at: new Date().toISOString()
      };
    }

    if (endpoint === '/leads' && method === 'GET') {
      return {
        data: [
          {
            id: 'pf_lead_9001',
            listing_id: 'pf_ext_101',
            contact_name: 'Ahmed El-Sayed',
            contact_phone: '+201001234567',
            contact_email: 'ahmed.elsayed@example.com',
            channel: 'whatsapp',
            created_at: new Date().toISOString(),
            enquiry_message: 'Interested in the 3BHK New Cairo apartment. Can we schedule a viewing this Friday?'
          }
        ],
        meta: { page: 1, limit: 50, total: 1 }
      };
    }

    if (endpoint === '/webhooks/subscriptions' && method === 'POST') {
      return {
        id: 'wh_sub_' + Date.now(),
        url: data.url,
        events: data.events,
        status: 'active'
      };
    }

    if (endpoint === '/webhooks/subscriptions' && method === 'GET') {
      return {
        data: [
          { id: 'wh_sub_default', url: 'https://crm.tashgheel.com/api/propertyfinder/webhook', status: 'active' }
        ]
      };
    }

    return { success: true };
  }
}

module.exports = PropertyFinderClient;
