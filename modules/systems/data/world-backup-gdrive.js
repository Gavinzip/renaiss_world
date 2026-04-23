const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const {
  createWorldSnapshotArchive,
  restoreWorldDataFromArchive
} = require('./world-backup-snapshot');

const DRIVE_SCOPE_DEFAULT = 'https://www.googleapis.com/auth/drive';
const DRIVE_API_HOST = 'www.googleapis.com';
const OAUTH_HOST = 'oauth2.googleapis.com';

let tokenCache = {
  accessToken: '',
  expiresAt: 0,
  cacheKey: ''
};

function readProviderEnv() {
  return {
    folderId: String(process.env.WORLD_BACKUP_DRIVE_FOLDER_ID || '').trim(),
    driveId: String(process.env.WORLD_BACKUP_DRIVE_ID || '').trim(),
    authMode: String(process.env.WORLD_BACKUP_DRIVE_AUTH_MODE || 'auto').trim().toLowerCase() || 'auto',
    serviceAccountFile: String(process.env.WORLD_BACKUP_DRIVE_SERVICE_ACCOUNT_FILE || '').trim(),
    serviceAccountJson: String(process.env.WORLD_BACKUP_DRIVE_SERVICE_ACCOUNT_JSON || '').trim(),
    serviceAccountJsonBase64: String(process.env.WORLD_BACKUP_DRIVE_SERVICE_ACCOUNT_JSON_BASE64 || '').trim(),
    oauthClientId: String(process.env.WORLD_BACKUP_DRIVE_CLIENT_ID || '').trim(),
    oauthClientSecret: String(process.env.WORLD_BACKUP_DRIVE_CLIENT_SECRET || '').trim(),
    oauthRefreshToken: String(process.env.WORLD_BACKUP_DRIVE_REFRESH_TOKEN || '').trim(),
    oauthTokenUri: String(process.env.WORLD_BACKUP_DRIVE_OAUTH_TOKEN_URI || `https://${OAUTH_HOST}/token`).trim(),
    scope: String(process.env.WORLD_BACKUP_DRIVE_SCOPE || DRIVE_SCOPE_DEFAULT).trim() || DRIVE_SCOPE_DEFAULT,
    retentionCount: Math.max(1, Number(process.env.WORLD_BACKUP_DRIVE_RETENTION_COUNT || 30)),
    filePrefix: String(process.env.WORLD_BACKUP_DRIVE_FILE_PREFIX || 'world_backup_').trim() || 'world_backup_',
    latestPointerName: String(process.env.WORLD_BACKUP_DRIVE_LATEST_POINTER_NAME || 'latest_world_backup.json').trim() || 'latest_world_backup.json'
  };
}

function normalizePrivateKey(raw = '') {
  return String(raw || '').replace(/\\n/g, '\n').trim();
}

function parseJsonSafe(raw = '') {
  try {
    return JSON.parse(String(raw || '').trim());
  } catch {
    return null;
  }
}

function decodeBase64Utf8(raw = '') {
  try {
    return Buffer.from(String(raw || '').trim(), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function loadServiceAccountCredentials(env = readProviderEnv()) {
  let payload = null;

  if (env.serviceAccountJson) {
    payload = parseJsonSafe(env.serviceAccountJson);
  }
  if (!payload && env.serviceAccountJsonBase64) {
    payload = parseJsonSafe(decodeBase64Utf8(env.serviceAccountJsonBase64));
  }
  if (!payload && env.serviceAccountFile) {
    try {
      payload = parseJsonSafe(fs.readFileSync(env.serviceAccountFile, 'utf8'));
    } catch {
      payload = null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;

  const clientEmail = String(payload.client_email || '').trim();
  const privateKey = normalizePrivateKey(payload.private_key || '');
  const tokenUri = String(payload.token_uri || `https://${OAUTH_HOST}/token`).trim();
  if (!clientEmail || !privateKey || !tokenUri) return null;

  return {
    clientEmail,
    privateKey,
    tokenUri
  };
}

function loadOAuthUserCredentials(env = readProviderEnv()) {
  const clientId = String(env.oauthClientId || '').trim();
  const clientSecret = String(env.oauthClientSecret || '').trim();
  const refreshToken = String(env.oauthRefreshToken || '').trim();
  const tokenUri = String(env.oauthTokenUri || `https://${OAUTH_HOST}/token`).trim();
  if (!clientId || !clientSecret || !refreshToken || !tokenUri) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    tokenUri
  };
}

function normalizeDriveAuthMode(raw = '') {
  const mode = String(raw || 'auto').trim().toLowerCase();
  if (mode === 'auto' || mode === 'service_account' || mode === 'oauth_user') return mode;
  return '';
}

function resolveDriveAuthConfig() {
  const env = readProviderEnv();
  const mode = normalizeDriveAuthMode(env.authMode);
  if (!mode) {
    return {
      ok: false,
      reason: 'invalid_drive_auth_mode',
      env,
      auth: null
    };
  }

  const serviceAccount = loadServiceAccountCredentials(env);
  const oauthUser = loadOAuthUserCredentials(env);

  if (mode === 'service_account') {
    if (!serviceAccount) {
      return {
        ok: false,
        reason: 'missing_drive_credentials_service_account',
        env,
        auth: null
      };
    }
    return {
      ok: true,
      env,
      auth: {
        mode: 'service_account',
        ...serviceAccount
      }
    };
  }

  if (mode === 'oauth_user') {
    if (!oauthUser) {
      return {
        ok: false,
        reason: 'missing_drive_credentials_oauth_user',
        env,
        auth: null
      };
    }
    return {
      ok: true,
      env,
      auth: {
        mode: 'oauth_user',
        ...oauthUser
      }
    };
  }

  if (oauthUser) {
    return {
      ok: true,
      env,
      auth: {
        mode: 'oauth_user',
        ...oauthUser
      }
    };
  }
  if (serviceAccount) {
    return {
      ok: true,
      env,
      auth: {
        mode: 'service_account',
        ...serviceAccount
      }
    };
  }
  return {
    ok: false,
    reason: 'missing_drive_credentials',
    env,
    auth: null
  };
}

function getGoogleDriveBackupDebugStatus() {
  const resolved = resolveDriveAuthConfig();
  const env = resolved.env || readProviderEnv();
  const serviceAccount = loadServiceAccountCredentials(env);
  const oauthUser = loadOAuthUserCredentials(env);
  return {
    hasDriveFolderId: Boolean(env.folderId),
    hasDriveId: Boolean(env.driveId),
    driveAuthModeConfigured: normalizeDriveAuthMode(env.authMode) || '(invalid)',
    driveAuthModeEffective: resolved.ok ? String(resolved?.auth?.mode || 'unknown') : 'none',
    hasServiceAccountFile: Boolean(env.serviceAccountFile),
    hasServiceAccountJson: Boolean(env.serviceAccountJson || env.serviceAccountJsonBase64),
    hasServiceAccountCredentials: Boolean(serviceAccount),
    hasOauthUserCredentials: Boolean(oauthUser),
    hasDriveAuthCredentials: Boolean(resolved.ok),
    driveScope: env.scope,
    driveRetentionCount: env.retentionCount,
    driveFilePrefix: env.filePrefix,
    driveLatestPointerName: env.latestPointerName
  };
}

function validateGoogleDriveConfig() {
  const resolved = resolveDriveAuthConfig();
  const env = resolved.env || readProviderEnv();
  if (!env.folderId) {
    return { ok: false, reason: 'missing_drive_folder' };
  }
  if (!resolved.ok || !resolved.auth) {
    return { ok: false, reason: resolved.reason || 'missing_drive_credentials' };
  }
  return { ok: true, env, auth: resolved.auth };
}

function base64url(value) {
  return Buffer.from(String(value || ''), 'utf8')
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createJwtAssertion(creds, scope) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: creds.clientEmail,
    scope,
    aud: creds.tokenUri,
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(creds.privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${unsigned}.${signature}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function httpRequestRaw(options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: options.hostname,
        path: options.path,
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          resolve({
            statusCode: Number(res.statusCode || 0),
            headers: res.headers || {},
            body
          });
        });
      }
    );

    req.setTimeout(Math.max(1000, Number(options.timeoutMs || 30000)), () => {
      req.destroy(new Error('request timeout'));
    });
    req.on('error', reject);
    if (options.bodyBuffer && options.bodyBuffer.length > 0) req.write(options.bodyBuffer);
    req.end();
  });
}

async function retryable(task, options = {}) {
  const retries = Math.max(0, Number(options.retries || 3));
  let attempt = 0;
  let lastError = null;
  while (attempt <= retries) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      const waitMs = Math.min(3000, 300 * Math.pow(2, attempt));
      await sleep(waitMs);
    }
    attempt += 1;
  }
  throw lastError || new Error('retryable failed');
}

async function getAccessToken(scope, creds) {
  const cacheKey = `service_account:${String(creds.clientEmail || '').trim()}:${String(scope || '').trim()}`;
  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 60_000 && tokenCache.cacheKey === cacheKey) {
    return tokenCache.accessToken;
  }
  const assertion = createJwtAssertion(creds, scope);
  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const bodyBuffer = Buffer.from(form.toString(), 'utf8');
  const tokenPath = new URL(creds.tokenUri).pathname || '/token';
  const tokenHost = new URL(creds.tokenUri).hostname || OAUTH_HOST;

  const response = await httpRequestRaw({
    hostname: tokenHost,
    path: tokenPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': bodyBuffer.length
    },
    bodyBuffer
  });

  const raw = response.body.toString('utf8');
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (response.statusCode < 200 || response.statusCode >= 300 || !parsed?.access_token) {
    throw new Error(`oauth token error: HTTP ${response.statusCode} ${raw.slice(0, 240)}`);
  }
  const expiresIn = Math.max(300, Number(parsed.expires_in || 3600));
  tokenCache = {
    accessToken: String(parsed.access_token),
    expiresAt: Date.now() + expiresIn * 1000,
    cacheKey
  };
  return tokenCache.accessToken;
}

async function getAccessTokenWithRefreshToken(oauth) {
  const cacheKey = `oauth_user:${String(oauth.clientId || '').trim()}`;
  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 60_000 && tokenCache.cacheKey === cacheKey) {
    return tokenCache.accessToken;
  }

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    refresh_token: oauth.refreshToken
  });
  const bodyBuffer = Buffer.from(form.toString(), 'utf8');
  const tokenUrl = new URL(oauth.tokenUri);
  const tokenPath = tokenUrl.pathname || '/token';
  const tokenHost = tokenUrl.hostname || OAUTH_HOST;

  const response = await httpRequestRaw({
    hostname: tokenHost,
    path: tokenPath,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': bodyBuffer.length
    },
    bodyBuffer
  });

  const raw = response.body.toString('utf8');
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (response.statusCode < 200 || response.statusCode >= 300 || !parsed?.access_token) {
    throw new Error(`oauth refresh_token error: HTTP ${response.statusCode} ${raw.slice(0, 240)}`);
  }

  const expiresIn = Math.max(300, Number(parsed.expires_in || 3600));
  tokenCache = {
    accessToken: String(parsed.access_token),
    expiresAt: Date.now() + expiresIn * 1000,
    cacheKey
  };
  return tokenCache.accessToken;
}

async function getDriveAccessToken(config) {
  if (config?.auth?.mode === 'oauth_user') {
    return getAccessTokenWithRefreshToken(config.auth);
  }
  if (config?.auth?.mode === 'service_account') {
    return getAccessToken(config.env.scope, config.auth);
  }
  throw new Error('missing_drive_credentials');
}

function encodeQuery(params = {}) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    q.set(key, String(value));
  }
  const query = q.toString();
  return query ? `?${query}` : '';
}

async function driveRequest(options = {}) {
  const config = validateGoogleDriveConfig();
  if (!config.ok) throw new Error(config.reason || 'invalid_drive_config');
  const token = await getDriveAccessToken(config);
  const bodyBuffer = Buffer.isBuffer(options.body)
    ? options.body
    : (options.body != null ? Buffer.from(String(options.body), 'utf8') : null);

  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {})
  };
  if (bodyBuffer && !headers['Content-Length']) {
    headers['Content-Length'] = String(bodyBuffer.length);
  }

  return retryable(async () => {
    const response = await httpRequestRaw({
      hostname: DRIVE_API_HOST,
      path: options.path,
      method: options.method || 'GET',
      headers,
      bodyBuffer
    });
    const bodyText = response.body.toString('utf8');
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (options.expect === 'buffer') return response.body;
      if (options.expect === 'text') return bodyText;
      if (!bodyText) return {};
      try {
        return JSON.parse(bodyText);
      } catch {
        return {};
      }
    }
    const isRetryable = response.statusCode === 429 || response.statusCode === 503;
    if (isRetryable) {
      throw new Error(`drive temporary error: HTTP ${response.statusCode} ${bodyText.slice(0, 220)}`);
    }
    throw new Error(`drive request failed: HTTP ${response.statusCode} ${bodyText.slice(0, 220)}`);
  }, { retries: 3 });
}

function escapeDriveQueryLiteral(text = '') {
  return String(text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildDriveListParams(extra = {}) {
  const env = readProviderEnv();
  const params = {
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    fields: 'files(id,name,mimeType,createdTime,modifiedTime,size),nextPageToken',
    ...extra
  };
  if (env.driveId) {
    params.corpora = 'drive';
    params.driveId = env.driveId;
  }
  return params;
}

async function listDriveFiles(query, pageSize = 100) {
  const params = buildDriveListParams({
    q: query,
    pageSize: String(Math.max(1, Math.min(1000, Number(pageSize) || 100))),
    orderBy: 'createdTime desc'
  });
  const data = await driveRequest({
    path: `/drive/v3/files${encodeQuery(params)}`,
    method: 'GET'
  });
  return Array.isArray(data?.files) ? data.files : [];
}

async function createMultipartFile({ name, folderId, mimeType, content }) {
  const boundary = `rw_backup_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const metadata = JSON.stringify({
    name,
    parents: [folderId]
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`, 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8'),
    Buffer.isBuffer(content) ? content : Buffer.from(content || ''),
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  ]);

  return driveRequest({
    method: 'POST',
    path: `/upload/drive/v3/files${encodeQuery({
      uploadType: 'multipart',
      supportsAllDrives: 'true',
      fields: 'id,name,mimeType,createdTime,modifiedTime,size,parents'
    })}`,
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
}

async function updateMultipartFile(fileId, { mimeType, content }) {
  const boundary = `rw_backup_patch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const metadata = JSON.stringify({});
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`, 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`, 'utf8'),
    Buffer.isBuffer(content) ? content : Buffer.from(content || ''),
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
  ]);

  return driveRequest({
    method: 'PATCH',
    path: `/upload/drive/v3/files/${encodeURIComponent(String(fileId || '').trim())}${encodeQuery({
      uploadType: 'multipart',
      supportsAllDrives: 'true',
      fields: 'id,name,mimeType,createdTime,modifiedTime,size,parents'
    })}`,
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
}

async function downloadDriveFile(fileId) {
  return driveRequest({
    method: 'GET',
    path: `/drive/v3/files/${encodeURIComponent(String(fileId || '').trim())}${encodeQuery({
      alt: 'media',
      supportsAllDrives: 'true'
    })}`,
    expect: 'buffer'
  });
}

async function deleteDriveFile(fileId) {
  await driveRequest({
    method: 'DELETE',
    path: `/drive/v3/files/${encodeURIComponent(String(fileId || '').trim())}${encodeQuery({
      supportsAllDrives: 'true'
    })}`,
    expect: 'text'
  });
}

function sanitizeReasonTag(reason = '') {
  return String(reason || '')
    .toLowerCase()
    .replace(/[^\w-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
}

function buildBackupFileName(reason = '') {
  const env = readProviderEnv();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reasonTag = sanitizeReasonTag(reason);
  return `${env.filePrefix}${stamp}${reasonTag ? `_${reasonTag}` : ''}.tar.gz`;
}

async function upsertLatestPointer(folderId, pointerName, payload) {
  const escapedFolder = escapeDriveQueryLiteral(folderId);
  const escapedName = escapeDriveQueryLiteral(pointerName);
  const query = `'${escapedFolder}' in parents and name = '${escapedName}' and trashed = false`;
  const files = await listDriveFiles(query, 10);
  const content = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  if (files.length > 0 && files[0]?.id) {
    return updateMultipartFile(files[0].id, { mimeType: 'application/json', content });
  }
  return createMultipartFile({ name: pointerName, folderId, mimeType: 'application/json', content });
}

async function resolveLatestBackupFile(folderId, pointerName, filePrefix) {
  const escapedFolder = escapeDriveQueryLiteral(folderId);
  const escapedPointerName = escapeDriveQueryLiteral(pointerName);
  const pointerQuery = `'${escapedFolder}' in parents and name = '${escapedPointerName}' and trashed = false`;
  const pointerFiles = await listDriveFiles(pointerQuery, 5);
  if (pointerFiles.length > 0 && pointerFiles[0]?.id) {
    try {
      const raw = (await downloadDriveFile(pointerFiles[0].id)).toString('utf8');
      const parsed = JSON.parse(raw);
      const candidateId = String(parsed?.fileId || '').trim();
      if (candidateId) {
        return {
          id: candidateId,
          name: String(parsed?.fileName || '').trim() || candidateId,
          source: 'pointer'
        };
      }
    } catch {
      // ignore pointer parse error, fallback to list
    }
  }

  const escapedPrefix = escapeDriveQueryLiteral(filePrefix);
  const backupQuery = `'${escapedFolder}' in parents and name contains '${escapedPrefix}' and trashed = false`;
  const backups = await listDriveFiles(backupQuery, 50);
  const candidate = backups.find((entry) => String(entry?.name || '').endsWith('.tar.gz'));
  if (!candidate?.id) return null;
  return {
    id: String(candidate.id),
    name: String(candidate.name || candidate.id),
    source: 'list'
  };
}

async function cleanupOldBackups(folderId, filePrefix, keepCount) {
  const escapedFolder = escapeDriveQueryLiteral(folderId);
  const escapedPrefix = escapeDriveQueryLiteral(filePrefix);
  const backupQuery = `'${escapedFolder}' in parents and name contains '${escapedPrefix}' and trashed = false`;
  const backups = await listDriveFiles(backupQuery, 200);
  const candidates = backups
    .filter((entry) => String(entry?.name || '').endsWith('.tar.gz'))
    .sort((a, b) => {
      const ta = Date.parse(String(a?.createdTime || '')) || 0;
      const tb = Date.parse(String(b?.createdTime || '')) || 0;
      return tb - ta;
    });
  const toDelete = candidates.slice(Math.max(1, keepCount));
  for (const file of toDelete) {
    const id = String(file?.id || '').trim();
    if (!id) continue;
    try {
      await deleteDriveFile(id);
    } catch (error) {
      console.log(`[Backup][Drive] cleanup delete failed id=${id}: ${String(error?.message || error)}`);
    }
  }
}

async function runGoogleDriveBackup(options = {}) {
  const config = validateGoogleDriveConfig();
  if (!config.ok) {
    return {
      ok: false,
      changed: false,
      reason: config.reason,
      provider: 'gdrive'
    };
  }

  const env = config.env;
  const backupSubdir = String(options.backupSubdir || 'RENAISSANCEWORLD').trim() || 'RENAISSANCEWORLD';
  const reason = String(options.reason || 'manual').trim() || 'manual';
  const worldDataRoot = String(options.worldDataRoot || '').trim();
  const includeVolatile = Boolean(options.includeVolatile);
  const archive = createWorldSnapshotArchive(worldDataRoot, backupSubdir, { includeVolatile });

  try {
    const backupName = buildBackupFileName(reason);
    const archiveBuffer = fs.readFileSync(archive.archivePath);
    const created = await createMultipartFile({
      name: backupName,
      folderId: env.folderId,
      mimeType: 'application/gzip',
      content: archiveBuffer
    });
    const fileId = String(created?.id || '').trim();
    if (!fileId) {
      throw new Error('drive upload did not return file id');
    }

    const pointerPayload = {
      provider: 'gdrive',
      updatedAt: new Date().toISOString(),
      reason,
      subdir: backupSubdir,
      includeVolatile,
      fileId,
      fileName: backupName,
      folderId: env.folderId
    };
    await upsertLatestPointer(env.folderId, env.latestPointerName, pointerPayload);
    await cleanupOldBackups(env.folderId, env.filePrefix, env.retentionCount);

    return {
      ok: true,
      changed: true,
      reason,
      provider: 'gdrive',
      folderId: env.folderId,
      fileId,
      fileName: backupName,
      subdir: backupSubdir
    };
  } catch (error) {
    return {
      ok: false,
      changed: false,
      reason,
      provider: 'gdrive',
      error: String(error?.message || error)
    };
  } finally {
    archive.cleanup();
  }
}

async function runGoogleDrivePull(options = {}) {
  const config = validateGoogleDriveConfig();
  if (!config.ok) {
    return {
      ok: false,
      changed: false,
      reason: config.reason,
      provider: 'gdrive'
    };
  }

  const env = config.env;
  const backupSubdir = String(options.backupSubdir || 'RENAISSANCEWORLD').trim() || 'RENAISSANCEWORLD';
  const reason = String(options.reason || 'manual_pull').trim() || 'manual_pull';
  const worldDataRoot = String(options.worldDataRoot || '').trim();

  const latest = await resolveLatestBackupFile(env.folderId, env.latestPointerName, env.filePrefix);
  if (!latest?.id) {
    return {
      ok: false,
      changed: false,
      reason: 'drive_backup_not_found',
      provider: 'gdrive'
    };
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'renaiss-world-drive-pull-'));
  const archivePath = path.join(tempRoot, `${backupSubdir}.tar.gz`);
  try {
    const data = await downloadDriveFile(latest.id);
    fs.writeFileSync(archivePath, data);
    restoreWorldDataFromArchive(archivePath, backupSubdir, worldDataRoot);
    return {
      ok: true,
      changed: true,
      reason,
      provider: 'gdrive',
      folderId: env.folderId,
      fileId: latest.id,
      fileName: latest.name,
      source: latest.source,
      subdir: backupSubdir
    };
  } catch (error) {
    return {
      ok: false,
      changed: false,
      reason,
      provider: 'gdrive',
      error: String(error?.message || error)
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

module.exports = {
  getGoogleDriveBackupDebugStatus,
  validateGoogleDriveConfig,
  runGoogleDriveBackup,
  runGoogleDrivePull
};
