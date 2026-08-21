'use strict';

/**
 * InvestBrief API — Yandex Cloud Function
 * Frontend → API Gateway → investbrief-api → YDB Serverless (investbrief-prod)
 *
 * Таблица users_data создаётся вручную в YDB Console (DDL не выполняется из функции).
 * Auth: пока userId передаётся клиентом. Для production добавить verifyAuth(event)
 * и сопоставление userId с subject токена.
 */

const {
  Driver,
  getCredentialsFromEnv,
  TypedValues
} = require('ydb-sdk');

const SERVICE_NAME = 'investbrief-api';

/** После миграции на investbrief.ru заменить '*' на проверку origin из этого списка. */
const ALLOWED_ORIGINS = [
  'https://victoriiamikhaleva.github.io',
  'https://investbrief.ru',
  'https://www.investbrief.ru'
];

/** Не сохранять котировки, снимки и временный рыночный кэш. */
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'quotes',
  'snapshots',
  'marketSnapshot',
  'liveBriefs',
  'analyticsCache',
  'topTurnover',
  'imoex',
  'briefs',
  'cache',
  'agentSignals',
  'marketData',
  'liveFallback'
]);

let driverPromise = null;

function getDriver() {
  if (!driverPromise) {
    driverPromise = (async function () {
      try {
        const endpoint = process.env.YDB_ENDPOINT;
        const database = process.env.YDB_DATABASE;
        if (!endpoint || !database) {
          throw new Error('YDB_ENDPOINT and YDB_DATABASE must be set');
        }
        const driver = new Driver({
          endpoint,
          database,
          authService: getCredentialsFromEnv()
        });
        const ok = await driver.ready(10000);
        if (!ok) throw new Error('YDB driver not ready');
        return driver;
      } catch (err) {
        console.error('[investbrief-api] getDriver failed', err);
        driverPromise = null;
        throw err;
      }
    })();
  }
  return driverPromise;
}

function corsHeaders(requestOrigin) {
  // TODO: после покупки домена — вернуть origin только если он в ALLOWED_ORIGINS.
  // var allow = ALLOWED_ORIGINS.indexOf(requestOrigin) >= 0 ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

function jsonResponse(statusCode, body, requestOrigin) {
  return {
    statusCode: statusCode,
    headers: corsHeaders(requestOrigin),
    body: JSON.stringify(body)
  };
}

function normalizePath(event) {
  var path = event.url || event.path || (event.requestContext && event.requestContext.path) || '/';
  path = String(path).split('?')[0];
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

function normalizeMethod(event) {
  return String(
    event.httpMethod ||
    event.requestContext && event.requestContext.httpMethod ||
    'GET'
  ).toUpperCase();
}

function getRequestOrigin(event) {
  var headers = event.headers || {};
  return headers.origin || headers.Origin || headers.referer || headers.Referer || '';
}

function parseJsonBody(event) {
  if (!event.body) return {};
  var raw = event.body;
  if (event.isBase64Encoded) {
    raw = Buffer.from(raw, 'base64').toString('utf8');
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function getQueryParam(event, name) {
  var q = event.queryStringParameters || event.params || {};
  if (q && q[name] != null) return String(q[name]);
  var multi = event.multiValueQueryStringParameters;
  if (multi && multi[name] && multi[name][0] != null) return String(multi[name][0]);
  return '';
}

/**
 * Будущая авторизация: проверка JWT / IAM и возврат доверенного userId.
 * @returns {Promise<{ userId: string|null, error: string|null }>}
 */
async function verifyAuth(event) {
  // const authHeader = (event.headers && (event.headers.Authorization || event.headers.authorization)) || '';
  // if (!authHeader.startsWith('Bearer ')) return { userId: null, error: 'Unauthorized' };
  // const token = authHeader.slice(7);
  // ... validate token, return { userId: sub, error: null }
  return { userId: null, error: null };
}

function assertPlainObject(value, fieldName) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    var err = new Error(fieldName + ' must be an object');
    err.statusCode = 400;
    throw err;
  }
  return value;
}

function assertArray(value, fieldName) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    var err = new Error(fieldName + ' must be an array');
    err.statusCode = 400;
    throw err;
  }
  return value;
}

function validateSavePayload(body) {
  if (!body || typeof body !== 'object') {
    var bad = new Error('Invalid JSON body');
    bad.statusCode = 400;
    throw bad;
  }

  Object.keys(body).forEach(function (key) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      var forbidden = new Error('Field "' + key + '" must not be stored in cloud sync');
      forbidden.statusCode = 400;
      throw forbidden;
    }
  });

  var userId = String(body.userId || '').trim();
  if (!userId) {
    var missing = new Error('userId is required');
    missing.statusCode = 400;
    throw missing;
  }
  if (userId.length > 128) {
    var longId = new Error('userId is too long');
    longId.statusCode = 400;
    throw longId;
  }

  var dataVersion = body.dataVersion != null ? Number(body.dataVersion) : 1;
  if (!isFinite(dataVersion) || dataVersion < 1) dataVersion = 1;

  return {
    userId: userId,
    portfolio: assertPlainObject(body.portfolio, 'portfolio'),
    watchlist: assertArray(body.watchlist, 'watchlist'),
    agentSettings: assertPlainObject(body.agentSettings, 'agentSettings'),
    settings: assertPlainObject(body.settings, 'settings'),
    dataVersion: Math.floor(dataVersion),
    updatedAt: new Date().toISOString()
  };
}

function parseResultRow(resultSet) {
  if (!resultSet || !resultSet.rows || !resultSet.rows.length) return null;
  var cols = (resultSet.columns || []).map(function (c) { return c.name; });
  var items = resultSet.rows[0].items || resultSet.rows[0];
  var out = {};
  cols.forEach(function (name, i) {
    var cell = items[i];
    if (cell == null) {
      out[name] = null;
      return;
    }
    if (typeof cell === 'object') {
      if (cell.textValue != null) out[name] = cell.textValue;
      else if (cell.int32Value != null) out[name] = cell.int32Value;
      else if (cell.int64Value != null) out[name] = Number(cell.int64Value);
      else out[name] = null;
      return;
    }
    out[name] = cell;
  });
  return out;
}

function rowToUserData(row) {
  if (!row || !row.userId) return null;
  function parseJson(str, fallback) {
    if (str == null || str === '') return fallback;
    try {
      return JSON.parse(str);
    } catch (e) {
      return fallback;
    }
  }
  return {
    userId: row.userId,
    portfolio: parseJson(row.portfolioJson, {}),
    watchlist: parseJson(row.watchlistJson, []),
    agentSettings: parseJson(row.agentSettingsJson, {}),
    settings: parseJson(row.settingsJson, {}),
    dataVersion: row.dataVersion != null ? Number(row.dataVersion) : 1,
    updatedAt: row.updatedAt || null
  };
}

async function saveUserData(record) {
  try {
    var driver = await getDriver();

    await driver.tableClient.withSession(async function (session) {
      await session.executeQuery(`
        DECLARE $userId AS Utf8;
        DECLARE $portfolioJson AS Utf8;
        DECLARE $watchlistJson AS Utf8;
        DECLARE $agentSettingsJson AS Utf8;
        DECLARE $settingsJson AS Utf8;
        DECLARE $dataVersion AS Int32;
        DECLARE $updatedAt AS Utf8;

        UPSERT INTO users_data (
          userId, portfolioJson, watchlistJson, agentSettingsJson, settingsJson, dataVersion, updatedAt
        ) VALUES (
          $userId, $portfolioJson, $watchlistJson, $agentSettingsJson, $settingsJson, $dataVersion, $updatedAt
        );
      `, {
        $userId: TypedValues.utf8(record.userId),
        $portfolioJson: TypedValues.utf8(JSON.stringify(record.portfolio)),
        $watchlistJson: TypedValues.utf8(JSON.stringify(record.watchlist)),
        $agentSettingsJson: TypedValues.utf8(JSON.stringify(record.agentSettings)),
        $settingsJson: TypedValues.utf8(JSON.stringify(record.settings)),
        $dataVersion: TypedValues.int32(record.dataVersion),
        $updatedAt: TypedValues.utf8(record.updatedAt)
      });
    });

    return record;
  } catch (err) {
    console.error('[investbrief-api] saveUserData failed', err);
    throw err;
  }
}

async function loadUserData(userId) {
  try {
    var driver = await getDriver();

    var row = null;
    await driver.tableClient.withSession(async function (session) {
      var result = await session.executeQuery(`
        DECLARE $userId AS Utf8;
        SELECT userId, portfolioJson, watchlistJson, agentSettingsJson, settingsJson, dataVersion, updatedAt
        FROM users_data
        WHERE userId = $userId;
      `, {
        $userId: TypedValues.utf8(userId)
      });

      var sets = result.resultSets || [];
      if (!sets.length) return;
      row = parseResultRow(sets[0]);
    });

    return rowToUserData(row);
  } catch (err) {
    console.error('[investbrief-api] loadUserData failed', err);
    throw err;
  }
}

async function resolveTrustedUserId(event, body) {
  var auth = await verifyAuth(event);
  if (auth.error) {
    var err = new Error(auth.error);
    err.statusCode = 401;
    throw err;
  }
  if (auth.userId) return auth.userId;

  var fromBody = body && body.userId ? String(body.userId).trim() : '';
  var fromQuery = getQueryParam(event, 'userId').trim();
  return fromBody || fromQuery;
}

module.exports.handler = async function handler(event, context) {
  var origin = getRequestOrigin(event);
  var method = normalizeMethod(event);
  var path = normalizePath(event);

  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders(origin),
      body: ''
    };
  }

  try {
    if (method === 'GET' && path === '/health') {
      return jsonResponse(200, { ok: true, service: SERVICE_NAME }, origin);
    }

    if (method === 'POST' && path === '/user/data/save') {
      var saveBody = parseJsonBody(event);
      if (saveBody === null) {
        return jsonResponse(400, { ok: false, error: 'Invalid JSON body' }, origin);
      }
      var saveRecord = validateSavePayload(saveBody);
      var trustedSaveUser = await resolveTrustedUserId(event, saveBody);
      if (trustedSaveUser && trustedSaveUser !== saveRecord.userId) {
        saveRecord.userId = trustedSaveUser;
      }
      await saveUserData(saveRecord);
      return jsonResponse(200, {
        ok: true,
        data: {
          userId: saveRecord.userId,
          portfolio: saveRecord.portfolio,
          watchlist: saveRecord.watchlist,
          agentSettings: saveRecord.agentSettings,
          settings: saveRecord.settings,
          dataVersion: saveRecord.dataVersion,
          updatedAt: saveRecord.updatedAt
        }
      }, origin);
    }

    if (method === 'GET' && path === '/user/data/load') {
      var loadUserId = await resolveTrustedUserId(event, null);
      if (!loadUserId) {
        return jsonResponse(400, { ok: false, error: 'userId is required' }, origin);
      }
      var loaded = await loadUserData(loadUserId);
      return jsonResponse(200, { ok: true, data: loaded }, origin);
    }

    if (method === 'POST' && path === '/user/data/import-local') {
      var importBody = parseJsonBody(event);
      if (importBody === null) {
        return jsonResponse(400, { ok: false, error: 'Invalid JSON body' }, origin);
      }
      var importRecord = validateSavePayload(importBody);
      var trustedImportUser = await resolveTrustedUserId(event, importBody);
      if (trustedImportUser && trustedImportUser !== importRecord.userId) {
        importRecord.userId = trustedImportUser;
      }
      await saveUserData(importRecord);
      return jsonResponse(200, {
        ok: true,
        message: 'Данные перенесены в аккаунт'
      }, origin);
    }

    return jsonResponse(404, { ok: false, error: 'Not found' }, origin);
  } catch (err) {
    var status = err && err.statusCode ? Number(err.statusCode) : 500;
    if (status === 500) {
      console.error('[investbrief-api]', err);
    }
    var message = status === 500 ? 'Internal server error' : (err.message || 'Bad request');
    return jsonResponse(status, { ok: false, error: message }, origin);
  }
};
