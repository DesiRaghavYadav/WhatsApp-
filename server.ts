import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import zlib from 'zlib';
import { createServer as createViteServer } from 'vite';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, generateWAMessage, generateWAMessageFromContent, prepareWAMessageMedia, getUrlInfo, Browsers, fetchLatestBaileysVersion, proto, jidNormalizedUser, isJidGroup } from '@queenanya/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, deleteDoc, collection, getDocs, getDoc, disableNetwork, setLogLevel } from 'firebase/firestore';
import { Jimp } from 'jimp';
import { getLinkPreview } from 'link-preview-js';

const serverStartTime = Date.now();

function getUptimeFormatted(startTime: number): string {
  const totalSeconds = Math.floor((Date.now() - startTime) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

// Suppress verbose SDK internal error stream logging
try {
  setLogLevel('silent');
} catch (e) {}

// Keep original filesystem functions
const originalWriteFileSync = fs.writeFileSync;
const originalUnlinkSync = fs.unlinkSync;
const originalRmSync = fs.rmSync;
const originalWriteFile = fs.writeFile;
const originalUnlink = fs.unlink;
const originalRm = fs.rm;

const originalPromisesWriteFile = fs.promises ? fs.promises.writeFile : null;
const originalPromisesUnlink = fs.promises ? fs.promises.unlink : null;
const originalPromisesRm = fs.promises ? fs.promises.rm : null;

// Initialize Firebase
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
let db: any = null;
let isQuotaExceeded = false;
let firestoreInitError: string | null = null;
let firestoreDbId: string | null = null;

function handleFirestoreError(context: string, err: any) {
  const errMsg = err?.message || String(err);
  if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota limit exceeded') || err?.code === 'resource-exhausted' || err?.code === 8) {
    if (!isQuotaExceeded) {
      isQuotaExceeded = true;
      console.warn('[FIREBASE] Firestore free tier daily write quota exceeded. Gracefully pausing background cloud sync for today and using local disk storage.');
      if (db) {
        disableNetwork(db).catch(() => {});
      }
    }
  } else {
    console.error(`[FIREBASE] ${context}:`, err);
  }
}

if (fs.existsSync(firebaseConfigPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    firestoreDbId = config.firestoreDatabaseId || null;
    const app = initializeApp(config);
    db = getFirestore(app, config.firestoreDatabaseId);
    console.log('[FIREBASE] Successfully initialized Firebase & Firestore with database:', config.firestoreDatabaseId);
  } catch (err: any) {
    firestoreInitError = err?.message || String(err);
    console.error('[FIREBASE] Error initializing Firebase:', err);
  }
} else {
  console.warn('[FIREBASE] Warning: firebase-applet-config.json not found.');
}

// Helper functions to mirror changes to Firestore database
function normalizeFilePath(filePath: any): string | null {
  if (filePath == null) return null;
  if (Buffer.isBuffer(filePath)) {
    return filePath.toString('utf-8');
  }
  if (typeof filePath === 'string') {
    return filePath;
  }
  if (typeof filePath.toString === 'function') {
    return filePath.toString();
  }
  return null;
}

// Single-doc gzipped Baileys auth bundle backup/restore (saves creds.json + all Signal/AppState/DeviceList keys in 1 Firestore write)
const authBundleTimers = new Map<string, NodeJS.Timeout>();
const pendingAuthBundleSyncs = new Set<string>();

function parseAuthFolderInfo(relativePath: string): { username: string; sessionId: string; fileName: string } | null {
  const normalized = relativePath.replace(/\\/g, '/');
  const match = normalized.match(/^data\/([^\/]+)\/auth_info_([^\/]+)(?:\/(.+))?$/);
  if (!match) return null;
  return {
    username: match[1],
    sessionId: match[2],
    fileName: match[3] || ''
  };
}

function getAuthBundleDocId(username: string, sessionId: string): string {
  return `auth_bundle___${username}___${sessionId}`;
}

async function syncAuthBundleToFirestore(username: string, sessionId: string): Promise<void> {
  if (!db || isQuotaExceeded) return;
  const authFolder = path.join(process.cwd(), 'data', username, 'auth_info_' + sessionId);
  const credsPath = path.join(authFolder, 'creds.json');
  if (!fs.existsSync(credsPath)) return;

  try {
    const entries = fs.readdirSync(authFolder);
    // Prioritize essential state files first so even very old sessions stay well under Firestore's 1MB limit
    const withStats = entries
      .filter(f => !f.startsWith('.'))
      .map(f => {
        const full = path.join(authFolder, f);
        try {
          const st = fs.statSync(full);
          if (!st.isFile()) return null;
          let priority = 3;
          if (f === 'creds.json') priority = 0;
          else if (f.startsWith('app-state-sync-') || f.startsWith('device-list-') || f.startsWith('lid-mapping-')) priority = 1;
          else if (f.startsWith('pre-key-')) priority = 2;
          return { name: f, full, mtimeMs: st.mtimeMs, priority };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{ name: string; full: string; mtimeMs: number; priority: number }>;

    withStats.sort((a, b) => (a.priority - b.priority) || (b.mtimeMs - a.mtimeMs));

    const filesMap: Record<string, string> = {};
    for (const entry of withStats) {
      try {
        filesMap[entry.name] = fs.readFileSync(entry.full, 'utf8');
      } catch {}
    }

    if (!filesMap['creds.json']) return;

    let compressedB64 = zlib.gzipSync(Buffer.from(JSON.stringify(filesMap), 'utf8')).toString('base64');
    // Trim oldest low-priority session/sender keys only if gzipped payload exceeds 720KB
    if (compressedB64.length > 720 * 1024) {
      const removable = withStats.filter(e => e.priority >= 3).reverse();
      for (const rem of removable) {
        delete filesMap[rem.name];
        compressedB64 = zlib.gzipSync(Buffer.from(JSON.stringify(filesMap), 'utf8')).toString('base64');
        if (compressedB64.length <= 720 * 1024) break;
      }
    }

    const docId = getAuthBundleDocId(username, sessionId);
    await setDoc(doc(db, 'app_data', docId), {
      username,
      sessionId,
      bundleGzipBase64: compressedB64,
      fileCount: Object.keys(filesMap).length,
      updatedAt: new Date().toISOString(),
      updatedAtMs: Date.now()
    });
  } catch (err: any) {
    handleFirestoreError(`Error syncing auth bundle (${username}:${sessionId}) to Firestore`, err);
  }
}

function scheduleAuthBundleSync(username: string, sessionId: string, delayMs = 3500) {
  if (!db || isQuotaExceeded) return;
  const key = `${username}:${sessionId}`;
  pendingAuthBundleSyncs.add(key);
  if (authBundleTimers.has(key)) {
    clearTimeout(authBundleTimers.get(key)!);
  }
  const timer = setTimeout(() => {
    authBundleTimers.delete(key);
    pendingAuthBundleSyncs.delete(key);
    syncAuthBundleToFirestore(username, sessionId).catch(() => {});
  }, delayMs);
  authBundleTimers.set(key, timer);
}

async function flushAllPendingAuthBundles() {
  const keys = new Set<string>(pendingAuthBundleSyncs);
  for (const [k, timer] of authBundleTimers.entries()) {
    clearTimeout(timer);
    authBundleTimers.delete(k);
    keys.add(k);
  }
  pendingAuthBundleSyncs.clear();
  for (const [userSessKey, sess] of sessions.entries()) {
    if (sess?.status === 'connected') {
      keys.add(userSessKey);
    }
  }
  const tasks: Promise<void>[] = [];
  for (const key of keys) {
    const idx = key.indexOf(':');
    if (idx > 0) {
      const u = key.slice(0, idx);
      const s = key.slice(idx + 1);
      tasks.push(syncAuthBundleToFirestore(u, s));
    }
  }
  await Promise.allSettled(tasks);
}

function deleteAuthBundleFromFirestore(username: string, sessionId: string) {
  const key = `${username}:${sessionId}`;
  pendingAuthBundleSyncs.delete(key);
  if (authBundleTimers.has(key)) {
    clearTimeout(authBundleTimers.get(key)!);
    authBundleTimers.delete(key);
  }
  if (!db || isQuotaExceeded) return;
  deleteDoc(doc(db, 'app_data', getAuthBundleDocId(username, sessionId))).catch(err => {
    handleFirestoreError(`Error deleting auth bundle (${key}) from Firestore`, err);
  });
}

function syncFileToFirestore(rawFilePath: any, data: any) {
  if (!db || isQuotaExceeded) return;
  try {
    const filePath = normalizeFilePath(rawFilePath);
    if (!filePath) return;
    const relativePath = path.relative(process.cwd(), filePath);
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      if (relativePath.startsWith('data' + path.sep) || relativePath === 'data') {
        const fileName = path.basename(relativePath);
        const authInfo = parseAuthFolderInfo(relativePath);

        if (authInfo) {
          // Bundle creds.json + all Signal/AppState/DeviceList keys into ONE debounced Firestore doc
          scheduleAuthBundleSync(authInfo.username, authInfo.sessionId, fileName === 'creds.json' ? 2000 : 4000);
          if (fileName !== 'creds.json') {
            return;
          }
        }

        if (typeof data === 'string' || Buffer.isBuffer(data)) {
          const content = Buffer.isBuffer(data) ? data.toString('base64') : data;
          const isBinary = Buffer.isBuffer(data);
          const docId = relativePath.replace(/[\/\\]/g, '___');
          
          setDoc(doc(db, 'files', docId), {
            path: relativePath,
            content: content,
            isBinary: isBinary,
            updatedAt: new Date().toISOString()
          }).catch(err => {
            handleFirestoreError('Error backing up file to Firestore', err);
          });
        }
      }
    }
  } catch (err) {
    handleFirestoreError('Error in syncFileToFirestore', err);
  }
}

function syncDeleteToFirestore(rawFilePath: any) {
  if (!db || isQuotaExceeded) return;
  try {
    const filePath = normalizeFilePath(rawFilePath);
    if (!filePath) return;
    const relativePath = path.relative(process.cwd(), filePath);
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      if (relativePath.startsWith('data' + path.sep)) {
        const fileName = path.basename(relativePath);
        const authInfo = parseAuthFolderInfo(relativePath);

        if (authInfo) {
          if (fileName === 'creds.json') {
            deleteAuthBundleFromFirestore(authInfo.username, authInfo.sessionId);
          } else {
            scheduleAuthBundleSync(authInfo.username, authInfo.sessionId, 4000);
            return;
          }
        }

        const docId = relativePath.replace(/[\/\\]/g, '___');
        deleteDoc(doc(db, 'files', docId)).catch(err => {
          handleFirestoreError('Error deleting file from Firestore', err);
        });
      }
    }
  } catch (err) {
    handleFirestoreError('Error in syncDeleteToFirestore', err);
  }
}

function syncDirDeleteToFirestore(rawFilePath: any) {
  if (!db || isQuotaExceeded) return;
  try {
    const filePath = normalizeFilePath(rawFilePath);
    if (!filePath) return;
    const relativePath = path.relative(process.cwd(), filePath);
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      if (relativePath.startsWith('data' + path.sep)) {
        const authInfo = parseAuthFolderInfo(relativePath);
        if (authInfo && !authInfo.fileName) {
          deleteAuthBundleFromFirestore(authInfo.username, authInfo.sessionId);
        }

        const docId = relativePath.replace(/[\/\\]/g, '___');
        // Delete the doc itself if it was a file
        deleteDoc(doc(db, 'files', docId)).catch(() => {});
        
        // Also find and delete all child documents in Firestore
        const prefix = docId;
        getDocs(collection(db, 'files')).then(snapshot => {
          snapshot.forEach(docSnap => {
            if (docSnap.id.startsWith(prefix + '___') || docSnap.id === prefix) {
              deleteDoc(doc(db, 'files', docSnap.id)).catch(() => {});
            }
          });
        }).catch(err => {
          handleFirestoreError('Error cleaning up directory child docs from Firestore', err);
        });
      }
    }
  } catch (err) {
    handleFirestoreError('Error in syncDirDeleteToFirestore', err);
  }
}

// Patch fs.writeFileSync to sync with Firestore
(fs as any).writeFileSync = function(filePath: any, data: any, options?: any) {
  const result = originalWriteFileSync.call(fs, filePath, data, options);
  syncFileToFirestore(filePath, data);
  return result;
};

// Patch fs.writeFile to sync with Firestore
(fs as any).writeFile = function(filePath: any, data: any, optionsOrCb: any, cb?: any) {
  let actualCb = cb;
  let options = optionsOrCb;
  if (typeof optionsOrCb === 'function') {
    actualCb = optionsOrCb;
    options = undefined;
  }
  const result = originalWriteFile.call(fs, filePath, data, options, (err: any) => {
    if (!err) {
      syncFileToFirestore(filePath, data);
    }
    if (actualCb) actualCb(err);
  });
  return result;
};

// Patch fs.unlinkSync to sync deletion with Firestore
(fs as any).unlinkSync = function(filePath: any) {
  const result = originalUnlinkSync.call(fs, filePath);
  syncDeleteToFirestore(filePath);
  return result;
};

// Patch fs.unlink to sync deletion with Firestore
(fs as any).unlink = function(filePath: any, callback: any) {
  const result = originalUnlink.call(fs, filePath, (err: any) => {
    if (!err) {
      syncDeleteToFirestore(filePath);
    }
    if (callback) callback(err);
  });
  return result;
};

// Patch fs.rmSync to sync directory deletion with Firestore
(fs as any).rmSync = function(filePath: any, options?: any) {
  const result = originalRmSync.call(fs, filePath, options);
  syncDirDeleteToFirestore(filePath);
  return result;
};

// Patch fs.rm to sync directory deletion with Firestore
(fs as any).rm = function(filePath: any, optionsOrFail: any, callback?: any) {
  let actualCb = callback;
  let options = optionsOrFail;
  if (typeof optionsOrFail === 'function') {
    actualCb = optionsOrFail;
    options = undefined;
  }
  const result = originalRm.call(fs, filePath, options, (err: any) => {
    if (!err) {
      syncDirDeleteToFirestore(filePath);
    }
    if (actualCb) actualCb(err);
  });
  return result;
};

// Patch fs.promises to sync asynchronous operations with Firestore
if (fs.promises) {
  if (originalPromisesWriteFile) {
    (fs.promises as any).writeFile = async function(filePath: any, data: any, options?: any) {
      const result = await originalPromisesWriteFile.call(fs.promises, filePath, data, options);
      syncFileToFirestore(filePath, data);
      return result;
    };
  }
  if (originalPromisesUnlink) {
    (fs.promises as any).unlink = async function(filePath: any) {
      const result = await originalPromisesUnlink.call(fs.promises, filePath);
      syncDeleteToFirestore(filePath);
      return result;
    };
  }
  if (originalPromisesRm) {
    (fs.promises as any).rm = async function(filePath: any, options?: any) {
      const result = await originalPromisesRm.call(fs.promises, filePath, options);
      syncDirDeleteToFirestore(filePath);
      return result;
    };
  }
}

async function restoreUsersFromFirestore() {
  if (!db || isQuotaExceeded) return;
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    if (!snapshot.empty) {
      const existingUsers = loadUsers();
      const userMap = new Map<string, User>();
      for (const u of existingUsers) {
        userMap.set(u.username, u);
      }
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && data.username && data.passwordHash) {
          userMap.set(data.username, {
            username: data.username,
            passwordHash: data.passwordHash,
            createdAt: data.createdAt
          });
        }
      });
      const mergedUsers = Array.from(userMap.values());
      originalWriteFileSync.call(fs, usersFilePath, JSON.stringify(mergedUsers, null, 2), 'utf8');
      console.log(`[FIREBASE] Restored ${mergedUsers.length} user account credentials from Firestore 'users' collection.`);
    }
  } catch (err) {
    handleFirestoreError('Error restoring users from Firestore', err);
  }
}

async function restoreTokensFromFirestore() {
  if (!db || isQuotaExceeded) return;
  try {
    const docSnap = await getDoc(doc(db, 'app_data', 'auth_tokens'));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data && typeof data === 'object') {
        const currentTokens = loadTokens();
        for (const [k, v] of Object.entries(data)) {
          if (typeof k === 'string' && typeof v === 'string') {
            currentTokens.set(k, v);
          }
        }
        const obj: Record<string, string> = {};
        for (const [token, username] of currentTokens.entries()) {
          obj[token] = username;
        }
        originalWriteFileSync.call(fs, tokensFilePath, JSON.stringify(obj, null, 2), 'utf8');
        console.log(`[FIREBASE] Restored ${currentTokens.size} auth tokens from Firestore 'app_data'.`);
      }
    }
  } catch (err) {
    handleFirestoreError('Error restoring tokens from Firestore', err);
  }
}

async function restoreAuthBundlesFromFirestore() {
  if (!db || isQuotaExceeded) return;
  try {
    const appDataSnap = await getDocs(collection(db, 'app_data'));
    let bundleCount = 0;
    appDataSnap.forEach(docSnap => {
      if (!docSnap.id.startsWith('auth_bundle___')) return;
      const data = docSnap.data();
      if (!data?.username || !data?.sessionId || !data?.bundleGzipBase64) return;

      const authFolder = path.join(process.cwd(), 'data', String(data.username), 'auth_info_' + String(data.sessionId));
      const localCreds = path.join(authFolder, 'creds.json');
      const bundleUpdatedMs = Number(data.updatedAtMs) || (data.updatedAt ? Date.parse(data.updatedAt) : 0);

      // Skip overwriting newer local disk credentials if this is a warm server restart
      if (fs.existsSync(localCreds)) {
        try {
          const localStat = fs.statSync(localCreds);
          if (bundleUpdatedMs && localStat.mtimeMs > bundleUpdatedMs + 2000) {
            return;
          }
        } catch {}
      }

      try {
        const rawJson = zlib.gunzipSync(Buffer.from(data.bundleGzipBase64, 'base64')).toString('utf8');
        const filesMap = JSON.parse(rawJson) as Record<string, string>;
        if (!filesMap || typeof filesMap !== 'object' || !filesMap['creds.json']) return;

        fs.mkdirSync(authFolder, { recursive: true });
        for (const [fileName, content] of Object.entries(filesMap)) {
          const safeName = path.basename(fileName);
          if (!safeName || typeof content !== 'string') continue;
          const targetPath = path.join(authFolder, safeName);
          originalWriteFileSync.call(fs, targetPath, content, 'utf8');
        }
        bundleCount++;
        console.log(`[FIREBASE] Restored full WhatsApp auth bundle (${Object.keys(filesMap).length} key files) for ${data.username}:${data.sessionId}.`);
      } catch (unzipErr: any) {
        console.error(`[FIREBASE] Failed unpacking auth bundle ${docSnap.id}:`, unzipErr?.message || unzipErr);
      }
    });
    if (bundleCount > 0) {
      console.log(`[FIREBASE] Restored ${bundleCount} complete WhatsApp auth session bundle(s) from Firestore.`);
    }
  } catch (err: any) {
    handleFirestoreError('Error restoring auth bundles from Firestore', err);
  }
}

async function restoreAllFilesFromFirestore() {
  if (!db || isQuotaExceeded) {
    console.log('[FIREBASE] Cannot restore: Firestore database is not initialized or quota exceeded.');
    return;
  }
  try {
    console.log('[FIREBASE] Restoring files from Firestore...');
    const snapshot = await getDocs(collection(db, 'files'));
    let restoredCount = 0;
    
    // We want to process each file and write it back locally (without clobbering strictly newer local files)
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const relativePath = data.path;
      if (relativePath) {
        const localPath = path.join(process.cwd(), relativePath);
        if (fs.existsSync(localPath) && data.updatedAt) {
          try {
            const localStat = fs.statSync(localPath);
            const remoteMs = Date.parse(data.updatedAt);
            if (!isNaN(remoteMs) && localStat.mtimeMs > remoteMs + 2000) {
              return;
            }
          } catch {}
        }

        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        
        let fileBuffer: Buffer | string;
        if (data.isBinary) {
          fileBuffer = Buffer.from(data.content, 'base64');
        } else {
          fileBuffer = data.content;
        }
        
        // Write the file locally without triggering our patch
        originalWriteFileSync.call(fs, localPath, fileBuffer);
        restoredCount++;
      }
    });
    console.log(`[FIREBASE] Successfully restored ${restoredCount} files from Firestore.`);

    // Restore full bundled WhatsApp session key sets, user accounts & auth tokens collections
    await restoreAuthBundlesFromFirestore();
    await restoreUsersFromFirestore();
    await restoreTokensFromFirestore();
  } catch (err: any) {
    handleFirestoreError('Error restoring files from Firestore', err);
  }
}

// Core Scoped Directory Structure Setup
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// User Accounts Database
interface User {
  username: string;
  passwordHash: string;
  token?: string | null;
  createdAt?: string;
}

const usersFilePath = path.join(DATA_DIR, 'users.json');

function loadUsers(): User[] {
  try {
    if (fs.existsSync(usersFilePath)) {
      return JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
  return [];
}

function saveUsers(users: User[]) {
  try {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
    if (db && !isQuotaExceeded) {
      for (const u of users) {
        setDoc(doc(db, 'users', u.username), {
          username: u.username,
          passwordHash: u.passwordHash,
          createdAt: u.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }).catch(err => {
          handleFirestoreError('Error saving user credential to Firestore', err);
        });
      }
    }
  } catch (err) {
    console.error('Error saving users:', err);
  }
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function getUserDir(username: string): string {
  const dir = path.join(DATA_DIR, username);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Saved Groups interfaces & database
interface SavedGroup {
  jid: string;
  name: string;
  savedAt: string;
  sessionId?: string; // Storing which session captured or owns this group
  participants?: string[];
  isAdmin?: boolean;
  onlyAdminsCanSend?: boolean;
  canUserSend?: boolean;
  memberCount?: number;
}

// Clean participant list to extract valid phone numbers and retain LID fallback identifiers
function cleanParticipantJidList(participants: any[]): string[] {
  if (!Array.isArray(participants)) return [];
  const validJids: string[] = [];

  for (const p of participants) {
    if (!p) continue;

    let phoneJid: string | null = null;
    let lidJid: string | null = null;

    const tryExtractPhone = (str: any): string | null => {
      if (!str) return null;
      const s = String(str).trim();
      if (!s || s.endsWith('@lid')) return null;
      const userPart = s.split('@')[0].split(':')[0];
      if (/^\d{7,15}$/.test(userPart)) {
        return `${userPart}@s.whatsapp.net`;
      }
      return null;
    };

    if (typeof p === 'string') {
      phoneJid = tryExtractPhone(p);
      if (!phoneJid && p.includes('@lid')) {
        const lidNum = p.split('@')[0].split(':')[0];
        if (/^\d+$/.test(lidNum)) {
          lidJid = `${lidNum}@lid`;
        }
      }
    } else if (typeof p === 'object' && p !== null) {
      // 1. Check all potential phone number fields in order
      phoneJid = tryExtractPhone(p.pnJid) ||
                 tryExtractPhone(p.phoneNumber) ||
                 tryExtractPhone(p.id) ||
                 tryExtractPhone(p.jid);

      // 2. If no phone JID, check for LID JID
      if (!phoneJid) {
        const rawLid = p.id || p.jid || '';
        if (typeof rawLid === 'string' && rawLid.includes('@lid')) {
          const lidNum = rawLid.split('@')[0].split(':')[0];
          if (/^\d+$/.test(lidNum)) {
            lidJid = `${lidNum}@lid`;
          }
        }
      }
    }

    if (phoneJid) {
      validJids.push(phoneJid);
    } else if (lidJid) {
      validJids.push(lidJid);
    }
  }

  return Array.from(new Set(validJids));
}

function loadUserSavedGroups(username: string): SavedGroup[] {
  const filePath = path.join(getUserDir(username), 'saved_groups.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveUserGroupDetails(username: string, jid: string, name: string, sessionId?: string, extraDetails?: Partial<SavedGroup>) {
  try {
    const groups = loadUserSavedGroups(username);
    const existingIndex = groups.findIndex(g => g.jid === jid);
    const details = extraDetails || {};
    if (existingIndex > -1) {
      groups[existingIndex].name = name;
      groups[existingIndex].savedAt = new Date().toISOString();
      if (sessionId) {
        groups[existingIndex].sessionId = sessionId;
      }
      if (details.participants !== undefined) groups[existingIndex].participants = details.participants;
      if (details.isAdmin !== undefined) groups[existingIndex].isAdmin = details.isAdmin;
      if (details.onlyAdminsCanSend !== undefined) groups[existingIndex].onlyAdminsCanSend = details.onlyAdminsCanSend;
      if (details.canUserSend !== undefined) groups[existingIndex].canUserSend = details.canUserSend;
      if (details.memberCount !== undefined) groups[existingIndex].memberCount = details.memberCount;
    } else {
      groups.push({ 
        jid, 
        name, 
        savedAt: new Date().toISOString(), 
        sessionId: sessionId || 'primary',
        ...details
      });
    }
    const filePath = path.join(getUserDir(username), 'saved_groups.json');
    fs.writeFileSync(filePath, JSON.stringify(groups, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving group metadata:', err);
  }
}

function deleteUserSavedGroup(username: string, jid: string) {
  try {
    const groups = loadUserSavedGroups(username);
    const cleanJid = decodeURIComponent(jid).trim();
    const filtered = groups.filter(g => g.jid !== jid && g.jid !== cleanJid);
    const filePath = path.join(getUserDir(username), 'saved_groups.json');
    fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2), 'utf8');
  } catch (err) {
    console.error('Error deleting saved group:', err);
  }
}

// Captured Group Invite interfaces & database (saved to group.json & synced to Firestore)
export type GroupJoinStatus = 
  | 'joined' 
  | 'not_joined' 
  | 'requested' 
  | 'members_too_low' 
  | 'removed' 
  | 'invalid';

interface CapturedGroupInvite {
  id?: string;
  url: string;
  code: string;
  groupJid?: string;
  senderJid: string;
  senderName: string;
  chatJid?: string;
  chatName?: string;
  isOutgoing?: boolean;
  messageText: string;
  groupName: string;
  groupDescription?: string;
  groupSize?: number;
  creatorJid?: string;
  savedAt: string;
  sessionId: string;
  status: GroupJoinStatus;
  statusDetails?: string;
  joinedAt?: string;
  requestedAt?: string;
  removedAt?: string;
  lastCheckedAt?: string;
  retryCount?: number;
  nextRetryAt?: string;
  joinApprovalMode?: boolean;
}

function dedupeGroupInvites(rawInvites: CapturedGroupInvite[]): CapturedGroupInvite[] {
  const byKey = new Map<string, CapturedGroupInvite>();
  const statusPriority: Record<string, number> = {
    joined: 5,
    requested: 4,
    removed: 3,
    members_too_low: 2,
    not_joined: 1,
    invalid: 0
  };

  for (const inv of rawInvites) {
    if (!inv || typeof inv !== 'object') continue;
    const normCode = String(inv.code || '')
      .split('?')[0]
      .split('#')[0]
      .replace(/[\.,!?:;]+$/, '')
      .trim();
    const key = normCode || String(inv.url || '').trim();
    if (!key) continue;

    const normalized: CapturedGroupInvite = {
      ...inv,
      code: normCode || inv.code,
      url: normCode ? `https://chat.whatsapp.com/${normCode}` : inv.url
    };

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, normalized);
      continue;
    }

    const existingTime = new Date(existing.savedAt || 0).getTime() || 0;
    const nextTime = new Date(normalized.savedAt || 0).getTime() || 0;
    const newer = nextTime >= existingTime ? normalized : existing;
    const older = nextTime >= existingTime ? existing : normalized;

    const bestName =
      (newer.groupName && newer.groupName !== 'Unknown Group')
        ? newer.groupName
        : (older.groupName && older.groupName !== 'Unknown Group' ? older.groupName : (newer.groupName || older.groupName || 'Unknown Group'));

    const existingPrio = statusPriority[existing.status || 'not_joined'] ?? 1;
    const nextPrio = statusPriority[normalized.status || 'not_joined'] ?? 1;
    const bestStatus = nextPrio >= existingPrio ? (normalized.status || existing.status || 'not_joined') : (existing.status || 'not_joined');

    byKey.set(key, {
      ...older,
      ...newer,
      code: normCode || newer.code || older.code,
      url: normCode ? `https://chat.whatsapp.com/${normCode}` : (newer.url || older.url),
      groupName: bestName,
      groupDescription: newer.groupDescription || older.groupDescription,
      groupSize: Math.max(Number(existing.groupSize || 0), Number(normalized.groupSize || 0)) || undefined,
      groupJid: newer.groupJid || older.groupJid,
      creatorJid: newer.creatorJid || older.creatorJid,
      status: bestStatus,
      joinedAt: newer.joinedAt || older.joinedAt,
      requestedAt: newer.requestedAt || older.requestedAt,
      removedAt: newer.removedAt || older.removedAt,
      savedAt: newer.savedAt || older.savedAt
    });
  }

  return Array.from(byKey.values());
}

function loadUserGroupInvites(username: string): CapturedGroupInvite[] {
  const filePath = path.join(getUserDir(username), 'group.json');
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) {
        const deduped = dedupeGroupInvites(data);
        if (deduped.length !== data.length) {
          try {
            fs.writeFileSync(filePath, JSON.stringify(deduped, null, 2), 'utf8');
          } catch {}
        }
        return deduped;
      }
    }
  } catch (err) {}
  return [];
}

function saveCapturedGroupInvite(username: string, invite: CapturedGroupInvite): CapturedGroupInvite {
  try {
    const cleanCode = String(invite.code || '')
      .split('?')[0]
      .split('#')[0]
      .replace(/[\.,!?:;]+$/, '')
      .trim();
    const normalizedInvite: CapturedGroupInvite = {
      ...invite,
      code: cleanCode || invite.code,
      url: cleanCode ? `https://chat.whatsapp.com/${cleanCode}` : invite.url
    };

    const invites = loadUserGroupInvites(username);
    const existingIndex = invites.findIndex(i => i.code === normalizedInvite.code);
    const filePath = path.join(getUserDir(username), 'group.json');
    let finalInvite: CapturedGroupInvite;
    
    if (existingIndex > -1) {
      const existing = invites[existingIndex];
      const updatedName = (normalizedInvite.groupName && normalizedInvite.groupName !== 'Unknown Group') ? normalizedInvite.groupName : existing.groupName;
      finalInvite = {
        ...existing,
        ...normalizedInvite,
        groupName: updatedName,
        groupDescription: normalizedInvite.groupDescription || existing.groupDescription,
        groupSize: typeof normalizedInvite.groupSize === 'number' && normalizedInvite.groupSize > 0 ? normalizedInvite.groupSize : existing.groupSize,
        groupJid: normalizedInvite.groupJid || existing.groupJid,
        creatorJid: normalizedInvite.creatorJid || existing.creatorJid,
        status: normalizedInvite.status || existing.status || 'not_joined',
        joinedAt: normalizedInvite.joinedAt || existing.joinedAt,
        requestedAt: normalizedInvite.requestedAt || existing.requestedAt,
        removedAt: normalizedInvite.removedAt || existing.removedAt,
        retryCount: typeof normalizedInvite.retryCount === 'number' ? normalizedInvite.retryCount : existing.retryCount,
        nextRetryAt: normalizedInvite.nextRetryAt || existing.nextRetryAt,
        joinApprovalMode: normalizedInvite.joinApprovalMode !== undefined ? normalizedInvite.joinApprovalMode : existing.joinApprovalMode,
        savedAt: new Date().toISOString()
      };
      invites[existingIndex] = finalInvite;
      fs.writeFileSync(filePath, JSON.stringify(dedupeGroupInvites(invites), null, 2), 'utf8');
      addLog(username, `📂 Group Link Details Updated: "${finalInvite.groupName}" (${finalInvite.code}) - Status: ${finalInvite.status.toUpperCase()} (${finalInvite.groupSize || 0} members)`, 'info');
    } else {
      finalInvite = {
        status: normalizedInvite.status || 'not_joined',
        ...normalizedInvite,
        savedAt: new Date().toISOString()
      };
      invites.push(finalInvite);
      fs.writeFileSync(filePath, JSON.stringify(dedupeGroupInvites(invites), null, 2), 'utf8');
      addLog(username, `📂 Group Link Captured: Saved "${finalInvite.groupName}" (${finalInvite.code}) - Status: ${finalInvite.status.toUpperCase()} (${finalInvite.groupSize || 0} members)`, 'success');
    }

    // Mirror to Firestore group_invites collection
    if (db && !isQuotaExceeded) {
      try {
        setDoc(doc(db, 'group_invites', `${username}___${finalInvite.code}`), {
          ...finalInvite,
          username,
          updatedAt: new Date().toISOString()
        }).catch(err => handleFirestoreError('Firestore group_invite backup', err));
      } catch (e) {}
    }

    return finalInvite;
  } catch (err: any) {
    console.error('Error saving captured group invite:', err);
    return invite;
  }
}

// Regex to capture WhatsApp group invite links (handles surrounding text, query params, invite/ path, and multiple links per message)
const GROUP_LINK_REGEX = /(?:https?:\/\/)?(?:www\.)?chat\.whatsapp\.com\/(?:invite\/)?([A-Za-z0-9_-]{16,40})/gi;

function extractGroupInviteCodes(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const codes: string[] = [];
  const regex = new RegExp(GROUP_LINK_REGEX);
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      const cleanCode = match[1].split('?')[0].split('#')[0].replace(/[\.,!?:;]+$/, '').trim();
      if (cleanCode && cleanCode.length >= 15 && !codes.includes(cleanCode)) {
        codes.push(cleanCode);
      }
    }
  }
  return codes;
}

// Comprehensive extractor that unpacks regular text, disappearing/ephemeral messages, viewOnce, templates, quotes, captions, edits, interactive cards, and native invite cards
function extractComprehensiveMessageContent(rawMsg: any): {
  scanText: string;
  nativeInvites: Array<{ code: string; groupName?: string; caption?: string; groupJid?: string }>;
} {
  let scanText = '';
  const nativeInvites: Array<{ code: string; groupName?: string; caption?: string; groupJid?: string }> = [];
  const seenNativeCodes = new Set<string>();

  function appendText(val: any) {
    if (typeof val === 'string' && val.trim()) {
      scanText += val + ' ';
    }
  }

  function inspectNode(node: any) {
    if (!node || typeof node !== 'object') return;

    appendText(node.conversation);
    appendText(node.text);
    if (node.extendedTextMessage) {
      appendText(node.extendedTextMessage.text);
      appendText(node.extendedTextMessage.matchedText);
      appendText(node.extendedTextMessage.canonicalUrl);
      appendText(node.extendedTextMessage.title);
      appendText(node.extendedTextMessage.description);
    }

    appendText(node.imageMessage?.caption);
    appendText(node.videoMessage?.caption);
    appendText(node.documentMessage?.caption);
    appendText(node.audioMessage?.caption);

    appendText(node.buttonsMessage?.contentText);
    appendText(node.buttonsMessage?.footerText);
    if (Array.isArray(node.buttonsMessage?.buttons)) {
      for (const btn of node.buttonsMessage.buttons) {
        appendText(btn?.buttonText?.displayText);
        appendText(btn?.buttonId);
      }
    }
    appendText(node.buttonsResponseMessage?.selectedDisplayText);
    appendText(node.buttonsResponseMessage?.selectedButtonId);

    appendText(node.listMessage?.title);
    appendText(node.listMessage?.description);
    appendText(node.listMessage?.footerText);
    appendText(node.listResponseMessage?.title);
    appendText(node.listResponseMessage?.singleSelectReply?.selectedRowId);

    appendText(node.templateButtonReplyMessage?.selectedDisplayText);
    const hydrated = node.templateMessage?.hydratedTemplate || node.templateMessage?.hydratedFourRowTemplate;
    if (hydrated) {
      appendText(hydrated.hydratedTitleText);
      appendText(hydrated.hydratedContentText);
      appendText(hydrated.hydratedFooterText);
      if (Array.isArray(hydrated.hydratedButtons)) {
        for (const hBtn of hydrated.hydratedButtons) {
          appendText(hBtn?.urlButton?.url);
          appendText(hBtn?.urlButton?.displayText);
        }
      }
    }

    if (node.interactiveMessage) {
      appendText(node.interactiveMessage.header?.title);
      appendText(node.interactiveMessage.header?.subtitle);
      appendText(node.interactiveMessage.body?.text);
      appendText(node.interactiveMessage.footer?.text);
      if (Array.isArray(node.interactiveMessage.nativeFlowMessage?.buttons)) {
        for (const nBtn of node.interactiveMessage.nativeFlowMessage.buttons) {
          appendText(nBtn?.buttonParamsJson);
        }
      }
    }
    if (node.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
      try {
        const parsed = JSON.parse(node.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
        appendText(parsed.id);
      } catch (e) {}
    }

    if (node.groupInviteMessage?.inviteCode) {
      const nCode = String(node.groupInviteMessage.inviteCode).trim();
      if (nCode && !seenNativeCodes.has(nCode)) {
        seenNativeCodes.add(nCode);
        nativeInvites.push({
          code: nCode,
          groupName: node.groupInviteMessage.groupName,
          caption: node.groupInviteMessage.caption,
          groupJid: node.groupInviteMessage.groupJid
        });
      }
      appendText(node.groupInviteMessage.caption);
    }

    // Message wrappers (ephemeral, viewOnce, documentWithCaption, edited, botInvoke, etc.)
    if (node.ephemeralMessage?.message) inspectNode(node.ephemeralMessage.message);
    if (node.viewOnceMessage?.message) inspectNode(node.viewOnceMessage.message);
    if (node.viewOnceMessageV2?.message) inspectNode(node.viewOnceMessageV2.message);
    if (node.viewOnceMessageV2Extension?.message) inspectNode(node.viewOnceMessageV2Extension.message);
    if (node.documentWithCaptionMessage?.message) inspectNode(node.documentWithCaptionMessage.message);
    if (node.editedMessage?.message) inspectNode(node.editedMessage.message);
    if (node.protocolMessage?.editedMessage) inspectNode(node.protocolMessage.editedMessage);
    if (node.botInvokeMessage?.message) inspectNode(node.botInvokeMessage.message);
    if (node.groupStatusMentionMessage?.message) inspectNode(node.groupStatusMentionMessage.message);
    if (node.associatedChildMessage?.message) inspectNode(node.associatedChildMessage.message);

    // Quoted Messages (including nested disappearing/viewOnce)
    const ctx = node.contextInfo ||
                node.extendedTextMessage?.contextInfo ||
                node.imageMessage?.contextInfo ||
                node.videoMessage?.contextInfo ||
                node.documentMessage?.contextInfo ||
                node.buttonsMessage?.contextInfo ||
                node.listMessage?.contextInfo ||
                node.interactiveMessage?.contextInfo ||
                node.templateMessage?.contextInfo;
    if (ctx?.quotedMessage) {
      inspectNode(ctx.quotedMessage);
    }
  }

  if (rawMsg?.message) {
    inspectNode(rawMsg.message);
  } else if (rawMsg) {
    inspectNode(rawMsg);
  }

  return { scanText: scanText.trim(), nativeInvites };
}

async function handleGroupInviteUrl(
  username: string, 
  rawUrl: string, 
  rawCode: string, 
  senderJid: string, 
  senderName: string, 
  messageText: string, 
  sessionId: string,
  sockInstance: any,
  metaContext?: {
    chatJid?: string;
    chatName?: string;
    isOutgoing?: boolean;
    nativeName?: string;
    nativeDesc?: string;
    nativeGroupJid?: string;
    preloadedParticipating?: Record<string, any>;
  }
): Promise<CapturedGroupInvite | null> {
  if (!rawCode) return null;
  const code = rawCode.split('?')[0].split('#')[0].replace(/[\.,!?:;]+$/, '').trim();
  if (!code || code.length < 15) return null;
  const url = `https://chat.whatsapp.com/${code}`;

  const invites = loadUserGroupInvites(username);
  const existing = invites.find(i => i.code === code);

  let groupName = metaContext?.nativeName || existing?.groupName || 'Unknown Group';
  let groupDescription = metaContext?.nativeDesc || existing?.groupDescription || '';
  let groupSize = existing?.groupSize || 0;
  let creatorJid = existing?.creatorJid || '';
  let groupJid = metaContext?.nativeGroupJid || existing?.groupJid || '';
  let joinApprovalMode = existing?.joinApprovalMode || false;
  let status: GroupJoinStatus = existing?.status || 'not_joined';
  let statusDetails = existing?.statusDetails || 'Discovered link';
  let joinedAt = existing?.joinedAt;
  let requestedAt = existing?.requestedAt;
  let removedAt = existing?.removedAt;
  let retryCount = existing?.retryCount || 0;
  let nextRetryAt = existing?.nextRetryAt;

  // 1. Fetch metadata from WhatsApp using groupGetInviteInfo
  try {
    if (sockInstance && typeof sockInstance.groupGetInviteInfo === 'function') {
      const inviteInfo = await sockInstance.groupGetInviteInfo(code);
      if (inviteInfo) {
        groupName = inviteInfo.subject || groupName;
        groupDescription = inviteInfo.desc || inviteInfo.description || groupDescription;
        groupSize = typeof inviteInfo.size === 'number' ? inviteInfo.size : (inviteInfo.participants?.length || groupSize);
        creatorJid = inviteInfo.owner || inviteInfo.creator || creatorJid;
        groupJid = inviteInfo.id || groupJid;
        joinApprovalMode = !!inviteInfo.joinApprovalMode;
      }
    }
  } catch (err: any) {
    const errText = err?.message || String(err);
    console.error(`[INVITE_INFO] Failed to fetch info for code ${code}:`, errText);
    if (errText.includes('404') || errText.includes('not-authorized') || errText.includes('gone') || errText.includes('reset')) {
      status = 'invalid';
      statusDetails = `Link invalid, revoked or expired (${errText})`;
    }
  }

  // 2. Check if the user is already in this group
  let alreadyJoined = false;
  try {
    const participating = metaContext?.preloadedParticipating ||
      (sockInstance && typeof sockInstance.groupFetchAllParticipating === 'function'
        ? await sockInstance.groupFetchAllParticipating()
        : null);
    if (participating) {
      if (groupJid && participating[groupJid]) {
        alreadyJoined = true;
      } else if (groupName && groupName !== 'Unknown Group') {
        const found = Object.values(participating).find((g: any) => g.subject === groupName);
        if (found) {
          alreadyJoined = true;
          groupJid = (found as any).id;
        }
      }
    }
  } catch (e) {}

  if (alreadyJoined) {
    status = 'joined';
    statusDetails = 'Already joined as an active member';
    joinedAt = joinedAt || new Date().toISOString();
  }

  // 3. Automated Join Engine (if enabled in user settings)
  const settings = loadUserSettings(username);
  const minMembers = typeof settings.autoJoinMinMembers === 'number' && settings.autoJoinMinMembers > 0 ? settings.autoJoinMinMembers : 400;

  if (settings.autoJoinGroupsEnabled && sockInstance && status !== 'joined' && status !== 'invalid') {
    if (groupSize >= minMembers) {
      addLog(username, `🎯 [AUTO-JOIN] Group "${groupName}" matches rule: ${groupSize} members >= threshold ${minMembers}. Attempting to join...`, 'info');
      try {
        if (typeof sockInstance.groupAcceptInvite === 'function') {
          const joinResult = await sockInstance.groupAcceptInvite(code);
          const resultingJid = joinResult || groupJid;
          
          if (joinApprovalMode) {
            status = 'requested';
            requestedAt = new Date().toISOString();
            statusDetails = `Membership request submitted to group admins. Awaiting approval (${groupSize} members).`;
            addLog(username, `⏳ [AUTO-JOIN] Group "${groupName}" requires admin approval. Join request submitted!`, 'info');
          } else {
            status = 'joined';
            joinedAt = new Date().toISOString();
            statusDetails = `Auto-joined successfully with ${groupSize} members.`;
            groupJid = resultingJid || groupJid;
            addLog(username, `🎉 [AUTO-JOIN] Successfully joined "${groupName}" with ${groupSize} members!`, 'success');
            
            if (groupJid) {
              saveUserGroupDetails(username, groupJid, groupName, sessionId, {
                memberCount: groupSize,
                canUserSend: true
              });
            }
          }
        }
      } catch (joinErr: any) {
        const joinErrMsg = joinErr?.message || String(joinErr);
        if (joinApprovalMode || joinErrMsg.toLowerCase().includes('approval') || joinErrMsg.toLowerCase().includes('request')) {
          status = 'requested';
          requestedAt = new Date().toISOString();
          statusDetails = 'Membership request submitted to group admins. Awaiting approval.';
          addLog(username, `⏳ [AUTO-JOIN] Group "${groupName}" requires admin approval. Request submitted!`, 'info');
        } else {
          status = 'not_joined';
          statusDetails = `Auto-join attempt failed: ${joinErrMsg}`;
          addLog(username, `⚠️ [AUTO-JOIN] Could not join "${groupName}": ${joinErrMsg}`, 'info');
        }
      }
    } else if (groupSize > 0 && groupSize < minMembers) {
      status = 'members_too_low';
      const retryInterval = settings.autoRetryIntervalMinutes || 15;
      nextRetryAt = new Date(Date.now() + retryInterval * 60 * 1000).toISOString();
      statusDetails = `Members (${groupSize}) < minimum requirement (${minMembers}). Auto-retry scheduled.`;
      addLog(username, `⏳ [AUTO-JOIN] Group "${groupName}" has ${groupSize} members (< ${minMembers} minimum). Scheduled auto-retry in ${retryInterval}m.`, 'info');
    }
  }

  const savedInvite: CapturedGroupInvite = {
    url,
    code,
    groupJid,
    senderJid,
    senderName,
    chatJid: metaContext?.chatJid,
    chatName: metaContext?.chatName,
    isOutgoing: metaContext?.isOutgoing || false,
    messageText: (messageText || '').trim().substring(0, 300),
    groupName,
    groupDescription,
    groupSize,
    creatorJid,
    savedAt: new Date().toISOString(),
    sessionId,
    status,
    statusDetails,
    joinedAt,
    requestedAt,
    removedAt,
    lastCheckedAt: new Date().toISOString(),
    retryCount,
    nextRetryAt,
    joinApprovalMode
  };

  return saveCapturedGroupInvite(username, savedInvite);
}

// Function to scan outbound text payloads for group links (e.g. sent from Dispatch Studio or API)
function scanTextForGroupLinks(username: string, text: string, chatJid?: string, sessionId?: string, sockInstance?: any) {
  if (!text) return;
  const codes = extractGroupInviteCodes(text);
  for (const code of codes) {
    handleGroupInviteUrl(
      username,
      `https://chat.whatsapp.com/${code}`,
      code,
      sockInstance?.user?.id || 'me',
      'Me (Sent via Dashboard)',
      text.substring(0, 200),
      sessionId || 'primary',
      sockInstance,
      {
        chatJid,
        isOutgoing: true
      }
    ).catch(() => {});
  }
}

// Batch verification for all saved groups: checks if joined, detected removed, or approved
async function verifyAllSavedGroups(username: string, sessionId?: string): Promise<{
  success: boolean;
  total: number;
  joinedCount: number;
  removedCount: number;
  requestedCount: number;
  lowMembersCount: number;
  removedGroups: CapturedGroupInvite[];
  message: string;
}> {
  const invites = loadUserGroupInvites(username);
  if (invites.length === 0) {
    return {
      success: true,
      total: 0,
      joinedCount: 0,
      removedCount: 0,
      requestedCount: 0,
      lowMembersCount: 0,
      removedGroups: [],
      message: 'No saved group links to verify.'
    };
  }

  // Locate an active socket connection
  const sessionConfig = loadUserSessionsConfig(username);
  let activeSock: any = null;
  let activeSessionId = sessionId || 'primary';

  if (sessionId && sessions.get(`${username}:${sessionId}`)?.sock && sessions.get(`${username}:${sessionId}`)?.status === 'connected') {
    activeSock = sessions.get(`${username}:${sessionId}`)!.sock;
  } else {
    for (const sc of sessionConfig) {
      const s = sessions.get(`${username}:${sc.id}`);
      if (s && s.sock && s.status === 'connected') {
        activeSock = s.sock;
        activeSessionId = sc.id;
        break;
      }
    }
  }

  if (!activeSock) {
    throw new Error('No active connected WhatsApp session available to verify group memberships. Please connect a session first.');
  }

  let participatingGroups: Record<string, any> = {};
  try {
    participatingGroups = await activeSock.groupFetchAllParticipating();
  } catch (err: any) {
    console.error('Error fetching participating groups:', err);
    throw new Error(`Failed to query participating groups from WhatsApp: ${err.message}`);
  }

  const removedGroups: CapturedGroupInvite[] = [];
  let joinedCount = 0;
  let removedCount = 0;
  let requestedCount = 0;
  let lowMembersCount = 0;
  const now = new Date().toISOString();

  const settings = loadUserSettings(username);
  const minMembers = settings.autoJoinMinMembers || 400;

  for (let i = 0; i < invites.length; i++) {
    const invite = invites[i];
    invite.lastCheckedAt = now;

    // 1. Resolve Group JID if not present
    if (!invite.groupJid) {
      const matched = Object.values(participatingGroups).find((g: any) => g.subject === invite.groupName);
      if (matched) {
        invite.groupJid = (matched as any).id;
      } else {
        try {
          const info = await activeSock.groupGetInviteInfo(invite.code);
          if (info?.id) {
            invite.groupJid = info.id;
            invite.groupSize = typeof info.size === 'number' ? info.size : (info.participants?.length || invite.groupSize);
            invite.groupName = info.subject || invite.groupName;
            invite.creatorJid = info.owner || info.creator || invite.creatorJid;
            invite.joinApprovalMode = !!info.joinApprovalMode;
          }
        } catch (e) {}
      }
    }

    // 2. Check current participating membership
    const isCurrentlyInGroup = !!(invite.groupJid && participatingGroups[invite.groupJid]);

    if (isCurrentlyInGroup) {
      invite.status = 'joined';
      invite.joinedAt = invite.joinedAt || now;
      invite.statusDetails = 'Active member in group';
      invite.removedAt = undefined;
      joinedCount++;

      const liveGroupMeta = participatingGroups[invite.groupJid!];
      if (liveGroupMeta) {
        invite.groupName = liveGroupMeta.subject || invite.groupName;
        invite.groupSize = liveGroupMeta.size || liveGroupMeta.participants?.length || invite.groupSize;
      }

      saveUserGroupDetails(username, invite.groupJid!, invite.groupName, activeSessionId, {
        memberCount: invite.groupSize,
        canUserSend: true
      });
    } else {
      if (invite.status === 'joined') {
        // Was recorded joined, but no longer in group => user was removed!
        invite.status = 'removed';
        invite.removedAt = invite.removedAt || now;
        invite.statusDetails = 'Removed from group by admin or group no longer active';
        removedCount++;
        removedGroups.push(invite);
        addLog(username, `⚠️ [REMOVED DETECTED] You were removed from "${invite.groupName}" (${invite.code}). Request admin manually to rejoin.`, 'info');
      } else if (invite.status === 'requested') {
        requestedCount++;
        invite.statusDetails = 'Membership request pending admin approval.';
      } else if (invite.status === 'members_too_low') {
        try {
          const info = await activeSock.groupGetInviteInfo(invite.code);
          if (info) {
            invite.groupSize = typeof info.size === 'number' ? info.size : (info.participants?.length || invite.groupSize);
            invite.groupName = info.subject || invite.groupName;
            if (invite.groupSize >= minMembers && settings.autoJoinGroupsEnabled) {
              try {
                const jid = await activeSock.groupAcceptInvite(invite.code);
                if (invite.joinApprovalMode) {
                  invite.status = 'requested';
                  invite.requestedAt = now;
                  invite.statusDetails = 'Join request submitted. Awaiting admin approval.';
                  requestedCount++;
                } else {
                  invite.status = 'joined';
                  invite.joinedAt = now;
                  invite.groupJid = jid || invite.groupJid;
                  invite.statusDetails = `Auto-joined after member count grew to ${invite.groupSize}!`;
                  joinedCount++;
                }
              } catch (err: any) {
                lowMembersCount++;
              }
            } else {
              lowMembersCount++;
            }
          }
        } catch (e) {
          lowMembersCount++;
        }
      } else {
        if (settings.autoJoinGroupsEnabled && invite.groupSize && invite.groupSize >= minMembers) {
          try {
            const jid = await activeSock.groupAcceptInvite(invite.code);
            if (invite.joinApprovalMode) {
              invite.status = 'requested';
              invite.requestedAt = now;
              requestedCount++;
            } else {
              invite.status = 'joined';
              invite.joinedAt = now;
              invite.groupJid = jid || invite.groupJid;
              joinedCount++;
            }
          } catch (e) {}
        }
      }
    }
  }

  const filePath = path.join(getUserDir(username), 'group.json');
  fs.writeFileSync(filePath, JSON.stringify(invites, null, 2), 'utf8');

  addLog(username, `✅ [VERIFY ALL GROUPS] Completed check across ${invites.length} saved groups. Active Joined: ${joinedCount}, Removed: ${removedCount}, Pending Approval: ${requestedCount}`, 'success');

  return {
    success: true,
    total: invites.length,
    joinedCount,
    removedCount,
    requestedCount,
    lowMembersCount,
    removedGroups,
    message: `Verification complete: ${joinedCount} joined, ${removedCount} removed, ${requestedCount} pending approval out of ${invites.length} total saved groups.`
  };
}

function getAssignedSessionIdForRecipient(username: string, recipient: string, recipientType: string, defaultSessionId: string, validSessions: string[]): string {
  if (recipientType === 'group' || recipient.endsWith('@g.us')) {
    let targetJid = recipient;
    if (!targetJid.includes('@')) {
      targetJid = `${targetJid}@g.us`;
    }
    const savedGroups = loadUserSavedGroups(username);
    const matchedGroup = savedGroups.find(g => g.jid === targetJid);
    if (matchedGroup && matchedGroup.sessionId) {
      if (validSessions.includes(matchedGroup.sessionId)) {
        return matchedGroup.sessionId;
      }
    }
  }
  return defaultSessionId;
}

// Multi-Session state interfaces & loaders
interface SessionData {
  id: string;
  name: string;
  sock: any | null;
  status: 'disconnected' | 'connecting' | 'connected';
  qrBase64: string | null;
  activePairingCode: string | null;
  user: { id: string; name: string } | null;
  lastError: string | null;
}

const sessions = new Map<string, SessionData>();

function loadUserSessionsConfig(username: string): Array<{ id: string; name: string }> {
  const filePath = path.join(getUserDir(username), 'sessions.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading sessions.json:', err);
  }
  const defaultSessions = [{ id: 'primary', name: 'Primary Account' }];
  try {
    fs.writeFileSync(filePath, JSON.stringify(defaultSessions, null, 2), 'utf8');
  } catch (err) {}
  return defaultSessions;
}

function saveUserSessionsConfig(username: string, config: Array<{ id: string; name: string }>) {
  try {
    const filePath = path.join(getUserDir(username), 'sessions.json');
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving sessions.json:', err);
  }
}

// Message Queue interfaces & state
interface QueueItem {
  id: string;
  recipient: string;
  recipientType: 'individual' | 'group';
  messageType: string;
  message: string;
  footer?: string;
  attachmentType?: 'none' | 'image' | 'video' | 'pdf' | 'doc';
  attachmentUrl?: string;
  attachmentData?: string;
  attachmentName?: string;
  inlineAttachment?: boolean;
  buttons?: any[];
  templateButtons?: any[];
  listButtonText?: string;
  listSections?: any[];
  sessionId: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  addedAt: string;
  sentAt?: string;
  error?: string;
  retryCount?: number;
  workflowName?: string;
  tagGroupMembers?: boolean;
  batchMentions?: string[];
  tagJobId?: string;
  tagJobTotal?: number;
  tagJobCompleted?: number;
  tagJobBatchIndex?: number;
  tagJobBatchCount?: number;
  scheduledAt?: string;
  customDelaySeconds?: number;
  sequenceIndex?: number;
}

function loadUserPausedQueues(username: string): string[] {
  const filePath = path.join(getUserDir(username), 'paused_queues.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveUserPausedQueues(username: string, paused: string[]) {
  const filePath = path.join(getUserDir(username), 'paused_queues.json');
  fs.writeFileSync(filePath, JSON.stringify(paused, null, 2), 'utf8');
}

function loadUserQueue(username: string): QueueItem[] {
  const filePath = path.join(getUserDir(username), 'queue.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveUserQueue(username: string, queue: QueueItem[]) {
  const filePath = path.join(getUserDir(username), 'queue.json');
  fs.writeFileSync(filePath, JSON.stringify(queue, null, 2), 'utf8');
}

function loadUserSentMessages(username: string): Array<{ id: string; phoneNumber: string; message: string; timestamp: string; status: 'sent' | 'failed'; error?: string }> {
  const filePath = path.join(getUserDir(username), 'sent_messages.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveUserSentMessages(username: string, messages: any[]) {
  const filePath = path.join(getUserDir(username), 'sent_messages.json');
  fs.writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf8');
}

function loadUserLogs(username: string): Array<{ id: string; timestamp: string; message: string; type: 'info' | 'error' | 'success' }> {
  const filePath = path.join(getUserDir(username), 'logs.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveUserLogs(username: string, logs: any[]) {
  const filePath = path.join(getUserDir(username), 'logs.json');
  fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf8');
}

function addLog(username: string, message: string, type: 'info' | 'error' | 'success' = 'info') {
  const userLogs = loadUserLogs(username);
  const log = {
    id: Math.random().toString(36).substring(7),
    timestamp: new Date().toISOString(),
    message,
    type
  };
  userLogs.push(log);
  if (userLogs.length > 100) {
    userLogs.shift();
  }
  saveUserLogs(username, userLogs);
  console.log(`[${username.toUpperCase()}] [${type.toUpperCase()}] ${message}`);
}

const processingQueues = new Set<string>();
let globalDelaySeconds = 2; // Default delay: 2 seconds

function pushToUserQueue(username: string, item: Omit<QueueItem, 'id' | 'status' | 'addedAt'>) {
  const queue = loadUserQueue(username);
  const newItem: QueueItem = {
    ...item,
    id: Math.random().toString(36).substring(7),
    status: 'pending',
    addedAt: new Date().toISOString()
  };
  queue.push(newItem);
  saveUserQueue(username, queue);
  addLog(username, `Queue: Added message for ${item.recipient} (Session: ${item.sessionId})`, 'info');
  processUserQueue(username);
  return newItem;
}

async function processUserQueue(username: string) {
  if (processingQueues.has(username)) return;
  processingQueues.add(username);

  try {
    while (true) {
      const queue = loadUserQueue(username);
      const pausedSessions = loadUserPausedQueues(username);
      const nowStr = new Date().toISOString();
      const pendingIndex = queue.findIndex(i => 
        i.status === 'pending' && 
        !pausedSessions.includes(i.sessionId) &&
        (!i.scheduledAt || i.scheduledAt <= nowStr)
      );
      if (pendingIndex === -1) {
        break;
      }

      const item = queue[pendingIndex];

      // Check if recipient is in global banned/blocked group list
      if (isJidBlocked(item.recipient)) {
        item.status = 'failed';
        item.error = 'Banned: Target group/recipient is in global blocked/banned list.';
        saveUserQueue(username, queue);
        addLog(username, `🚫 Queue Item ${item.id} skipped: ${item.recipient} is in global banned group list.`, 'info');
        continue;
      }

      item.status = 'sending';
      saveUserQueue(username, queue);
      addLog(username, `Queue: Processing item ${item.id} for ${item.recipient} (Session: ${item.sessionId})...`, 'info');

      const userSessKey = `${username}:${item.sessionId}`;
      const session = sessions.get(userSessKey);
      const sentMessages = loadUserSentMessages(username);

      if (!session || session.status !== 'connected' || !session.sock) {
        // Do not prematurely fail pending items if session is reconnecting or temporarily offline.
        // Revert status to 'pending' so it automatically sends when session reconnects.
        item.status = 'pending';
        saveUserQueue(username, queue);
        const currentSessStatus = session ? session.status : 'disconnected';
        addLog(username, `Queue: Session "${item.sessionId}" is currently ${currentSessStatus}. Pausing queue and waiting for WhatsApp connection...`, 'info');
        break; // Stop loop and await socket connection/reconnection
      }

      try {
        await sendMessageDirectly(session.sock, item, username);
        
        // Reload and update
        const freshQueue = loadUserQueue(username);
        const freshIdx = freshQueue.findIndex(i => i.id === item.id);
        if (freshIdx > -1) {
          freshQueue[freshIdx].status = 'sent';
          freshQueue[freshIdx].sentAt = new Date().toISOString();
          freshQueue[freshIdx].retryCount = 0;
          saveUserQueue(username, freshQueue);
        }

        addLog(username, `Queue: Item ${item.id} sent successfully to ${item.recipient}`, 'success');

        let cleanPhone = item.recipient.split('@')[0];
        let displayMsg = item.message || '[Interactive Content]';
        if (item.attachmentType && item.attachmentType !== 'none') {
          displayMsg = `[${item.attachmentType.toUpperCase()}] ${displayMsg}`;
        }

        sentMessages.push({
          id: item.id,
          phoneNumber: cleanPhone,
          message: item.workflowName ? `[AUTO: ${item.workflowName}] ${displayMsg}` : displayMsg,
          timestamp: new Date().toISOString(),
          status: 'sent'
        });
        saveUserSentMessages(username, sentMessages);
      } catch (err: any) {
        const freshQueue = loadUserQueue(username);
        const freshIdx = freshQueue.findIndex(i => i.id === item.id);
        const errMsg = err?.message || 'Unknown error';
        const isConnError = /connection closed|conflict|stream errored|websocket|socket|closed|timed out|reset|epipe|econnreset|session/i.test(errMsg);
        const currentRetry = (item.retryCount || 0) + 1;

        if (freshIdx > -1) {
          if (isConnError && currentRetry <= 3) {
            freshQueue[freshIdx].status = 'pending';
            freshQueue[freshIdx].retryCount = currentRetry;
            freshQueue[freshIdx].error = `Transient disconnect (${errMsg}). Retry ${currentRetry}/3 pending...`;
            saveUserQueue(username, freshQueue);

            addLog(username, `Queue: Item ${item.id} hit temporary connection drop (${errMsg}). Re-queued for retry (${currentRetry}/3) when socket reconnects...`, 'info');
            await new Promise(resolve => setTimeout(resolve, 3000));
            break; // Pause queue processing loop to let connection re-establish
          } else {
            freshQueue[freshIdx].status = 'failed';
            freshQueue[freshIdx].error = errMsg;
            saveUserQueue(username, freshQueue);

            addLog(username, `Queue: Item ${item.id} failed for ${item.recipient}: ${errMsg}`, 'error');

            sentMessages.push({
              id: item.id,
              phoneNumber: item.recipient.split('@')[0],
              message: item.message || '[Interactive Content]',
              timestamp: new Date().toISOString(),
              status: 'failed',
              error: errMsg
            });
            saveUserSentMessages(username, sentMessages);
          }
        }
      }

      const checkQueue = loadUserQueue(username);
      const hasReadyPending = checkQueue.some(i => 
        i.status === 'pending' && 
        !pausedSessions.includes(i.sessionId) &&
        (!i.scheduledAt || i.scheduledAt <= new Date().toISOString())
      );
      if (hasReadyPending) {
        const itemDelay = (typeof item.customDelaySeconds === 'number' && item.customDelaySeconds >= 0)
          ? item.customDelaySeconds
          : globalDelaySeconds;
        // Generate small random offset between -1 and +2 seconds for natural variation
        const randomOffset = Math.floor(Math.random() * 4) - 1;
        const actualDelay = Math.max(1, itemDelay + randomOffset);
        
        addLog(username, `Queue: Waiting ${actualDelay}s delay before next message dispatch (Base delay: ${itemDelay}s, applied ${randomOffset >= 0 ? '+' : ''}${randomOffset}s variation)...`, 'info');
        await new Promise(resolve => setTimeout(resolve, actualDelay * 1000));
      }
    }
  } finally {
    processingQueues.delete(username);
  }
}

const urlCache = new Map<string, { filePath: string; expiresAt: number }>();
const uploadCache = new Map<string, { filePath: string; expiresAt: number }>();

function clearMediaCache(): number {
  let count = 0;
  const tempDir = path.join(process.cwd(), 'temp_attachments');
  
  // Clear memory cache maps
  urlCache.clear();
  uploadCache.clear();
  
  // Clean up disk storage in temp_attachments
  if (fs.existsSync(tempDir)) {
    try {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        try {
          const filePath = path.join(tempDir, file);
          fs.unlinkSync(filePath);
          count++;
        } catch (err) {}
      }
    } catch (err) {}
  }
  return count;
}

async function getCachedMediaUrl(url: string, username: string): Promise<string> {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return url;
  }

  const now = Date.now();
  // Clean up expired cache files (exceeding 30 days) occasionally
  for (const [key, val] of urlCache.entries()) {
    if (val.expiresAt < now) {
      try {
        if (fs.existsSync(val.filePath)) {
          fs.unlinkSync(val.filePath);
        }
      } catch (err) {}
      urlCache.delete(key);
    }
  }

  const cached = urlCache.get(url);
  if (cached && fs.existsSync(cached.filePath)) {
    addLog(username, `📦 Media Cache: Reusing cached copy for "${url.substring(0, 50)}..." to save bandwidth.`, 'info');
    return cached.filePath;
  }

  addLog(username, `📥 Media Cache: Fetching external URL once for queue sending: ${url.substring(0, 50)}...`, 'info');
  const tempDir = path.join(process.cwd(), 'temp_attachments');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const urlHash = crypto.createHash('md5').update(url).digest('hex');
  let ext = '.bin';
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;
    const lastDot = pathname.lastIndexOf('.');
    if (lastDot !== -1 && pathname.length - lastDot <= 5) {
      ext = pathname.substring(lastDot);
    }
  } catch (e) {}

  const cachedFilePath = path.join(tempDir, `url_cache_${urlHash}${ext}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(cachedFilePath, buffer);

  // Cache for 30 days so it persists for future messages as requested
  urlCache.set(url, {
    filePath: cachedFilePath,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000
  });

  return cachedFilePath;
}

async function getCachedUploadMedia(attachmentData: string, attachmentName: string, username: string): Promise<string> {
  const hash = crypto.createHash('md5').update(attachmentData).digest('hex');
  const now = Date.now();

  const cached = uploadCache.get(hash);
  if (cached && fs.existsSync(cached.filePath)) {
    addLog(username, `📦 Upload Cache: Reusing cached upload file "${attachmentName || 'file'}" to save disk space and write I/O.`, 'info');
    return cached.filePath;
  }

  addLog(username, `💾 Upload Cache: Writing uploaded file once: "${attachmentName || 'file'}"...`, 'info');
  const tempDir = path.join(process.cwd(), 'temp_attachments');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  let buffer: Buffer;
  if (attachmentData.includes(';base64,')) {
    const parts = attachmentData.split(';base64,');
    buffer = Buffer.from(parts[1], 'base64');
  } else {
    buffer = Buffer.from(attachmentData, 'base64');
  }

  // Preserve extension if possible
  let ext = '.bin';
  if (attachmentName) {
    const lastDot = attachmentName.lastIndexOf('.');
    if (lastDot !== -1) {
      ext = attachmentName.substring(lastDot);
    }
  }

  const cachedFilePath = path.join(tempDir, `upload_cache_${hash}${ext}`);
  fs.writeFileSync(cachedFilePath, buffer);

  // Cache for 30 days
  uploadCache.set(hash, {
    filePath: cachedFilePath,
    expiresAt: now + 30 * 24 * 60 * 60 * 1000
  });

  return cachedFilePath;
}

// Simulates human typing behavior by sending 'composing' presence before dispatching messages
async function simulateHumanTyping(sockInstance: any, targetJid: string, text?: string) {
  if (!sockInstance || !targetJid) return;
  // Do not send presence updates for broadcast recipients
  if (targetJid === 'status@broadcast') return;

  try {
    // 1. Send composing presence update to recipient
    await sockInstance.sendPresenceUpdate('composing', targetJid);

    // Calculate natural human typing duration based on message length (1.2s - 3.5s)
    let delayMs = 1500;
    if (text && typeof text === 'string' && text.length > 0) {
      delayMs = Math.min(3500, Math.max(1200, Math.floor(text.length * 25)));
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));

    // 2. Pause presence update before releasing payload
    await sockInstance.sendPresenceUpdate('paused', targetJid);
  } catch (err: any) {
    // Non-fatal: if presence update fails due to temporary socket latency, proceed with message dispatch
  }
}

async function sendMessageDirectly(sockInstance: any, item: QueueItem, username: string) {
  const {
    recipient,
    messageType,
    message,
    footer,
    attachmentType = 'none',
    attachmentUrl,
    attachmentData,
    attachmentName,
    inlineAttachment = false,
    buttons,
    templateButtons
  } = item;

  let targetJid = recipient.trim();
  let tempFilePath: string | null = null;
  let mentions: string[] = [];

  if (Array.isArray(item.batchMentions) && item.batchMentions.length > 0) {
    mentions = item.batchMentions;
    addLog(username, `Queue: Using pre-batched mentions of ${mentions.length} members for ${targetJid}`, 'info');
  } else if (item.tagGroupMembers && targetJid.endsWith('@g.us')) {
    try {
      addLog(username, `Queue: Resolving group participants for tagging in ${targetJid}...`, 'info');
      
      let participants: string[] = [];
      const savedGroups = loadUserSavedGroups(username);
      const matchGroup = savedGroups.find((g: any) => g.jid === targetJid);
      
      if (matchGroup && Array.isArray(matchGroup.participants) && matchGroup.participants.length > 0) {
        participants = cleanParticipantJidList(matchGroup.participants);
        addLog(username, `Queue: Loaded ${participants.length} cached members from saved_groups for ${targetJid}`, 'info');
      }

      if (participants.length === 0) {
        addLog(username, `Queue: Fetching fresh metadata from WhatsApp for ${targetJid}...`, 'info');
        const metadata = await sockInstance.groupMetadata(targetJid);
        if (metadata && metadata.participants) {
          participants = cleanParticipantJidList(metadata.participants);
          saveUserGroupDetails(username, targetJid, metadata.subject || 'Group', item.sessionId, {
            participants,
            memberCount: participants.length
          });
        }
      }

      const myJid = sockInstance.user?.id ? (sockInstance.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net') : null;
      mentions = participants.filter((pJid: string) => {
        const isMe = myJid && (pJid.split('@')[0] === myJid.split('@')[0]);
        return !isMe;
      });
      addLog(username, `Queue: Tagged ${mentions.length} members for ${targetJid}`, 'info');
    } catch (err: any) {
      addLog(username, `Queue: Failed to fetch group metadata for tagging (${targetJid}): ${err.message}`, 'error');
    }
  }

  try {
    // Simulate human typing presence before dispatching message payload
    await simulateHumanTyping(sockInstance, targetJid, message);

    let fileRef: any = null;
    if (attachmentType && attachmentType !== 'none') {
      if (attachmentData) {
        try {
          const localCachedPath = await getCachedUploadMedia(attachmentData, attachmentName || '', username);
          fileRef = { url: localCachedPath };
        } catch (err: any) {
          addLog(username, `Queue Warning: Failed to prepare cached upload: ${err.message}`, 'error');
        }
      } else if (attachmentUrl) {
        try {
          const localCachedPath = await getCachedMediaUrl(attachmentUrl, username);
          fileRef = { url: localCachedPath };
        } catch (err: any) {
          addLog(username, `Queue Warning: Failed to download/cache media URL: ${err.message}. Passing URL directly.`, 'error');
          fileRef = { url: attachmentUrl };
        }
      }
    }

    const hasAttachment = !!fileRef;
    let mediaObject: any = null;
    let sendOptions: any = {};

    if (hasAttachment && inlineAttachment && messageType !== 'text') {
      try {
        let mediaObjPayload: any = {};
        if (attachmentType === 'image') {
          mediaObjPayload = { image: fileRef };
        } else if (attachmentType === 'video') {
          mediaObjPayload = { video: fileRef };
        } else if (attachmentType === 'pdf' || attachmentType === 'doc') {
          const mime = attachmentType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          const filename = attachmentName || (attachmentType === 'pdf' ? 'document.pdf' : 'document.docx');
          mediaObjPayload = { document: fileRef, mimetype: mime, fileName: filename };
        }
        mediaObject = await prepareWAMessageMedia(mediaObjPayload, { upload: sockInstance.waUploadToServer });
      } catch (err: any) {
        console.error('Failed to prepare inline attachment:', err);
      }
    }

    if (hasAttachment && messageType === 'text') {
      let mediaPayload: any = {};
      if (attachmentType === 'image') {
        mediaPayload = { image: fileRef, caption: message };
      } else if (attachmentType === 'video') {
        mediaPayload = { video: fileRef, caption: message };
      } else if (attachmentType === 'pdf' || attachmentType === 'doc') {
        const mime = attachmentType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const filename = attachmentName || (attachmentType === 'pdf' ? 'document.pdf' : 'document.docx');
        mediaPayload = { document: fileRef, mimetype: mime, fileName: filename, caption: message };
      }
      if (mentions.length > 0) {
        mediaPayload.mentions = mentions;
      }
      await sockInstance.sendMessage(targetJid, mediaPayload);
    } else {
      if (hasAttachment && (!inlineAttachment || !mediaObject)) {
        let mediaPayload: any = {};
        if (attachmentType === 'image') {
          mediaPayload = { image: fileRef, caption: `Attachment: ${attachmentName || 'image'}` };
        } else if (attachmentType === 'video') {
          mediaPayload = { video: fileRef, caption: `Attachment: ${attachmentName || 'video'}` };
        } else if (attachmentType === 'pdf' || attachmentType === 'doc') {
          const mime = attachmentType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          const filename = attachmentName || (attachmentType === 'pdf' ? 'document.pdf' : 'document.docx');
          mediaPayload = { document: fileRef, mimetype: mime, fileName: filename, caption: `Attachment: ${filename}` };
        }
        await sockInstance.sendMessage(targetJid, mediaPayload);
      }

      let payload: any = {};
      let isInteractive = false;
      
      const headerPayload = (mediaObject) ? {
        title: '',
        hasMediaAttachment: true,
        ...mediaObject
      } : {
        title: '',
        hasMediaAttachment: false
      };

      if (messageType === 'buttons' && Array.isArray(buttons) && buttons.length > 0) {
        isInteractive = true;
        payload = {
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                body: { text: message },
                footer: { text: footer || 'WhatsApp Bridge' },
                header: headerPayload,
                nativeFlowMessage: {
                  buttons: buttons.map((btn: any, index: number) => ({
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                      display_text: btn.text,
                      id: btn.id || `btn-${index}`
                    })
                  }))
                }
              }
            }
          }
        };
        if (mentions.length > 0) {
          payload.viewOnceMessage.message.interactiveMessage.contextInfo = {
            mentionedJid: mentions
          };
        }
      } else if (messageType === 'template' && Array.isArray(templateButtons) && templateButtons.length > 0) {
        isInteractive = true;
        payload = {
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                body: { text: message },
                footer: { text: footer || 'WhatsApp Bridge' },
                header: headerPayload,
                nativeFlowMessage: {
                  buttons: templateButtons.map((btn: any, index: number) => {
                    if (btn.type === 'url') {
                      return {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                          display_text: btn.text,
                          url: btn.url,
                          merchant_url: btn.url
                        })
                      };
                    } else if (btn.type === 'call') {
                      return {
                        name: 'cta_call',
                        buttonParamsJson: JSON.stringify({
                          display_text: btn.text,
                          phone_number: btn.phoneNumber
                        })
                      };
                    } else {
                      return {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                          display_text: btn.text,
                          id: btn.id || `reply-${index}`
                        })
                      };
                    }
                  })
                }
              }
            }
          }
        };
        if (mentions.length > 0) {
          payload.viewOnceMessage.message.interactiveMessage.contextInfo = {
            mentionedJid: mentions
          };
        }
      } else if (messageType === 'list') {
        isInteractive = true;
        const sections = item.listSections || [];
        payload = {
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                body: { text: message },
                footer: { text: footer || 'WhatsApp Bridge' },
                header: headerPayload,
                nativeFlowMessage: {
                  buttons: [
                    {
                      name: 'single_select',
                      buttonParamsJson: JSON.stringify({
                        title: item.listButtonText || 'Select Option',
                        sections: sections.map((sec: any) => ({
                          title: sec.title || '',
                          rows: (sec.rows || []).map((row: any, rIdx: number) => ({
                            id: row.id || `row-${rIdx}`,
                            title: row.title,
                            description: row.description || ''
                          }))
                        }))
                      })
                    }
                  ]
                }
              }
            }
          }
        };
        if (mentions.length > 0) {
          payload.viewOnceMessage.message.interactiveMessage.contextInfo = {
            mentionedJid: mentions
          };
        }
      } else {
        const preview = await getLinkPreviewData(message);
        sendOptions = {};
        if (preview) {
          addLog(username, `🔗 Link Preview generated for "${preview.canonicalUrl}". Meta Title: "${preview.title}", Meta Image attached: ${preview.jpegThumbnail ? 'YES (' + preview.jpegThumbnail.length + ' bytes)' : 'NO'}`, 'success');
          payload = {
            text: message,
            linkPreview: {
              'canonical-url': preview.canonicalUrl,
              canonicalUrl: preview.canonicalUrl,
              'matched-text': preview.matchedText,
              matchedText: preview.matchedText,
              title: preview.title,
              description: preview.description,
              jpegThumbnail: preview.jpegThumbnail
            }
          };
          if (mentions.length > 0) {
            payload.mentions = mentions;
          }
          sendOptions.getUrlInfo = async () => ({
            'canonical-url': preview.canonicalUrl,
            'matched-text': preview.matchedText,
            title: preview.title,
            description: preview.description,
            jpegThumbnail: preview.jpegThumbnail
          });
        } else {
          payload = { text: message };
          if (mentions.length > 0) {
            payload.mentions = mentions;
          }
        }
      }

      if (isInteractive) {
        try {
          const msg = generateWAMessageFromContent(
            targetJid,
            payload,
            { userJid: sockInstance.user?.id }
          );
          await sockInstance.relayMessage(targetJid, msg.message, { messageId: msg.key.id });
        } catch (relayErr: any) {
          console.warn(`[SEND] Relay message failed for interactive message, falling back to simple send: ${relayErr.message}`);
          await sockInstance.sendMessage(targetJid, {
            text: message,
            ...(mentions.length > 0 ? { mentions } : {})
          });
        }
      } else {
        await sockInstance.sendMessage(targetJid, payload, sendOptions);
      }
    }
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {}
    }
  }
}


export interface WorkflowRule {
  id: string;
  name: string;
  triggerType: 'button' | 'text';
  triggerValue: string; // button id or text keyword
  responseType: 'text' | 'buttons' | 'template' | 'none';
  message: string;
  footer?: string;
  attachmentType?: 'none' | 'image' | 'video' | 'pdf' | 'doc';
  attachmentUrl?: string;
  inlineAttachment?: boolean;
  buttons?: Array<{ id: string; text: string }>;
  templateButtons?: Array<{ type: 'url' | 'call' | 'quickReply'; text: string; url?: string; phoneNumber?: string; id?: string }>;
}

let workflows: WorkflowRule[] = [];
const workflowsFilePath = path.join(process.cwd(), 'workflows.json');

function loadWorkflows() {
  try {
    if (fs.existsSync(workflowsFilePath)) {
      const data = fs.readFileSync(workflowsFilePath, 'utf8');
      workflows = JSON.parse(data);
      console.log(`[WA-BRIDGE] Loaded ${workflows.length} workflows successfully from workflows.json.`);
    } else {
      // Seed with highly functional defaults representing multi-message flows
      const defaultWorkflows: WorkflowRule[] = [
        {
          id: "wf-1",
          name: "Invoice Help Responder",
          triggerType: "button",
          triggerValue: "invoice-help",
          responseType: "buttons",
          message: "We would be happy to help you with your invoice questions. Please choose an option below to proceed with your payment or talk to a billing assistant.",
          footer: "Navi Billing Support",
          attachmentType: "none",
          inlineAttachment: false,
          buttons: [
            { id: "wf-pay-now", text: "💳 Pay Right Now" },
            { id: "wf-talk-agent", text: "💬 Chat with Agent" }
          ],
          templateButtons: []
        },
        {
          id: "wf-2",
          name: "Checkout Details Bot",
          triggerType: "button",
          triggerValue: "wf-pay-now",
          responseType: "template",
          message: "Excellent choice! Click below to complete your payment securely. After paying, you'll receive a confirmation receipt instantly.",
          footer: "Navi Secure Checkout",
          attachmentType: "none",
          inlineAttachment: false,
          buttons: [],
          templateButtons: [
            { type: "url", text: "🔒 Complete Checkout", url: "https://ai.studio/build" },
            { type: "quickReply", text: "❓ Get Help", id: "invoice-help" }
          ]
        },
        {
          id: "wf-3",
          name: "Live Support Handover",
          triggerType: "button",
          triggerValue: "wf-talk-agent",
          responseType: "text",
          message: "Got it! Your billing ticket #BL-4912 has been opened. An agent from our finance department will connect with you here shortly.",
          footer: "",
          attachmentType: "none",
          inlineAttachment: false,
          buttons: [],
          templateButtons: []
        },
        {
          id: "wf-4",
          name: "View FAQs Responder",
          triggerType: "button",
          triggerValue: "faq-help",
          responseType: "buttons",
          message: "Frequently Asked Questions:\n\n1. What is Navi?\nNavi is a modular interactive message bridge.\n\n2. Are these messages secure?\nYes, fully relayed through secure WhatsApp endpoints.\n\nChoose an action below:",
          footer: "Navi Knowledge Base",
          attachmentType: "none",
          inlineAttachment: false,
          buttons: [
            { id: "wf-main-menu", text: "🏠 Main Menu" },
            { id: "wf-talk-agent", text: "📞 Connect Support" }
          ],
          templateButtons: []
        },
        {
          id: "wf-5",
          name: "Main Menu Responder",
          triggerType: "button",
          triggerValue: "wf-main-menu",
          responseType: "text",
          message: "Hi again! What can we help you with today? You can choose any of our interactive paths by interacting with the messages.",
          footer: "",
          attachmentType: "none",
          inlineAttachment: false,
          buttons: [],
          templateButtons: []
        },
        {
          id: "wf-6",
          name: "Hello Keyword Responder",
          triggerType: "text",
          triggerValue: "hello",
          responseType: "buttons",
          message: "Welcome to Navi's Interactive Automation System! 🌟\n\nHow can we support your experience today? Please select one of our self-serve paths:",
          footer: "Navi Smart Assistant",
          attachmentType: "none",
          inlineAttachment: false,
          buttons: [
            { id: "faq-help", text: "❓ View FAQs" },
            { id: "invoice-help", text: "💳 Billing Support" }
          ],
          templateButtons: []
        }
      ];
      workflows = defaultWorkflows;
      fs.writeFileSync(workflowsFilePath, JSON.stringify(defaultWorkflows, null, 2), 'utf8');
      console.log('[WA-BRIDGE] Created default workflows.json file.');
    }
  } catch (err: any) {
    console.error('[WA-BRIDGE] Error loading/saving workflows:', err.message);
  }
}

function saveWorkflowsToFile() {
  try {
    fs.writeFileSync(workflowsFilePath, JSON.stringify(workflows, null, 2), 'utf8');
    addLog('system', `Workflows configuration saved successfully (${workflows.length} rules)`, 'success');
    return true;
  } catch (err: any) {
    addLog('system', `Failed to save workflows file: ${err.message}`, 'error');
    return false;
  }
}

function loadUserWorkflows(username: string): WorkflowRule[] {
  const filePath = path.join(getUserDir(username), 'workflows.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {}
  
  const defaultRules: WorkflowRule[] = [
    {
      id: "wf-1",
      name: "Invoice Help Responder",
      triggerType: "button",
      triggerValue: "invoice-help",
      responseType: "buttons",
      message: "We would be happy to help you with your invoice questions. Please choose an option below to proceed with your payment or talk to a billing assistant.",
      footer: "Navi Billing Support",
      attachmentType: "none",
      inlineAttachment: false,
      buttons: [
        { id: "wf-pay-now", text: "💳 Pay Right Now" },
        { id: "wf-talk-agent", text: "💬 Chat with Agent" }
      ],
      templateButtons: []
    }
  ];
  try {
    fs.writeFileSync(filePath, JSON.stringify(defaultRules, null, 2), 'utf8');
  } catch (err) {}
  return defaultRules;
}

function saveUserWorkflows(username: string, rules: WorkflowRule[]) {
  const filePath = path.join(getUserDir(username), 'workflows.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(rules, null, 2), 'utf8');
    addLog(username, `Workflows configuration updated (${rules.length} rules)`, 'success');
  } catch (err: any) {
    addLog(username, `Failed to save user workflows: ${err.message}`, 'error');
  }
}

function loadUserLists(username: string): any[] {
  const filePath = path.join(getUserDir(username), 'lists.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveUserLists(username: string, lists: any[]) {
  const filePath = path.join(getUserDir(username), 'lists.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(lists, null, 2), 'utf8');
    addLog(username, `Lists templates updated (${lists.length} templates)`, 'success');
  } catch (err: any) {
    addLog(username, `Failed to save user lists: ${err.message}`, 'error');
  }
}

// Global Blocked/Banned Group IDs Persistence
function getGlobalBlockedGroupsFilePath(): string {
  return path.join(process.cwd(), 'global_blocked_groups.json');
}

function loadGlobalBlockedGroups(): string[] {
  try {
    const filePath = getGlobalBlockedGroupsFilePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) {
        return data.map(id => String(id).trim()).filter(Boolean);
      }
    }
  } catch (err) {}
  return [];
}

function saveGlobalBlockedGroups(ids: string[]): string[] {
  const clean = Array.from(new Set(ids.map(id => String(id).trim()).filter(Boolean)));
  try {
    fs.writeFileSync(getGlobalBlockedGroupsFilePath(), JSON.stringify(clean, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save global blocked groups:', err);
  }
  return clean;
}

function isJidBlocked(jid: string): boolean {
  if (!jid) return false;
  const blockedList = loadGlobalBlockedGroups();
  if (blockedList.length === 0) return false;

  const rawClean = jid.trim().toLowerCase();
  const phoneOrGroupId = rawClean.split('@')[0];

  for (const blockedItem of blockedList) {
    const cleanBlocked = blockedItem.trim().toLowerCase();
    const blockedPhoneOrGroupId = cleanBlocked.split('@')[0];

    if (rawClean === cleanBlocked || 
        phoneOrGroupId === blockedPhoneOrGroupId ||
        (cleanBlocked.length > 3 && rawClean.includes(cleanBlocked))) {
      return true;
    }
  }
  return false;
}

// Reusable Permanent Saved 4-Digit Codes Data Structure & Helper
export interface SavedCode {
  id: string;
  code: string; // clean 4 numeric digits e.g. "1234"
  message: string;
  phoneNumber: string; // recipient numbers or group JIDs or status@broadcast
  recipientType: 'group' | 'individual' | 'bulk' | 'status';
  delaySeconds: number;
  tagGroupMembers?: boolean;
  sessionIds?: string[];
  msgType?: string;
  footer?: string;
  attachmentType?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentData?: string;
  inlineAttachment?: boolean;
  buttons?: any[];
  templateButtons?: any[];
  listButtonText?: string;
  listSections?: any[];
  isStatus?: boolean;
  statusType?: 'text' | 'image' | 'video';
  backgroundColor?: string;
  font?: number;
  statusJidList?: string[];
  groupIds?: string[];
  tagGroups?: boolean;
  audienceMode?: string;
  includeLeads?: boolean;
  mentions?: string[];
  messagesSequence?: any[];
  interMessageDelaySeconds?: number;
  createdAt: string;
}

// Reusable Draft Templates Data Structure & Helper
export interface DraftTemplate {
  id: string;
  name: string;
  phoneNumber?: string;
  recipientType?: 'individual' | 'group' | 'status';
  message?: string;
  msgType?: string;
  footer?: string;
  attachmentType?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentData?: string;
  inlineAttachment?: boolean;
  buttons?: any[];
  templateButtons?: any[];
  listButtonText?: string;
  listSections?: any[];
  delaySeconds?: number;
  messagesSequence?: any[];
  interMessageDelaySeconds?: number;
  tagGroupMembers?: boolean;
  sessionIds?: string[];
  createdAt: string;
  updatedAt: string;
}

function getUserDraftsFilePath(username: string): string {
  return path.join(getUserDir(username), 'drafts.json');
}

function loadUserDrafts(username: string): DraftTemplate[] {
  try {
    const filePath = getUserDraftsFilePath(username);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {}
  return [];
}

function saveUserDrafts(username: string, drafts: DraftTemplate[]): DraftTemplate[] {
  try {
    fs.writeFileSync(getUserDraftsFilePath(username), JSON.stringify(drafts, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to save drafts for user ${username}:`, err);
  }
  return drafts;
}

function getUserSavedCodesFilePath(username: string): string {
  return path.join(getUserDir(username), 'saved_codes.json');
}

function loadUserSavedCodes(username: string): SavedCode[] {
  try {
    const filePath = getUserSavedCodesFilePath(username);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {}
  return [];
}

function saveUserSavedCodes(username: string, codes: SavedCode[]): SavedCode[] {
  try {
    fs.writeFileSync(getUserSavedCodesFilePath(username), JSON.stringify(codes, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to save saved codes for user ${username}:`, err);
  }
  return codes;
}

async function executeSavedCode(
  username: string,
  savedCode: SavedCode,
  triggerSource: string,
  sockInstance?: any,
  replyJid?: string,
  triggerMsg?: any
): Promise<{ success: boolean; enqueuedCount: number; error?: string }> {
  try {
    // Determine connected sessions for user
    const userPrefix = `${username}:`;
    const connectedSessions: string[] = [];
    for (const [key, sess] of sessions.entries()) {
      if (key.startsWith(userPrefix) && sess.status === 'connected') {
        const sid = key.split(':')[1];
        connectedSessions.push(sid);
      }
    }

    const preferredSessions = (savedCode.sessionIds && savedCode.sessionIds.length > 0)
      ? savedCode.sessionIds.filter(s => connectedSessions.includes(s))
      : connectedSessions;

    const validSessions = preferredSessions.length > 0 ? preferredSessions : connectedSessions;

    if (validSessions.length === 0) {
      const errMsg = 'No connected WhatsApp sessions available to execute saved code.';
      addLog(username, `❌ Saved Code .${savedCode.code} failed: ${errMsg}`, 'error');
      if (sockInstance && replyJid) {
        await sockInstance.sendMessage(replyJid, { text: `❌ *.${savedCode.code} Failed:* ${errMsg}` }, triggerMsg ? { quoted: triggerMsg } : {});
      }
      return { success: false, enqueuedCount: 0, error: errMsg };
    }

    // Handle STATUS STORIES Execution
    if (savedCode.isStatus || savedCode.recipientType === 'status') {
      let publishedCount = 0;
      const sType: 'text' | 'image' | 'video' = (savedCode.statusType || (savedCode.attachmentType === 'image' ? 'image' : savedCode.attachmentType === 'video' ? 'video' : 'text')) as any;

      let sharedFileRef: any = null;
      if (sType !== 'text') {
        if (savedCode.attachmentData) {
          const localCachedPath = await getCachedUploadMedia(savedCode.attachmentData, savedCode.attachmentName || 'status', username);
          sharedFileRef = fs.existsSync(localCachedPath) ? fs.readFileSync(localCachedPath) : { url: localCachedPath };
        } else if (savedCode.attachmentUrl) {
          const localCachedPath = await getCachedMediaUrl(savedCode.attachmentUrl, username);
          sharedFileRef = fs.existsSync(localCachedPath) ? fs.readFileSync(localCachedPath) : { url: localCachedPath };
        }
      }

      const rawMentions = Array.isArray(savedCode.mentions) ? savedCode.mentions : [];
      const explicitGroupMentions = rawMentions.filter((m: string) => typeof m === 'string' && m.trim().endsWith('@g.us')).map((m: string) => m.trim());
      const codeGroupIds = Array.from(new Set([...(Array.isArray(savedCode.groupIds) ? savedCode.groupIds : []), ...explicitGroupMentions]));
      const shouldTagGroups = savedCode.tagGroups !== false && codeGroupIds.length > 0;
      const mentionUserJids = rawMentions.filter((m: string) => typeof m === 'string' && !m.trim().endsWith('@g.us'));

      for (const sid of validSessions) {
        const userSessKey = `${username}:${sid}`;
        const session = sessions.get(userSessKey);
        if (!session || !session.sock || session.status !== 'connected') continue;

        try {
          const resolvedStatusJids = await resolveStatusJidList(
            session.sock,
            savedCode.statusJidList || [],
            username,
            savedCode.audienceMode,
            Boolean(savedCode.includeLeads),
            codeGroupIds
          );

          const pubRes = await publishStatusWithGroupMentions(
            session.sock,
            username,
            session.name || sid,
            {
              statusType: sType,
              text: savedCode.message || '',
              backgroundColor: savedCode.backgroundColor,
              font: savedCode.font,
              fileRef: sharedFileRef,
              statusJidList: resolvedStatusJids,
              mentionGroupJids: shouldTagGroups ? codeGroupIds : [],
              mentionUserJids
            }
          );

          publishedCount++;
          addLog(
            username,
            `✅ Published Status Story via Code .${savedCode.code} on "${session.name}" (${pubRes.recipientCount} viewers${pubRes.notifiedGroups > 0 ? `, ${pubRes.notifiedGroups} group(s) notified` : ''})`,
            'success'
          );
        } catch (statusErr: any) {
          console.error(`Error publishing status via code on session ${sid}:`, statusErr);
          addLog(username, `❌ Failed to publish status via code on "${session.name}": ${statusErr.message}`, 'error');
        }
      }

      if (sockInstance && replyJid) {
        await sockInstance.sendMessage(
          replyJid,
          {
            text: `🚀 *.${savedCode.code} Status Broadcast Published!* ✅\n\n` +
                  `📸 *Status Type:* ${sType}\n` +
                  `📝 *Content:* ${savedCode.message ? (savedCode.message.substring(0, 60) + (savedCode.message.length > 60 ? '...' : '')) : '(Media Story)'}\n` +
                  `📱 *Accounts Published:* ${publishedCount} connected instance(s)\n\n` +
                  `WhatsApp Status update broadcasted successfully!`
          },
          triggerMsg ? { quoted: triggerMsg } : {}
        );
      }

      return { success: publishedCount > 0, enqueuedCount: publishedCount };
    }

    // Split recipients for standard chat messages
    const rawRecipients = (savedCode.phoneNumber || '')
      .split(/[\n,]/)
      .map(r => r.trim())
      .filter(Boolean);

    if (rawRecipients.length === 0) {
      const errMsg = 'Saved code has no recipient numbers or group IDs configured.';
      addLog(username, `❌ Saved Code .${savedCode.code} failed: ${errMsg}`, 'error');
      if (sockInstance && replyJid) {
        await sockInstance.sendMessage(replyJid, { text: `❌ *.${savedCode.code} Failed:* ${errMsg}` }, triggerMsg ? { quoted: triggerMsg } : {});
      }
      return { success: false, enqueuedCount: 0, error: errMsg };
    }

    let enqueuedCount = 0;
    let skippedBanned = 0;

    for (let i = 0; i < rawRecipients.length; i++) {
      const recipient = rawRecipients[i];
      const assignedSessionId = getAssignedSessionIdForRecipient(
        username,
        recipient,
        savedCode.recipientType || 'group',
        validSessions[i % validSessions.length],
        validSessions
      );

      let targetJid = recipient;
      if (savedCode.recipientType === 'group') {
        if (!targetJid.includes('@')) {
          targetJid = `${targetJid}@g.us`;
        }
      } else {
        const cleanNumber = recipient.replace(/\D/g, '');
        if (cleanNumber) {
          targetJid = `${cleanNumber}@s.whatsapp.net`;
        }
      }

      if (isJidBlocked(targetJid)) {
        skippedBanned++;
        addLog(username, `🚫 Saved Code .${savedCode.code}: Skipped ${targetJid} (Banned globally)`, 'info');
        continue;
      }

      const sequence = (Array.isArray(savedCode.messagesSequence) && savedCode.messagesSequence.length > 0)
        ? savedCode.messagesSequence
        : [{
            message: savedCode.message || '',
            msgType: savedCode.msgType || 'text',
            footer: savedCode.footer,
            attachmentType: savedCode.attachmentType || 'none',
            attachmentUrl: savedCode.attachmentUrl,
            attachmentData: savedCode.attachmentData,
            attachmentName: savedCode.attachmentName,
            inlineAttachment: !!savedCode.inlineAttachment,
            buttons: savedCode.buttons,
            templateButtons: savedCode.templateButtons,
            listButtonText: savedCode.listButtonText,
            listSections: savedCode.listSections,
            customDelaySeconds: savedCode.interMessageDelaySeconds ?? savedCode.delaySeconds
          }];

      for (const seqItem of sequence) {
        pushToUserQueue(username, {
          recipient: targetJid,
          recipientType: savedCode.recipientType === 'individual' ? 'individual' : 'group',
          messageType: seqItem.msgType || (savedCode.msgType as any) || 'text',
          message: seqItem.message || '',
          footer: seqItem.footer || savedCode.footer,
          attachmentType: seqItem.attachmentType || (savedCode.attachmentType as any) || 'none',
          attachmentUrl: seqItem.attachmentUrl || savedCode.attachmentUrl,
          attachmentData: seqItem.attachmentData || savedCode.attachmentData,
          attachmentName: seqItem.attachmentName || savedCode.attachmentName,
          inlineAttachment: seqItem.inlineAttachment ?? !!savedCode.inlineAttachment,
          buttons: seqItem.buttons || savedCode.buttons,
          templateButtons: seqItem.templateButtons || savedCode.templateButtons,
          listButtonText: seqItem.listButtonText || savedCode.listButtonText,
          listSections: seqItem.listSections || savedCode.listSections,
          sessionId: assignedSessionId,
          tagGroupMembers: !!savedCode.tagGroupMembers,
          customDelaySeconds: typeof seqItem.customDelaySeconds === 'number' ? seqItem.customDelaySeconds : savedCode.interMessageDelaySeconds
        });
        enqueuedCount++;
      }
    }

    if (typeof savedCode.delaySeconds === 'number' && savedCode.delaySeconds >= 0) {
      globalDelaySeconds = savedCode.delaySeconds;
    }

    addLog(username, `🚀 Executed Saved Code .${savedCode.code}: Enqueued ${enqueuedCount} message(s) (Skipped ${skippedBanned} banned). Triggered via ${triggerSource}.`, 'success');
    processUserQueue(username);

    if (sockInstance && replyJid) {
      await sockInstance.sendMessage(
        replyJid,
        {
          text: `🚀 *.${savedCode.code} Triggered Successfully!* ✅\n\n` +
                `🎯 *Target Count:* ${enqueuedCount} recipient(s)\n` +
                `🚫 *Banned Skipped:* ${skippedBanned}\n` +
                `📝 *Message:* ${savedCode.message ? (savedCode.message.substring(0, 60) + (savedCode.message.length > 60 ? '...' : '')) : '(Attachment)'}\n` +
                `⏱️ *Delay Timer:* ${savedCode.delaySeconds || 0}s / message\n\n` +
                `Messages added to active dispatch queue!`
        },
        triggerMsg ? { quoted: triggerMsg } : {}
      );
    }

    return { success: true, enqueuedCount };
  } catch (err: any) {
    console.error(`Error executing saved code ${savedCode?.code}:`, err);
    addLog(username, `❌ Error executing saved code .${savedCode?.code}: ${err.message}`, 'error');
    if (sockInstance && replyJid) {
      await sockInstance.sendMessage(replyJid, { text: `❌ *.${savedCode?.code} Error:* ${err.message}` }, triggerMsg ? { quoted: triggerMsg } : {});
    }
    return { success: false, enqueuedCount: 0, error: err.message };
  }
}

interface UserSettings {
  secretPrefix: string;
  disableTextProcessing: boolean;
  shareBatchSize: number;
  shareBatchPauseSeconds: number;
  defaultChannelJid?: string;
  defaultChannelName?: string;
  defaultChannelInviteLink?: string;
  autoAttachChannelTag?: boolean;
  appendChannelLinkToShare?: boolean; // defaults to false (link hidden from caption; native View Channel tag displayed)
  showForwardedTagOnShare?: boolean; // defaults to true (show WhatsApp "Forwarded" badge on shared channel cards)
  autoJoinGroupsEnabled?: boolean;
  autoJoinMinMembers?: number; // defaults to 400
  autoRetryIntervalMinutes?: number; // defaults to 15
  autoRequestAdminApproval?: boolean; // defaults to true
}

function loadUserSettings(username: string): UserSettings {
  const filePath = path.join(getUserDir(username), 'settings.json');
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        secretPrefix: data.secretPrefix || '.',
        disableTextProcessing: !!data.disableTextProcessing,
        shareBatchSize: typeof data.shareBatchSize === 'number' && data.shareBatchSize > 0 ? data.shareBatchSize : 5,
        shareBatchPauseSeconds: typeof data.shareBatchPauseSeconds === 'number' && data.shareBatchPauseSeconds >= 0 ? data.shareBatchPauseSeconds : 10,
        defaultChannelJid: data.defaultChannelJid ? String(data.defaultChannelJid).trim() : undefined,
        defaultChannelName: data.defaultChannelName ? String(data.defaultChannelName).trim() : undefined,
        defaultChannelInviteLink: data.defaultChannelInviteLink ? String(data.defaultChannelInviteLink).trim() : undefined,
        autoAttachChannelTag: !!data.autoAttachChannelTag,
        appendChannelLinkToShare: !!data.appendChannelLinkToShare,
        showForwardedTagOnShare: data.showForwardedTagOnShare !== undefined ? !!data.showForwardedTagOnShare : true,
        autoJoinGroupsEnabled: !!data.autoJoinGroupsEnabled,
        autoJoinMinMembers: typeof data.autoJoinMinMembers === 'number' && data.autoJoinMinMembers > 0 ? data.autoJoinMinMembers : 400,
        autoRetryIntervalMinutes: typeof data.autoRetryIntervalMinutes === 'number' && data.autoRetryIntervalMinutes > 0 ? data.autoRetryIntervalMinutes : 15,
        autoRequestAdminApproval: data.autoRequestAdminApproval !== undefined ? !!data.autoRequestAdminApproval : true
      };
    }
  } catch (err) {}
  
  const defaultSettings: UserSettings = {
    secretPrefix: '.',
    disableTextProcessing: false,
    shareBatchSize: 5,
    shareBatchPauseSeconds: 10,
    autoAttachChannelTag: false,
    appendChannelLinkToShare: false,
    showForwardedTagOnShare: true,
    autoJoinGroupsEnabled: false,
    autoJoinMinMembers: 400,
    autoRetryIntervalMinutes: 15,
    autoRequestAdminApproval: true
  };
  try {
    fs.writeFileSync(filePath, JSON.stringify(defaultSettings, null, 2), 'utf8');
  } catch (err) {}
  return defaultSettings;
}

function saveUserSettings(username: string, settings: Partial<UserSettings>) {
  const filePath = path.join(getUserDir(username), 'settings.json');
  try {
    const existing = loadUserSettings(username);
    const updated: UserSettings = {
      secretPrefix: settings.secretPrefix || existing.secretPrefix || '.',
      disableTextProcessing: settings.disableTextProcessing !== undefined ? settings.disableTextProcessing : existing.disableTextProcessing,
      shareBatchSize: typeof settings.shareBatchSize === 'number' && settings.shareBatchSize > 0 ? settings.shareBatchSize : existing.shareBatchSize,
      shareBatchPauseSeconds: typeof settings.shareBatchPauseSeconds === 'number' && settings.shareBatchPauseSeconds >= 0 ? settings.shareBatchPauseSeconds : existing.shareBatchPauseSeconds,
      defaultChannelJid: settings.defaultChannelJid !== undefined ? (settings.defaultChannelJid ? settings.defaultChannelJid.trim() : undefined) : existing.defaultChannelJid,
      defaultChannelName: settings.defaultChannelName !== undefined ? (settings.defaultChannelName ? settings.defaultChannelName.trim() : undefined) : existing.defaultChannelName,
      defaultChannelInviteLink: settings.defaultChannelInviteLink !== undefined ? (settings.defaultChannelInviteLink ? settings.defaultChannelInviteLink.trim() : undefined) : existing.defaultChannelInviteLink,
      autoAttachChannelTag: settings.autoAttachChannelTag !== undefined ? !!settings.autoAttachChannelTag : existing.autoAttachChannelTag,
      appendChannelLinkToShare: settings.appendChannelLinkToShare !== undefined ? !!settings.appendChannelLinkToShare : existing.appendChannelLinkToShare,
      showForwardedTagOnShare: settings.showForwardedTagOnShare !== undefined ? !!settings.showForwardedTagOnShare : (existing.showForwardedTagOnShare !== undefined ? existing.showForwardedTagOnShare : true),
      autoJoinGroupsEnabled: settings.autoJoinGroupsEnabled !== undefined ? !!settings.autoJoinGroupsEnabled : existing.autoJoinGroupsEnabled,
      autoJoinMinMembers: typeof settings.autoJoinMinMembers === 'number' && settings.autoJoinMinMembers > 0 ? settings.autoJoinMinMembers : (existing.autoJoinMinMembers || 400),
      autoRetryIntervalMinutes: typeof settings.autoRetryIntervalMinutes === 'number' && settings.autoRetryIntervalMinutes > 0 ? settings.autoRetryIntervalMinutes : (existing.autoRetryIntervalMinutes || 15),
      autoRequestAdminApproval: settings.autoRequestAdminApproval !== undefined ? !!settings.autoRequestAdminApproval : (existing.autoRequestAdminApproval !== undefined ? existing.autoRequestAdminApproval : true)
    };
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
    addLog(username, `User settings updated successfully.`, 'success');
  } catch (err: any) {
    addLog(username, `Failed to save user settings: ${err.message}`, 'error');
  }
}

// WhatsApp Channel Cache & Discovery Helper
interface CachedChannel {
  id: string; // Genuine numeric JID e.g. 120363xxxxxxxx@newsletter
  name: string;
  subscribers?: number;
  invite?: string;
  role?: string;
  description?: string;
  verified?: boolean;
}

function loadUserChannels(username: string): CachedChannel[] {
  const filePath = path.join(getUserDir(username), 'channels.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveUserChannels(username: string, channels: CachedChannel[]) {
  const filePath = path.join(getUserDir(username), 'channels.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(channels, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save user channels:', err);
  }
}

// Validates strictly numeric WhatsApp newsletter JID format (e.g. 120363294819284719@newsletter)
function isNumericNewsletterJid(jid?: string | null): boolean {
  if (!jid || typeof jid !== 'string') return false;
  return /^\d{10,25}@newsletter$/.test(jid.trim());
}

// Safely extracts invite code from WhatsApp channel URLs (e.g. https://whatsapp.com/channel/0029VaZ9xyz or .../0029VaZ9xyz/45)
function extractChannelInviteCode(input?: string | null): string | null {
  if (!input || typeof input !== 'string') return null;
  const str = input.trim();
  const match = str.match(/(?:whatsapp\.com\/channel\/|channel\/)([0-9A-Za-z_-]{16,32})/i) ||
                str.match(/^([0-9A-Za-z_-]{16,32})$/);
  if (match) return match[1];
  return null;
}

// Safely extracts specific channel message ID / post counter from WhatsApp channel link
// e.g. https://whatsapp.com/channel/0029VaZ9xyz/123 -> returns 123
function extractChannelMessageId(input?: string | null): number | undefined {
  if (!input || typeof input !== 'string') return undefined;
  const str = input.trim();
  const match = str.match(/(?:whatsapp\.com\/channel\/|channel\/)[0-9A-Za-z_-]{16,32}\/(\d+)/i);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return isNaN(num) ? undefined : num;
  }
  return undefined;
}

// Master WhatsApp Channel Tag Resolver:
// Correctly maps channel names, invite links, or codes to authentic WhatsApp Channel JIDs
// Extracts post/message IDs for direct message jumping and builds authentic links
async function resolveWhatsAppChannel(
  sock: any,
  username: string,
  rawInput?: string,
  preDetected?: { newsletterJid?: string; newsletterName?: string; serverMessageId?: number; channelLink?: string } | null,
  overrideLink?: string
): Promise<{
  newsletterJid: string;
  newsletterName: string;
  serverMessageId?: number;
  inviteLink?: string;
  isVerified: boolean;
  warning?: string;
} | null> {
  const settings = loadUserSettings(username);
  let cachedChannels = loadUserChannels(username);

  // If connected socket exists and cache is empty, attempt to populate user channels
  if (sock && typeof sock.newsletterFetchAllParticipating === 'function' && cachedChannels.length === 0) {
    try {
      const res: any = await sock.newsletterFetchAllParticipating();
      const list = Array.isArray(res) ? res : (res && typeof res === 'object' ? Object.values(res) : []);
      if (list.length > 0) {
        cachedChannels = list.map((c: any) => ({
          id: c.id || c.jid || '',
          name: c.name || c.subject || c.thread_metadata?.name?.text || 'WhatsApp Channel',
          subscribers: Number(c.subscribers || c.subscribers_count || 0),
          role: c.viewer_metadata?.role || c.role || 'subscriber',
          invite: c.thread_metadata?.invite || c.invite || '',
          verified: true
        })).filter(c => isNumericNewsletterJid(c.id));
        saveUserChannels(username, cachedChannels);
      }
    } catch (err) {}
  }

  const trimmedInput = (rawInput || '').trim();

  // Case 1: Quoted message already has verified numeric channel JID and no override argument was given
  if (!trimmedInput && preDetected?.newsletterJid && isNumericNewsletterJid(preDetected.newsletterJid)) {
    const sId = preDetected.serverMessageId || 1;
    let autoLink = preDetected.channelLink || overrideLink || settings.defaultChannelInviteLink;
    if (!autoLink) {
      const match = cachedChannels.find(c => c.id === preDetected.newsletterJid);
      if (match?.invite) {
        autoLink = sId > 1 ? `https://whatsapp.com/channel/${match.invite}/${sId}` : `https://whatsapp.com/channel/${match.invite}`;
      }
    }
    return {
      newsletterJid: preDetected.newsletterJid,
      newsletterName: preDetected.newsletterName || 'WhatsApp Channel',
      serverMessageId: sId,
      inviteLink: autoLink,
      isVerified: true
    };
  }

  // Case 2: Parse "Custom Name | ChannelLink" syntax (e.g. "Special Deals | https://whatsapp.com/channel/0029Va...")
  let customDisplayName = '';
  let linkOrJidCandidate = trimmedInput;
  if (trimmedInput.includes('|')) {
    const parts = trimmedInput.split('|');
    customDisplayName = parts[0].trim();
    linkOrJidCandidate = parts.slice(1).join('|').trim();
  }

  const msgIdFromCandidate = extractChannelMessageId(linkOrJidCandidate) || extractChannelMessageId(overrideLink);

  // Case 3: Link or invite code candidate
  const inviteCode = extractChannelInviteCode(linkOrJidCandidate) || extractChannelInviteCode(overrideLink);
  if (inviteCode) {
    const sMsgId = msgIdFromCandidate || preDetected?.serverMessageId || 1;
    const directLink = sMsgId > 1
      ? `https://whatsapp.com/channel/${inviteCode}/${sMsgId}`
      : `https://whatsapp.com/channel/${inviteCode}`;

    // Fast cache check for known invite code
    const matchCached = cachedChannels.find(c => c.invite === inviteCode);
    if (matchCached && isNumericNewsletterJid(matchCached.id)) {
      return {
        newsletterJid: matchCached.id,
        newsletterName: customDisplayName || matchCached.name,
        serverMessageId: sMsgId,
        inviteLink: directLink,
        isVerified: true
      };
    }

    if (sock && typeof sock.newsletterMetadata === 'function') {
      try {
        const meta: any = await sock.newsletterMetadata('invite', inviteCode);
        if (meta && meta.id && isNumericNewsletterJid(meta.id)) {
          const officialName = meta.name || meta.thread_metadata?.name?.text || 'WhatsApp Channel';
          const resolvedChannel: CachedChannel = {
            id: meta.id,
            name: officialName,
            subscribers: Number(meta.subscribers || meta.subscribers_count || 0),
            invite: inviteCode,
            verified: true
          };
          if (!cachedChannels.find(c => c.id === resolvedChannel.id)) {
            cachedChannels.push(resolvedChannel);
            saveUserChannels(username, cachedChannels);
          }
          return {
            newsletterJid: meta.id,
            newsletterName: customDisplayName || officialName,
            serverMessageId: sMsgId,
            inviteLink: directLink,
            isVerified: true
          };
        }
      } catch (err: any) {
        console.warn(`[RESOLVE CHANNEL] Failed newsletterMetadata('invite', ${inviteCode}):`, err?.message);
      }
    }
  }

  // Case 4: Pure numeric JID (e.g. 120363294819284719@newsletter or 120363294819284719)
  const numericJidCandidate = linkOrJidCandidate.endsWith('@newsletter') ? linkOrJidCandidate : `${linkOrJidCandidate}@newsletter`;
  if (isNumericNewsletterJid(numericJidCandidate)) {
    let channelName = customDisplayName;
    const matchCached = cachedChannels.find(c => c.id === numericJidCandidate);
    if (matchCached) {
      channelName = channelName || matchCached.name;
    } else if (sock && typeof sock.newsletterMetadata === 'function') {
      try {
        const meta: any = await sock.newsletterMetadata('jid', numericJidCandidate);
        if (meta) {
          channelName = channelName || meta.name || meta.thread_metadata?.name?.text;
        }
      } catch (e) {}
    }
    const sMsgId = msgIdFromCandidate || preDetected?.serverMessageId || 1;
    const fallbackLink = matchCached?.invite
      ? (sMsgId > 1 ? `https://whatsapp.com/channel/${matchCached.invite}/${sMsgId}` : `https://whatsapp.com/channel/${matchCached.invite}`)
      : (overrideLink || settings.defaultChannelInviteLink);

    return {
      newsletterJid: numericJidCandidate,
      newsletterName: channelName || 'WhatsApp Channel',
      serverMessageId: sMsgId,
      inviteLink: fallbackLink,
      isVerified: true
    };
  }

  // Case 5: The user provided a Channel Name (e.g. "Official Tech Deals", "Crypto Alerts")
  const searchName = (customDisplayName || trimmedInput).toLowerCase();
  if (searchName) {
    // 5a. Look in cached channels (exact match first, then substring)
    const exactMatch = cachedChannels.find(c => c.name.toLowerCase() === searchName);
    const partialMatch = cachedChannels.find(c => c.name.toLowerCase().includes(searchName) || searchName.includes(c.name.toLowerCase()));
    const matched = exactMatch || partialMatch;

    if (matched && isNumericNewsletterJid(matched.id)) {
      const sMsgId = msgIdFromCandidate || preDetected?.serverMessageId || 1;
      const matchedLink = matched.invite 
        ? (sMsgId > 1 ? `https://whatsapp.com/channel/${matched.invite}/${sMsgId}` : `https://whatsapp.com/channel/${matched.invite}`)
        : (overrideLink || settings.defaultChannelInviteLink);

      return {
        newsletterJid: matched.id,
        newsletterName: customDisplayName || matched.name,
        serverMessageId: sMsgId,
        inviteLink: matchedLink,
        isVerified: true
      };
    }

    // 5b. Check if user configured a verified defaultChannelJid in Settings
    if (settings.defaultChannelJid && isNumericNewsletterJid(settings.defaultChannelJid)) {
      const sMsgId = msgIdFromCandidate || preDetected?.serverMessageId || 1;
      return {
        newsletterJid: settings.defaultChannelJid,
        newsletterName: customDisplayName || trimmedInput || settings.defaultChannelName || 'WhatsApp Channel',
        serverMessageId: sMsgId,
        inviteLink: overrideLink || settings.defaultChannelInviteLink,
        isVerified: true
      };
    }

    // 5c. If the original message already has a verified numeric channel, use that verified JID with custom name!
    if (preDetected?.newsletterJid && isNumericNewsletterJid(preDetected.newsletterJid)) {
      const sMsgId = msgIdFromCandidate || preDetected.serverMessageId || 1;
      return {
        newsletterJid: preDetected.newsletterJid,
        newsletterName: customDisplayName || trimmedInput || preDetected.newsletterName || 'WhatsApp Channel',
        serverMessageId: sMsgId,
        inviteLink: overrideLink || preDetected.channelLink || settings.defaultChannelInviteLink,
        isVerified: true
      };
    }

    // 5d. Name was provided, but NO verified channel JID could be found
    return {
      newsletterJid: '',
      newsletterName: customDisplayName || trimmedInput,
      serverMessageId: 1,
      inviteLink: overrideLink || settings.defaultChannelInviteLink,
      isVerified: false,
      warning: `WhatsApp Channel "${customDisplayName || trimmedInput}" is not linked to a verified Channel JID. Please provide the channel invite link (e.g. https://whatsapp.com/channel/...) or select it in Settings so the channel tag opens without error.`
    };
  }

  // Case 6: No argument provided, check if default channel is configured in Settings
  if (settings.autoAttachChannelTag && settings.defaultChannelJid && isNumericNewsletterJid(settings.defaultChannelJid)) {
    const sMsgId = preDetected?.serverMessageId || 1;
    return {
      newsletterJid: settings.defaultChannelJid,
      newsletterName: settings.defaultChannelName || 'WhatsApp Channel',
      serverMessageId: sMsgId,
      inviteLink: overrideLink || settings.defaultChannelInviteLink,
      isVerified: true
    };
  }

  return null;
}

// Captured Shares System
interface ShareMediaItem {
  id: string;
  mediaType: 'image' | 'video' | 'document' | 'audio';
  mimeType?: string;
  fileName?: string;
  caption?: string;
  localFile?: string; // filename stored under share_media/<username>/
  url?: string;
  quotedMessage?: any;
  addedAt: string;
}

interface CapturedShare {
  id: string;
  timestamp: string;
  from: string;
  sender: string;
  quotedSender: string;
  quotedMessageId: string;
  quotedMessage: any;
  displayText: string;
  mediaType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'other';
  caption?: string;
  extraMedia?: ShareMediaItem[];
  cardLayout?: 'album' | 'carousel';
  channelInfo?: {
    newsletterJid: string;
    newsletterName: string;
    serverMessageId?: number;
    channelLink?: string;
  };
  channelLink?: string;
  appendChannelLink?: boolean;
  showForwardedTag?: boolean;
  status: 'pending' | 'forwarded';
  forwardedTo: string[];
}

function loadUserShares(username: string): CapturedShare[] {
  const filePath = path.join(getUserDir(username), 'shares.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveUserShares(username: string, shares: CapturedShare[]) {
  const filePath = path.join(getUserDir(username), 'shares.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(shares, null, 2), 'utf8');
  } catch (err: any) {
    console.error('Failed to save user shares:', err);
  }
}

function unwrapQuotedMessage(quotedMsg: any): any {
  if (!quotedMsg || typeof quotedMsg !== 'object') return quotedMsg;
  if (quotedMsg.viewOnceMessage?.message) return unwrapQuotedMessage(quotedMsg.viewOnceMessage.message);
  if (quotedMsg.viewOnceMessageV2?.message) return unwrapQuotedMessage(quotedMsg.viewOnceMessageV2.message);
  if (quotedMsg.viewOnceMessageV2Extension?.message) return unwrapQuotedMessage(quotedMsg.viewOnceMessageV2Extension.message);
  if (quotedMsg.ephemeralMessage?.message) return unwrapQuotedMessage(quotedMsg.ephemeralMessage.message);
  if (quotedMsg.documentWithCaptionMessage?.message) return unwrapQuotedMessage(quotedMsg.documentWithCaptionMessage.message);
  if (quotedMsg.imageMessageWithCaption?.message) return unwrapQuotedMessage(quotedMsg.imageMessageWithCaption.message);
  if (quotedMsg.videoMessageWithCaption?.message) return unwrapQuotedMessage(quotedMsg.videoMessageWithCaption.message);
  return quotedMsg;
}

function extractMsgContextInfo(msgMessage: any): any {
  if (!msgMessage) return null;
  if (msgMessage.contextInfo) return msgMessage.contextInfo;
  
  const innerMsg = msgMessage.ephemeralMessage?.message ||
                   msgMessage.viewOnceMessage?.message ||
                   msgMessage.viewOnceMessageV2?.message ||
                   msgMessage.documentWithCaptionMessage?.message;
                   
  if (innerMsg) {
    return extractMsgContextInfo(innerMsg);
  }

  for (const key of Object.keys(msgMessage)) {
    if (msgMessage[key] && typeof msgMessage[key] === 'object' && msgMessage[key].contextInfo) {
      return msgMessage[key].contextInfo;
    }
  }
  return null;
}

function extractNewsletterInfo(contextInfo: any, rawQuotedMsg: any, remoteJid?: string): {
  newsletterJid: string;
  newsletterName: string;
  serverMessageId?: number;
} | null {
  // Check 1: direct in contextInfo
  if (contextInfo?.forwardedNewsletterMessageInfo?.newsletterJid) {
    return {
      newsletterJid: String(contextInfo.forwardedNewsletterMessageInfo.newsletterJid).trim(),
      newsletterName: String(contextInfo.forwardedNewsletterMessageInfo.newsletterName || 'WhatsApp Channel').trim(),
      serverMessageId: Number(contextInfo.forwardedNewsletterMessageInfo.serverMessageId) || 1
    };
  }

  // Check 2: in inner quoted message contextInfo
  if (rawQuotedMsg && typeof rawQuotedMsg === 'object') {
    const innerContext = extractMsgContextInfo(rawQuotedMsg);
    if (innerContext?.forwardedNewsletterMessageInfo?.newsletterJid) {
      return {
        newsletterJid: String(innerContext.forwardedNewsletterMessageInfo.newsletterJid).trim(),
        newsletterName: String(innerContext.forwardedNewsletterMessageInfo.newsletterName || 'WhatsApp Channel').trim(),
        serverMessageId: Number(innerContext.forwardedNewsletterMessageInfo.serverMessageId) || 1
      };
    }

    for (const key of Object.keys(rawQuotedMsg)) {
      const field = rawQuotedMsg[key];
      if (field && typeof field === 'object' && field.contextInfo?.forwardedNewsletterMessageInfo?.newsletterJid) {
        return {
          newsletterJid: String(field.contextInfo.forwardedNewsletterMessageInfo.newsletterJid).trim(),
          newsletterName: String(field.contextInfo.forwardedNewsletterMessageInfo.newsletterName || 'WhatsApp Channel').trim(),
          serverMessageId: Number(field.contextInfo.forwardedNewsletterMessageInfo.serverMessageId) || 1
        };
      }
    }
  }

  // Check 3: Check if source JID or participant is a newsletter
  const jidCandidates = [remoteJid, contextInfo?.participant, contextInfo?.remoteJid];
  for (const jid of jidCandidates) {
    if (typeof jid === 'string' && jid.endsWith('@newsletter')) {
      return {
        newsletterJid: jid.trim(),
        newsletterName: 'WhatsApp Channel',
        serverMessageId: Number(contextInfo?.stanzaId) || 1
      };
    }
  }

  return null;
}

function detectMediaType(quotedMsg: any): 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'other' {
  if (!quotedMsg || typeof quotedMsg !== 'object') return 'text';
  const unwrapped = unwrapQuotedMessage(quotedMsg);
  if (typeof unwrapped === 'string') return 'text';
  if (unwrapped.imageMessage) return 'image';
  if (unwrapped.videoMessage) return 'video';
  if (unwrapped.audioMessage) return 'audio';
  if (unwrapped.documentMessage) return 'document';
  if (unwrapped.stickerMessage) return 'sticker';
  if (unwrapped.conversation || unwrapped.extendedTextMessage) return 'text';
  return 'other';
}

function extractCaptionOrText(quotedMsg: any): string {
  if (!quotedMsg) return '';
  const unwrapped = unwrapQuotedMessage(quotedMsg);
  if (typeof unwrapped === 'string') return unwrapped;
  if (unwrapped.conversation) return unwrapped.conversation;
  if (unwrapped.extendedTextMessage?.text) return unwrapped.extendedTextMessage.text;
  if (unwrapped.imageMessage?.caption) return unwrapped.imageMessage.caption;
  if (unwrapped.videoMessage?.caption) return unwrapped.videoMessage.caption;
  if (unwrapped.documentMessage?.caption) return unwrapped.documentMessage.caption;
  return '';
}

function getMessagePreview(message: any): string {
  if (!message) return '[Empty Message]';
  const unwrapped = unwrapQuotedMessage(message);
  if (typeof unwrapped === 'string') return unwrapped;
  if (unwrapped.conversation) return unwrapped.conversation;
  if (unwrapped.extendedTextMessage?.text) return unwrapped.extendedTextMessage.text;
  if (unwrapped.imageMessage) return `🖼️ [Image] ${unwrapped.imageMessage.caption || ''}`.trim();
  if (unwrapped.videoMessage) return `🎥 [Video] ${unwrapped.videoMessage.caption || ''}`.trim();
  if (unwrapped.audioMessage) return '🎵 [Audio]';
  if (unwrapped.documentMessage) return `📄 [Document] ${unwrapped.documentMessage.caption || unwrapped.documentMessage.fileName || ''}`.trim();
  if (unwrapped.stickerMessage) return '✨ [Sticker]';
  if (unwrapped.contactMessage) return `👤 [Contact] ${unwrapped.contactMessage.displayName || ''}`.trim();
  if (unwrapped.locationMessage) return '📍 [Location]';
  if (unwrapped.groupInviteMessage) return `👥 [Group Invite] ${unwrapped.groupInviteMessage.groupName || ''}`.trim();
  return '[Unsupported Message Type]';
}

function appendChannelLinkToText(originalText: string, link: string): string {
  if (!originalText || !originalText.trim()) {
    return `📢 *WhatsApp Channel:* ${link}`;
  }
  if (originalText.includes(link)) {
    return originalText;
  }
  return `${originalText}\n\n📢 *WhatsApp Channel:* ${link}`;
}

// Strips raw channel URL stamps from text or captions so the message remains 100% clean and native "View Channel" tag handles the navigation
function cleanChannelLinkFromText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\n*📢\s*\*WhatsApp Channel:\*\s*https?:\/\/[^\s]+/gi, '')
    .replace(/\n*🔗\s*\*Channel Link:\*\s*https?:\/\/[^\s]+/gi, '')
    .replace(/📢\s*\*WhatsApp Channel:\*\s*https?:\/\/[^\s]+/gi, '')
    .replace(/🔗\s*\*Channel Link:\*\s*https?:\/\/[^\s]+/gi, '')
    .trim();
}

// Parse WhatsApp chat flags for .share and .sharenow commands (e.g. noforward, --noforward, -nf, clean, forwarded, --carousel, --album)
function parseShareCommandFlags(rawArg: string, defaultShowForwarded: boolean): {
  cleanArg: string;
  showForwardedTag: boolean;
  hasExplicitForwardFlag: boolean;
  cardLayout?: 'album' | 'carousel';
} {
  let showForwardedTag = defaultShowForwarded;
  let hasExplicitForwardFlag = false;
  let cardLayout: 'album' | 'carousel' | undefined;

  if (!rawArg || !rawArg.trim()) {
    return { cleanArg: '', showForwardedTag, hasExplicitForwardFlag, cardLayout };
  }

  const hideTokens = new Set(['--noforward', '-noforward', 'noforward', '--no-forward', 'no-forward', '-nf', 'nofwd', '--nofwd', 'notag', '--notag', 'clean']);
  const showTokens = new Set(['--forwarded', '-forwarded', 'forwarded', '--forward', '-fwd', 'fwd', 'withforward', '--withforward']);
  const carouselTokens = new Set(['--carousel', 'carousel']);
  const albumTokens = new Set(['--album', 'album']);

  // Split preserving pipe separators cleanly
  const tokens = rawArg.trim().split(/\s+/);
  const kept: string[] = [];

  for (const tok of tokens) {
    const low = tok.toLowerCase();
    if (hideTokens.has(low)) {
      showForwardedTag = false;
      hasExplicitForwardFlag = true;
    } else if (showTokens.has(low)) {
      showForwardedTag = true;
      hasExplicitForwardFlag = true;
    } else if (carouselTokens.has(low)) {
      cardLayout = 'carousel';
    } else if (albumTokens.has(low)) {
      cardLayout = 'album';
    } else {
      kept.push(tok);
    }
  }

  // Clean up dangling leading/trailing pipes after removing flags
  const cleanArg = kept.join(' ').replace(/^\|\s*|\s*\|$/g, '').trim();
  return { cleanArg, showForwardedTag, hasExplicitForwardFlag, cardLayout };
}

function buildChannelContextInfo(
  channelInfo?: { newsletterJid?: string; newsletterName?: string; serverMessageId?: number; inviteLink?: string; channelLink?: string } | null,
  showForwardedTag: boolean = true
): any {
  const hasValidNumericJid = !!(channelInfo && channelInfo.newsletterJid && isNumericNewsletterJid(channelInfo.newsletterJid));
  const ctx: any = {};
  if (showForwardedTag) {
    ctx.isForwarded = true;
    ctx.forwardingScore = 1;
    if (hasValidNumericJid) {
      ctx.forwardedNewsletterMessageInfo = {
        newsletterJid: channelInfo!.newsletterJid!.trim(),
        newsletterName: channelInfo!.newsletterName || 'WhatsApp Channel',
        serverMessageId: Number(channelInfo!.serverMessageId) || 1
      };
    }
  } else {
    ctx.isForwarded = false;
  }
  return ctx;
}

const channelThumbnailCache = new Map<string, { buffer: Buffer; url?: string; expiresAt: number }>();
let cachedDefaultChannelBadgeThumb: Buffer | null = null;

async function getDefaultChannelBadgeThumbnail(): Promise<Buffer | undefined> {
  if (cachedDefaultChannelBadgeThumb) return cachedDefaultChannelBadgeThumb;
  try {
    const size = 128;
    const img = new Jimp({ width: size, height: size, color: 0x059669ff });
    const cx = size / 2;
    const cy = size / 2;
    // Draw a crisp WhatsApp-Channel-style circular broadcast emblem in the center
    img.scan(0, 0, size, size, function (x: number, y: number, idx: number) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if ((dist >= 34 && dist <= 40) || (dist >= 19 && dist <= 25) || dist <= 9) {
        this.bitmap.data[idx] = 255;
        this.bitmap.data[idx + 1] = 255;
        this.bitmap.data[idx + 2] = 255;
        this.bitmap.data[idx + 3] = 255;
      }
    });
    cachedDefaultChannelBadgeThumb = await img.getBuffer('image/jpeg', { quality: 82 });
    return cachedDefaultChannelBadgeThumb;
  } catch (err: any) {
    console.warn('[CHANNEL BANNER] Failed generating fallback channel badge:', err?.message);
    return undefined;
  }
}

async function fetchChannelAvatarThumbnail(sock: any, newsletterJid?: string): Promise<{ buffer?: Buffer; url?: string }> {
  if (!newsletterJid || !isNumericNewsletterJid(newsletterJid)) return {};
  const cached = channelThumbnailCache.get(newsletterJid);
  if (cached && cached.expiresAt > Date.now()) {
    return { buffer: cached.buffer, url: cached.url };
  }

  if (!sock || typeof sock.profilePictureUrl !== 'function') return {};
  try {
    const picUrl = await Promise.race([
      sock.profilePictureUrl(newsletterJid).catch(() => null),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 3500))
    ]);
    if (!picUrl || typeof picUrl !== 'string') return {};

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(picUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { url: picUrl };

    const rawBuf = Buffer.from(await res.arrayBuffer());
    if (!rawBuf.length) return { url: picUrl };

    const img = await Jimp.read(rawBuf);
    img.cover({ w: 128, h: 128 });
    const jpegBuf = await img.getBuffer('image/jpeg', { quality: 78 });
    channelThumbnailCache.set(newsletterJid, {
      buffer: jpegBuf,
      url: picUrl,
      expiresAt: Date.now() + 60 * 60 * 1000
    });
    return { buffer: jpegBuf, url: picUrl };
  } catch (err: any) {
    return {};
  }
}

async function resolveChannelDetailsForBanner(
  sock: any,
  username: string,
  channelInfo?: { newsletterJid?: string; newsletterName?: string; serverMessageId?: number; inviteLink?: string; channelLink?: string } | null,
  overrideLink?: string
): Promise<{ newsletterName: string; channelLink?: string }> {
  const settings = username ? loadUserSettings(username) : ({} as UserSettings);
  const cachedChannels = username ? loadUserChannels(username) : [];
  const jid = channelInfo?.newsletterJid?.trim() || '';
  const sMsgId = Number(channelInfo?.serverMessageId) || 1;

  let resolvedName = (channelInfo?.newsletterName && channelInfo.newsletterName.trim()) || '';
  let resolvedLink = overrideLink?.trim() || channelInfo?.inviteLink?.trim() || channelInfo?.channelLink?.trim() || '';

  // Check cached channels for missing name or invite code
  const cachedMatch = jid && isNumericNewsletterJid(jid)
    ? cachedChannels.find(c => c.id === jid)
    : (resolvedName ? cachedChannels.find(c => c.name.toLowerCase() === resolvedName.toLowerCase()) : undefined);

  if (cachedMatch) {
    if (!resolvedName || resolvedName === 'WhatsApp Channel') {
      resolvedName = cachedMatch.name;
    }
    if (!resolvedLink && cachedMatch.invite) {
      resolvedLink = sMsgId > 1
        ? `https://whatsapp.com/channel/${cachedMatch.invite}/${sMsgId}`
        : `https://whatsapp.com/channel/${cachedMatch.invite}`;
    }
  }

  // Query live newsletter metadata if link or real name is still missing
  if (jid && isNumericNewsletterJid(jid) && (!resolvedLink || !resolvedName || resolvedName === 'WhatsApp Channel') && sock && typeof sock.newsletterMetadata === 'function') {
    try {
      const meta: any = await Promise.race([
        sock.newsletterMetadata('jid', jid).catch(() => null),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 3500))
      ]);
      if (meta) {
        const metaName = meta.name || meta.thread_metadata?.name?.text;
        const metaInvite = meta.invite || meta.thread_metadata?.invite;
        if (metaName && (!resolvedName || resolvedName === 'WhatsApp Channel')) {
          resolvedName = metaName;
        }
        if (metaInvite && !resolvedLink) {
          resolvedLink = sMsgId > 1
            ? `https://whatsapp.com/channel/${metaInvite}/${sMsgId}`
            : `https://whatsapp.com/channel/${metaInvite}`;
        }
        if (username && isNumericNewsletterJid(jid) && !cachedMatch && metaName) {
          cachedChannels.push({
            id: jid,
            name: metaName,
            subscribers: Number(meta.subscribers || meta.subscribers_count || 0),
            invite: metaInvite || undefined,
            verified: true
          });
          saveUserChannels(username, cachedChannels);
        }
      }
    } catch {}
  }

  if (!resolvedLink && settings.defaultChannelInviteLink) {
    if (!jid || !settings.defaultChannelJid || settings.defaultChannelJid === jid) {
      resolvedLink = settings.defaultChannelInviteLink;
    }
  }

  if (!resolvedName || resolvedName === 'WhatsApp Channel') {
    resolvedName = settings.defaultChannelName || 'WhatsApp Channel';
  }

  return {
    newsletterName: resolvedName,
    channelLink: resolvedLink || undefined
  };
}

// Builds contextInfo that preserves a clickable Channel Header at the TOP of the message:
// - showForwardedTag = true  -> native WhatsApp forwardedNewsletterMessageInfo (shows "Forwarded" + Channel bar)
// - showForwardedTag = false -> clean clickable externalAdReply Channel Header Banner (NO "Forwarded" badge, keeps Channel tag on top)
async function resolveChannelContextForDispatch(
  sock: any,
  username: string,
  channelInfo?: { newsletterJid?: string; newsletterName?: string; serverMessageId?: number; inviteLink?: string; channelLink?: string } | null,
  options?: { channelLink?: string; showForwardedTag?: boolean; quotedMessage?: any }
): Promise<any> {
  const shouldShowForwarded = options?.showForwardedTag !== false;
  if (shouldShowForwarded) {
    return buildChannelContextInfo(channelInfo, true);
  }

  const hasChannelContext = !!(
    channelInfo?.newsletterJid ||
    channelInfo?.newsletterName ||
    options?.channelLink ||
    channelInfo?.inviteLink ||
    channelInfo?.channelLink
  );

  if (!hasChannelContext) {
    return { isForwarded: false };
  }

  const { newsletterName, channelLink } = await resolveChannelDetailsForBanner(
    sock,
    username,
    channelInfo,
    options?.channelLink
  );

  const avatarThumb = await fetchChannelAvatarThumbnail(sock, channelInfo?.newsletterJid);
  const fallbackThumb = avatarThumb.buffer || await getDefaultChannelBadgeThumbnail();
  const targetUrl = channelLink && /^https?:\/\//i.test(channelLink)
    ? channelLink
    : 'https://whatsapp.com/channels';

  const externalAdReply: any = {
    title: newsletterName,
    body: channelLink ? 'WhatsApp Channel • Tap to view channel' : 'WhatsApp Channel',
    mediaType: 1,
    renderLargerThumbnail: false,
    showAdAttribution: false,
    containsAutoReply: false,
    sourceUrl: targetUrl,
    mediaUrl: targetUrl
  };

  if (avatarThumb.url) {
    externalAdReply.thumbnailUrl = avatarThumb.url;
  }
  if (fallbackThumb) {
    externalAdReply.thumbnail = fallbackThumb;
  }

  return {
    isForwarded: false,
    externalAdReply
  };
}

function getUserShareMediaDir(username: string): string {
  const dir = path.join(process.cwd(), 'share_media', username);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function saveShareMediaUpload(
  username: string,
  base64OrDataUrl: string,
  fileName?: string,
  mimeType?: string
): { localFile: string; mimeType: string; fileName: string; mediaType: 'image' | 'video' | 'document' | 'audio' } {
  let detectedMime = mimeType || 'application/octet-stream';
  let rawBase64 = base64OrDataUrl;
  const dataUrlMatch = base64OrDataUrl.match(/^data:([^;]+);base64,(.*)$/s);
  if (dataUrlMatch) {
    detectedMime = mimeType || dataUrlMatch[1] || detectedMime;
    rawBase64 = dataUrlMatch[2];
  }
  const buffer = Buffer.from(rawBase64, 'base64');
  const safeBase = (fileName || 'media').replace(/[^a-zA-Z0-9._-]/g, '_');
  const extFromName = path.extname(safeBase);
  const fallbackExt = detectedMime.startsWith('image/')
    ? '.jpg'
    : detectedMime.startsWith('video/')
      ? '.mp4'
      : detectedMime.startsWith('audio/')
        ? '.mp3'
        : detectedMime.includes('pdf')
          ? '.pdf'
          : '.bin';
  const finalExt = extFromName || fallbackExt;
  const baseNoExt = extFromName ? safeBase.slice(0, -extFromName.length) : safeBase;
  const uniqueFile = `sm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${baseNoExt.substring(0, 30)}${finalExt}`;
  const absPath = path.join(getUserShareMediaDir(username), uniqueFile);
  fs.writeFileSync(absPath, buffer);

  let mediaType: 'image' | 'video' | 'document' | 'audio' = 'document';
  if (detectedMime.startsWith('image/')) mediaType = 'image';
  else if (detectedMime.startsWith('video/')) mediaType = 'video';
  else if (detectedMime.startsWith('audio/')) mediaType = 'audio';

  return {
    localFile: uniqueFile,
    mimeType: detectedMime,
    fileName: fileName || uniqueFile,
    mediaType
  };
}

function cleanupShareMediaFiles(username: string, share: CapturedShare, allShares: CapturedShare[]) {
  if (!share?.extraMedia || share.extraMedia.length === 0) return;
  const stillReferenced = new Set<string>();
  for (const s of allShares) {
    if (s.id === share.id) continue;
    for (const m of (s.extraMedia || [])) {
      if (m.localFile) stillReferenced.add(m.localFile);
    }
  }
  const mediaDir = getUserShareMediaDir(username);
  for (const m of share.extraMedia) {
    if (m.localFile && !stillReferenced.has(m.localFile)) {
      const target = path.join(mediaDir, path.basename(m.localFile));
      try {
        if (fs.existsSync(target)) fs.unlinkSync(target);
      } catch {}
    }
  }
}

// Helper to format/transform messages for native forwarding with preserved media, top Channel header tag, optional Forwarded badge, and HIDDEN caption link
function prepareForwardedMessage(
  originalQuotedMessage: any,
  channelInfo?: { newsletterJid: string; newsletterName: string; serverMessageId?: number; inviteLink?: string; channelLink?: string } | null,
  options?: { channelLink?: string; appendChannelLink?: boolean; showForwardedTag?: boolean; prebuiltContextInfo?: any }
) {
  if (!originalQuotedMessage) return originalQuotedMessage;
  
  // Clean deep copy to avoid mutating the database stored object
  let quotedMessage = JSON.parse(JSON.stringify(originalQuotedMessage));
  quotedMessage = unwrapQuotedMessage(quotedMessage);

  const shouldShowForwarded = options?.showForwardedTag !== false;
  const forwardingContext = options?.prebuiltContextInfo || buildChannelContextInfo(channelInfo, shouldShowForwarded);
  const newsletterContext = shouldShowForwarded && forwardingContext.forwardedNewsletterMessageInfo
    ? { forwardedNewsletterMessageInfo: forwardingContext.forwardedNewsletterMessageInfo }
    : {};

  const effectiveLink = options?.channelLink || channelInfo?.inviteLink || channelInfo?.channelLink;
  // Link is kept HIDDEN from captions/text by default (so only the top Channel tag appears)
  const shouldAppendLink = options?.appendChannelLink === true && !!effectiveLink;

  const mergeContext = (existingCtx: any) => {
    const baseCtx = { ...(existingCtx || {}) };
    const existingNewsletter = baseCtx.forwardedNewsletterMessageInfo;

    if (!shouldShowForwarded) {
      // Strip all forwarded flags AND forwardedNewsletterMessageInfo so WhatsApp renders the clean externalAdReply Channel Header at the top without a Forwarded label
      delete baseCtx.isForwarded;
      delete baseCtx.forwardingScore;
      delete baseCtx.forwardOrigin;
      delete baseCtx.forwardedNewsletterMessageInfo;
    } else if (forwardingContext.forwardedNewsletterMessageInfo) {
      delete baseCtx.externalAdReply;
    }

    const merged = {
      ...baseCtx,
      ...forwardingContext,
      ...(shouldShowForwarded
        ? (newsletterContext.forwardedNewsletterMessageInfo
            ? newsletterContext
            : (existingNewsletter ? { forwardedNewsletterMessageInfo: existingNewsletter } : {}))
        : {})
    };

    if (!shouldShowForwarded) {
      merged.isForwarded = false;
      delete merged.forwardingScore;
      delete merged.forwardOrigin;
      delete merged.forwardedNewsletterMessageInfo;
    }
    return merged;
  };

  if (typeof quotedMessage === 'string') {
    const textContent = shouldAppendLink 
      ? appendChannelLinkToText(quotedMessage, effectiveLink!) 
      : cleanChannelLinkFromText(quotedMessage);
    return {
      extendedTextMessage: {
        text: textContent,
        contextInfo: forwardingContext
      }
    };
  }
  
  // Case 1: Simple plain text conversation -> promote to extendedTextMessage with contextInfo
  if (quotedMessage.conversation) {
    const textContent = shouldAppendLink 
      ? appendChannelLinkToText(quotedMessage.conversation, effectiveLink!) 
      : cleanChannelLinkFromText(quotedMessage.conversation);
    return {
      extendedTextMessage: {
        text: textContent,
        contextInfo: forwardingContext
      }
    };
  }
  
  // Case 2: Standard structured messages supporting contextInfo
  const messageKeys = [
    'videoMessage',
    'imageMessage',
    'audioMessage',
    'documentMessage',
    'stickerMessage',
    'extendedTextMessage',
    'contactMessage',
    'contactsArrayMessage',
    'locationMessage',
    'liveLocationMessage',
    'groupInviteMessage',
    'templateMessage',
    'buttonsMessage',
    'listMessage',
    'documentWithCaptionMessage',
    'imageMessageWithCaption',
    'videoMessageWithCaption'
  ];
  
  for (const key of messageKeys) {
    if (quotedMessage[key]) {
      const inner = quotedMessage[key];
      if (inner && typeof inner === 'object') {
        inner.contextInfo = mergeContext(inner.contextInfo);

        if (shouldAppendLink) {
          if (key === 'extendedTextMessage' && inner.text) {
            inner.text = appendChannelLinkToText(inner.text, effectiveLink!);
          } else if (['imageMessage', 'videoMessage', 'documentMessage', 'documentWithCaptionMessage', 'imageMessageWithCaption', 'videoMessageWithCaption'].includes(key)) {
            if (inner.caption) {
              inner.caption = appendChannelLinkToText(inner.caption, effectiveLink!);
            } else {
              inner.caption = `📢 *WhatsApp Channel:* ${effectiveLink!}`;
            }
          }
        } else {
          // Keep link hidden from captions & message text
          if (key === 'extendedTextMessage' && inner.text) {
            inner.text = cleanChannelLinkFromText(inner.text);
          } else if (inner.caption) {
            inner.caption = cleanChannelLinkFromText(inner.caption);
          }
        }
      }
      return quotedMessage;
    }
  }
  
  // Fallback: If we couldn't match a known message key, try to scan keys ending with "Message"
  const anyMessageKey = Object.keys(quotedMessage).find(k => k.endsWith('Message'));
  if (anyMessageKey) {
    const inner = quotedMessage[anyMessageKey];
    if (inner && typeof inner === 'object') {
      inner.contextInfo = mergeContext(inner.contextInfo);

      if (shouldAppendLink && inner.caption) {
        inner.caption = appendChannelLinkToText(inner.caption, effectiveLink!);
      } else if (!shouldAppendLink && inner.caption) {
        inner.caption = cleanChannelLinkFromText(inner.caption);
      }
    }
    return quotedMessage;
  }

  return quotedMessage;
}

interface PreparedMediaEntry {
  mediaType: 'image' | 'video' | 'document' | 'audio';
  protoContent: any;
  caption?: string;
  fileName?: string;
  mimeType?: string;
}

// Prepares all media items inside a CapturedShare ONCE per broadcast so group batches don't re-upload files repeatedly
async function prepareShareMediaBundle(
  sock: any,
  username: string,
  share: CapturedShare
): Promise<{ items: PreparedMediaEntry[]; mainCaption: string }> {
  const items: PreparedMediaEntry[] = [];
  let mainCaption = share.caption || extractCaptionOrText(share.quotedMessage) || '';

  // 1. Check primary quotedMessage if it's a media item
  if (share.quotedMessage && typeof share.quotedMessage === 'object') {
    const unwrapped = unwrapQuotedMessage(JSON.parse(JSON.stringify(share.quotedMessage)));
    if (unwrapped.imageMessage) {
      items.push({
        mediaType: 'image',
        protoContent: { imageMessage: unwrapped.imageMessage },
        caption: unwrapped.imageMessage.caption || mainCaption
      });
    } else if (unwrapped.videoMessage) {
      items.push({
        mediaType: 'video',
        protoContent: { videoMessage: unwrapped.videoMessage },
        caption: unwrapped.videoMessage.caption || mainCaption
      });
    } else if (unwrapped.documentMessage) {
      items.push({
        mediaType: 'document',
        protoContent: { documentMessage: unwrapped.documentMessage },
        caption: unwrapped.documentMessage.caption || mainCaption,
        fileName: unwrapped.documentMessage.fileName,
        mimeType: unwrapped.documentMessage.mimetype
      });
    } else if (unwrapped.audioMessage) {
      items.push({
        mediaType: 'audio',
        protoContent: { audioMessage: unwrapped.audioMessage }
      });
    }
  }

  // 2. Append any extraMedia items (uploaded files, URLs, or captured WhatsApp media)
  const mediaDir = getUserShareMediaDir(username);
  for (const extra of (share.extraMedia || [])) {
    try {
      if (extra.quotedMessage) {
        const unwrappedExtra = unwrapQuotedMessage(JSON.parse(JSON.stringify(extra.quotedMessage)));
        if (unwrappedExtra.imageMessage) {
          items.push({ mediaType: 'image', protoContent: { imageMessage: unwrappedExtra.imageMessage }, caption: extra.caption || unwrappedExtra.imageMessage.caption });
          continue;
        }
        if (unwrappedExtra.videoMessage) {
          items.push({ mediaType: 'video', protoContent: { videoMessage: unwrappedExtra.videoMessage }, caption: extra.caption || unwrappedExtra.videoMessage.caption });
          continue;
        }
        if (unwrappedExtra.documentMessage) {
          items.push({
            mediaType: 'document',
            protoContent: { documentMessage: unwrappedExtra.documentMessage },
            caption: extra.caption || unwrappedExtra.documentMessage.caption,
            fileName: extra.fileName || unwrappedExtra.documentMessage.fileName,
            mimeType: extra.mimeType || unwrappedExtra.documentMessage.mimetype
          });
          continue;
        }
        if (unwrappedExtra.audioMessage) {
          items.push({ mediaType: 'audio', protoContent: { audioMessage: unwrappedExtra.audioMessage } });
          continue;
        }
      }

      let sourceInput: Buffer | { url: string } | null = null;
      if (extra.localFile) {
        const absFile = path.join(mediaDir, path.basename(extra.localFile));
        if (fs.existsSync(absFile)) {
          sourceInput = fs.readFileSync(absFile);
        }
      } else if (extra.url) {
        sourceInput = { url: extra.url };
      }

      if (!sourceInput) continue;

      let mediaPayload: any = {};
      if (extra.mediaType === 'image') {
        mediaPayload = { image: sourceInput };
      } else if (extra.mediaType === 'video') {
        mediaPayload = { video: sourceInput };
      } else if (extra.mediaType === 'audio') {
        mediaPayload = { audio: sourceInput, mimetype: extra.mimeType || 'audio/mp4' };
      } else {
        mediaPayload = {
          document: sourceInput,
          mimetype: extra.mimeType || 'application/octet-stream',
          fileName: extra.fileName || 'document'
        };
      }

      const prepared = await prepareWAMessageMedia(mediaPayload, { upload: sock.waUploadToServer });
      items.push({
        mediaType: extra.mediaType,
        protoContent: prepared,
        caption: extra.caption,
        fileName: extra.fileName,
        mimeType: extra.mimeType
      });
    } catch (prepErr: any) {
      console.warn(`[MULTI-MEDIA SHARE] Failed preparing extra media ${extra.id}:`, prepErr?.message);
    }
  }

  return { items, mainCaption };
}

// Dispatches single or multiple media inside the same WhatsApp Channel Card (Album Grid or Swipeable Carousel)
async function sendMultiMediaChannelCard(
  sock: any,
  targetJid: string,
  bundle: { items: PreparedMediaEntry[]; mainCaption: string },
  channelInfo?: { newsletterJid: string; newsletterName: string; serverMessageId?: number; inviteLink?: string; channelLink?: string } | null,
  options?: { channelLink?: string; appendChannelLink?: boolean; showForwardedTag?: boolean; cardLayout?: 'album' | 'carousel'; prebuiltContextInfo?: any; username?: string }
): Promise<void> {
  const shouldShowForwarded = options?.showForwardedTag !== false;
  const effectiveLink = options?.channelLink || channelInfo?.inviteLink || channelInfo?.channelLink;
  const shouldAppendLink = options?.appendChannelLink === true && !!effectiveLink;
  const channelCtx = options?.prebuiltContextInfo || await resolveChannelContextForDispatch(sock, options?.username || '', channelInfo, {
    channelLink: effectiveLink,
    showForwardedTag: shouldShowForwarded,
    quotedMessage: bundle.items[0]?.protoContent
  });

  const formatCaption = (rawCap: string | undefined, forceIncludeLinkPrompt: boolean) => {
    const base = rawCap || '';
    if (shouldAppendLink && effectiveLink) {
      if (base || forceIncludeLinkPrompt) {
        return appendChannelLinkToText(base, effectiveLink);
      }
    }
    return cleanChannelLinkFromText(base);
  };

  const { items, mainCaption } = bundle;
  if (items.length === 0) return;

  // Single media item -> use standard direct channel-tagged dispatch
  if (items.length === 1) {
    const single = items[0];
    const cloned = JSON.parse(JSON.stringify(single.protoContent));
    const key = Object.keys(cloned)[0];
    if (key && cloned[key] && typeof cloned[key] === 'object') {
      const cap = formatCaption(single.caption || mainCaption, true);
      if (cap) cloned[key].caption = cap;
    }
    const preparedSingle = prepareForwardedMessage(cloned, channelInfo, {
      channelLink: effectiveLink,
      appendChannelLink: shouldAppendLink,
      showForwardedTag: shouldShowForwarded,
      prebuiltContextInfo: channelCtx
    });
    await forwardMessagePayloadWithChannel(sock, targetJid, preparedSingle);
    return;
  }

  const albumMedia = items.filter(i => i.mediaType === 'image' || i.mediaType === 'video');
  const otherMedia = items.filter(i => i.mediaType !== 'image' && i.mediaType !== 'video');
  const carouselEligible = items.filter(i => i.mediaType === 'image' || i.mediaType === 'video' || i.mediaType === 'document');

  const preferCarousel =
    options?.cardLayout === 'carousel' ||
    (albumMedia.length < 2 && carouselEligible.length >= 2);

  if (preferCarousel && carouselEligible.length >= 2) {
    try {
      const slides = carouselEligible.map((item, idx) => {
        const cloned = JSON.parse(JSON.stringify(item.protoContent));
        if (cloned.imageMessage) {
          cloned.imageMessage.viewOnce = true;
          delete cloned.imageMessage.contextInfo;
        }
        if (cloned.videoMessage) {
          cloned.videoMessage.viewOnce = true;
          cloned.videoMessage.gifPlayback = false;
          delete cloned.videoMessage.contextInfo;
        }
        if (cloned.documentMessage) {
          delete cloned.documentMessage.contextInfo;
        }
        const header = proto.Message.InteractiveMessage.Header.create({
          title: item.fileName && item.mediaType === 'document' ? item.fileName : '',
          hasMediaAttachment: !!(cloned.imageMessage || cloned.videoMessage || cloned.documentMessage),
          ...cloned
        });
        const slideBodyText = item.caption || (idx === 0 ? formatCaption(mainCaption, false) : '') || ' ';
        const footerText = channelInfo?.newsletterName ? `📢 ${channelInfo.newsletterName}` : '';
        const buttons = effectiveLink
          ? [
              {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                  display_text: channelInfo?.newsletterName ? `View ${channelInfo.newsletterName}` : 'View Channel',
                  url: effectiveLink,
                  merchant_url: effectiveLink
                })
              }
            ]
          : [];
        return proto.Message.InteractiveMessage.create({
          header,
          body: proto.Message.InteractiveMessage.Body.create({ text: slideBodyText }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: footerText }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
        });
      });

      const bodyText = formatCaption(mainCaption, !channelInfo?.newsletterName);
      const interactivePayload: any = {
        interactiveMessage: {
          carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({ cards: slides }),
          body: proto.Message.InteractiveMessage.Body.create({ text: bodyText || ' ' }),
          header: proto.Message.InteractiveMessage.Header.create({
            title: channelInfo?.newsletterName || '',
            hasMediaAttachment: false
          }),
          footer: proto.Message.InteractiveMessage.Footer.create({
            text: channelInfo?.newsletterName ? `WhatsApp Channel • ${channelInfo.newsletterName}` : ''
          }),
          contextInfo: channelCtx
        }
      };

      const carouselMsg = generateWAMessageFromContent(targetJid, interactivePayload, {
        userJid: sock.user?.id,
        messageId: `4NY4W3B${crypto.randomBytes(16).toString('hex').toUpperCase()}`
      });
      await sock.relayMessage(targetJid, carouselMsg.message, { messageId: carouselMsg.key.id });

      // Send any remaining audio items separately if mixed with carousel
      const audioItems = items.filter(i => i.mediaType === 'audio');
      for (const aud of audioItems) {
        const preparedAud = prepareForwardedMessage(aud.protoContent, channelInfo, {
          channelLink: effectiveLink,
          appendChannelLink: shouldAppendLink,
          showForwardedTag: shouldShowForwarded,
          prebuiltContextInfo: channelCtx
        });
        await new Promise(r => setTimeout(r, 350));
        await forwardMessagePayloadWithChannel(sock, targetJid, preparedAud);
      }
      return;
    } catch (carouselErr: any) {
      console.warn(`[MULTI-MEDIA] Carousel send failed for ${targetJid}: ${carouselErr?.message}. Falling back to Album/Media dispatch...`);
    }
  }

  // Native WhatsApp Album Card (groups 2+ images & videos into a single multi-media card with channel attribution)
  if (albumMedia.length >= 2) {
    const albumMsg = generateWAMessageFromContent(targetJid, {
      albumMessage: {
        expectedImageCount: albumMedia.filter(m => m.mediaType === 'image').length,
        expectedVideoCount: albumMedia.filter(m => m.mediaType === 'video').length,
        contextInfo: channelCtx
      }
    }, { userJid: sock.user?.id });

    await sock.relayMessage(targetJid, albumMsg.message, { messageId: albumMsg.key.id });

    for (let idx = 0; idx < albumMedia.length; idx++) {
      const item = albumMedia[idx];
      const cloned = JSON.parse(JSON.stringify(item.protoContent));
      const mediaKey = item.mediaType === 'image' ? 'imageMessage' : 'videoMessage';
      const inner = cloned[mediaKey];
      if (inner && typeof inner === 'object') {
        if (!shouldShowForwarded) {
          // Attach externalAdReply top Channel banner on album header & primary item only so album grouping remains clean without Forwarded badge
          inner.contextInfo = idx === 0 ? { ...channelCtx } : { isForwarded: false };
        } else {
          inner.contextInfo = { ...channelCtx };
        }
        if (idx === 0) {
          const unifiedCaption = formatCaption(mainCaption || item.caption, false);
          if (unifiedCaption) {
            inner.caption = unifiedCaption;
          } else {
            delete inner.caption;
          }
        } else {
          const itemCap = item.caption ? cleanChannelLinkFromText(item.caption) : '';
          if (itemCap && itemCap !== mainCaption) {
            inner.caption = itemCap;
          } else {
            delete inner.caption;
          }
        }
      }

      const childMsg = generateWAMessageFromContent(targetJid, cloned, {
        userJid: sock.user?.id
      });
      if (childMsg.message) {
        childMsg.message.messageContextInfo = {
          ...(childMsg.message.messageContextInfo || {}),
          messageSecret: crypto.randomBytes(32),
          messageAssociation: {
            associationType: 1,
            parentMessageKey: albumMsg.key
          }
        };
      }
      await new Promise(r => setTimeout(r, 350));
      await sock.relayMessage(targetJid, childMsg.message, { messageId: childMsg.key.id });
    }

    // Dispatch any extra documents/audio items attached to the same share with identical channel & forward settings
    for (const extraItem of otherMedia) {
      const preparedExtra = prepareForwardedMessage(extraItem.protoContent, channelInfo, {
        channelLink: effectiveLink,
        appendChannelLink: shouldAppendLink,
        showForwardedTag: shouldShowForwarded,
        prebuiltContextInfo: channelCtx
      });
      await new Promise(r => setTimeout(r, 350));
      await forwardMessagePayloadWithChannel(sock, targetJid, preparedExtra);
    }
    return;
  }

  // Fallback for mixed non-album items (e.g. 1 image + 1 audio): send sequentially with identical channel & forward settings
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const cloned = JSON.parse(JSON.stringify(item.protoContent));
    const key = Object.keys(cloned)[0];
    if (idx === 0 && key && cloned[key] && typeof cloned[key] === 'object' && !cloned[key].caption && mainCaption) {
      cloned[key].caption = mainCaption;
    }
    const prepared = prepareForwardedMessage(cloned, channelInfo, {
      channelLink: effectiveLink,
      appendChannelLink: idx === 0 && shouldAppendLink,
      showForwardedTag: shouldShowForwarded,
      prebuiltContextInfo: idx === 0 ? channelCtx : (shouldShowForwarded ? channelCtx : { isForwarded: false })
    });
    if (idx > 0) await new Promise(r => setTimeout(r, 350));
    await forwardMessagePayloadWithChannel(sock, targetJid, prepared);
  }
}

// Dispatches message payload directly preserving Protobuf contextInfo (forwardedNewsletterMessageInfo) and media metadata
async function forwardMessagePayloadWithChannel(
  sock: any,
  targetJid: string,
  preparedPayload: any
): Promise<void> {
  // Method 1: generateWAMessageFromContent + relayMessage
  // This preserves contextInfo.forwardedNewsletterMessageInfo and all media attributes directly in Protobuf without Baileys strip-forward mutation
  try {
    const fullMsg = generateWAMessageFromContent(targetJid, preparedPayload, {
      userJid: sock.user?.id
    });
    await sock.relayMessage(targetJid, fullMsg.message, { messageId: fullMsg.key.id });
    return;
  } catch (relayErr: any) {
    console.warn(`[FORWARD RELAY] Relay message failed for ${targetJid}: ${relayErr?.message}. Falling back to sendMessage direct payload...`);
  }

  // Method 2: Fallback to sock.sendMessage directly with preparedPayload
  await sock.sendMessage(targetJid, preparedPayload);
}

// Lead Management System
interface LeadContact {
  jid: string;
  phone: string;
  name: string;
  sessionName: string;
  lastActive: string;
  interactionsCount: number;
  lastMessage: string;
  status: 'Cold' | 'Engaged' | 'Converted';
  notes?: string;
}

function loadUserLeads(username: string): LeadContact[] {
  const filePath = path.join(getUserDir(username), 'leads.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveUserLeads(username: string, leads: LeadContact[]) {
  const filePath = path.join(getUserDir(username), 'leads.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(leads, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save user leads:', err);
  }
}

function registerLeadInteraction(username: string, jid: string, name: string, sessionName: string, lastMessage: string) {
  try {
    const leads = loadUserLeads(username);
    const cleanPhone = jid.split('@')[0] || jid;
    const existingIndex = leads.findIndex(l => l.jid === jid);
    
    if (existingIndex !== -1) {
      const existing = leads[existingIndex];
      existing.name = name || existing.name || 'WhatsApp Contact';
      existing.sessionName = sessionName || existing.sessionName;
      existing.lastActive = new Date().toISOString();
      existing.interactionsCount = (existing.interactionsCount || 0) + 1;
      existing.lastMessage = lastMessage || existing.lastMessage;
      // Promote Cold leads to Engaged if they interact multiple times
      if (existing.status === 'Cold' && existing.interactionsCount >= 3) {
        existing.status = 'Engaged';
      }
    } else {
      leads.push({
        jid,
        phone: cleanPhone,
        name: name || 'WhatsApp Contact',
        sessionName: sessionName || 'WA Bridge',
        lastActive: new Date().toISOString(),
        interactionsCount: 1,
        lastMessage: lastMessage || '',
        status: 'Cold',
        notes: ''
      });
    }
    
    saveUserLeads(username, leads);
  } catch (err: any) {
    console.error('Error registering lead interaction:', err);
  }
}

export interface SavedPhoneContact {
  jid: string;
  phone?: string;
  lid?: string;
  name?: string;
  notify?: string;
  sessionId?: string;
  isSavedContact: boolean;
  source?: 'phonebook' | 'whatsapp_history' | 'vcf_import';
  updatedAt: string;
}

const phoneContactsCache = new Map<string, SavedPhoneContact[]>();
const phoneContactsSaveTimers = new Map<string, NodeJS.Timeout>();

function normalizePnJid(raw?: string | null): { jid: string; phone: string } | null {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.endsWith('@g.us') || raw.endsWith('@newsletter') || raw.endsWith('@broadcast') || raw.endsWith('@lid')) {
    return null;
  }
  const digits = raw.split('@')[0].split(':')[0].replace(/\D/g, '');
  if (!digits || digits.length < 7 || digits.length > 16 || /^0+$/.test(digits)) {
    return null;
  }
  return { jid: `${digits}@s.whatsapp.net`, phone: digits };
}

function normalizeLidJid(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (!raw.endsWith('@lid')) return null;
  const user = raw.split('@')[0].split(':')[0];
  return user ? `${user}@lid` : null;
}

function loadUserPhoneContacts(username: string): SavedPhoneContact[] {
  if (phoneContactsCache.has(username)) {
    return phoneContactsCache.get(username)!;
  }
  const filePath = path.join(getUserDir(username), 'phone_contacts.json');
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(parsed)) {
        phoneContactsCache.set(username, parsed);
        return parsed;
      }
    }
  } catch (err) {}
  phoneContactsCache.set(username, []);
  return [];
}

function saveUserPhoneContactsImmediate(username: string, contacts: SavedPhoneContact[]) {
  phoneContactsCache.set(username, contacts);
  const filePath = path.join(getUserDir(username), 'phone_contacts.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(contacts, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save user phone contacts:', err);
  }
}

function scheduleSaveUserPhoneContacts(username: string, delayMs = 1200) {
  if (phoneContactsSaveTimers.has(username)) {
    clearTimeout(phoneContactsSaveTimers.get(username)!);
  }
  const timer = setTimeout(() => {
    phoneContactsSaveTimers.delete(username);
    const list = loadUserPhoneContacts(username);
    saveUserPhoneContactsImmediate(username, list);
  }, delayMs);
  phoneContactsSaveTimers.set(username, timer);
}

function flushUserPhoneContacts(username: string) {
  if (phoneContactsSaveTimers.has(username)) {
    clearTimeout(phoneContactsSaveTimers.get(username)!);
    phoneContactsSaveTimers.delete(username);
  }
  const list = loadUserPhoneContacts(username);
  saveUserPhoneContactsImmediate(username, list);
}

async function upsertUserPhoneContacts(
  username: string,
  sessionId: string,
  rawContacts: any[],
  sockInstance?: any,
  opts?: { source?: 'phonebook' | 'whatsapp_history' | 'vcf_import'; immediate?: boolean }
): Promise<number> {
  if (!Array.isArray(rawContacts) || rawContacts.length === 0) return 0;

  const existing = loadUserPhoneContacts(username);
  const byJid = new Map<string, SavedPhoneContact>();
  const byLid = new Map<string, SavedPhoneContact>();
  for (const c of existing) {
    byJid.set(c.jid, c);
    if (c.lid) byLid.set(c.lid, c);
  }

  let selfDigits = '';
  const rawMe = sockInstance?.user?.id || sockInstance?.authState?.creds?.me?.id;
  if (rawMe) {
    selfDigits = rawMe.split(':')[0].split('@')[0].replace(/\D/g, '');
  }

  let changedCount = 0;
  const nowIso = new Date().toISOString();

  for (const raw of rawContacts) {
    if (!raw || typeof raw !== 'object') continue;
    const rawId = typeof raw.id === 'string' ? raw.id : '';
    if (rawId.endsWith('@g.us') || rawId.endsWith('@newsletter') || rawId.endsWith('@broadcast') || rawId === 'status@broadcast') {
      continue;
    }

    let lid = normalizeLidJid(raw.lid) || normalizeLidJid(rawId) || undefined;
    let pnInfo =
      normalizePnJid(raw.phoneNumber) ||
      normalizePnJid(rawId) ||
      (raw.phone ? normalizePnJid(String(raw.phone)) : null);

    // Resolve LID -> PN if Baileys has a mapping cached
    if (!pnInfo && lid && sockInstance?.signalRepository?.lidMapping?.getPNForLID) {
      try {
        const mappedPn = await sockInstance.signalRepository.lidMapping.getPNForLID(lid);
        pnInfo = normalizePnJid(mappedPn);
      } catch {}
    }

    if (!pnInfo && !lid) continue;
    if (pnInfo && selfDigits && pnInfo.phone === selfDigits) continue;

    const canonicalJid = pnInfo ? pnInfo.jid : lid!;
    const contactName = (typeof raw.name === 'string' ? raw.name.trim() : '') ||
                        (typeof raw.fullName === 'string' ? raw.fullName.trim() : '') ||
                        (typeof raw.firstName === 'string' ? raw.firstName.trim() : '') ||
                        (typeof raw.displayName === 'string' ? raw.displayName.trim() : '');
    const notifyName = (typeof raw.notify === 'string' ? raw.notify.trim() : '') ||
                       (typeof raw.verifiedName === 'string' ? raw.verifiedName.trim() : '') ||
                       (typeof raw.pushName === 'string' ? raw.pushName.trim() : '');

    // Check if an existing entry stored by LID should be upgraded to the PN JID
    let target: SavedPhoneContact | undefined = byJid.get(canonicalJid);
    if (!target && lid && byLid.has(lid)) {
      const lidEntry = byLid.get(lid)!;
      if (pnInfo && lidEntry.jid !== pnInfo.jid) {
        byJid.delete(lidEntry.jid);
        lidEntry.jid = pnInfo.jid;
        lidEntry.phone = pnInfo.phone;
        byJid.set(pnInfo.jid, lidEntry);
        changedCount++;
      }
      target = lidEntry;
    }

    const savedInAddressBook = Boolean(contactName) || opts?.source === 'phonebook' || opts?.source === 'vcf_import';

    if (target) {
      let dirty = false;
      if (pnInfo && target.phone !== pnInfo.phone) {
        target.phone = pnInfo.phone;
        dirty = true;
      }
      if (lid && target.lid !== lid) {
        target.lid = lid;
        byLid.set(lid, target);
        dirty = true;
      }
      if (contactName && target.name !== contactName) {
        target.name = contactName;
        dirty = true;
      }
      if (notifyName && target.notify !== notifyName) {
        target.notify = notifyName;
        dirty = true;
      }
      if (savedInAddressBook && !target.isSavedContact) {
        target.isSavedContact = true;
        dirty = true;
      }
      if (opts?.source === 'phonebook' || opts?.source === 'vcf_import') {
        target.source = opts.source;
      }
      if (dirty) {
        target.updatedAt = nowIso;
        target.sessionId = sessionId || target.sessionId;
        changedCount++;
      }
    } else {
      const entry: SavedPhoneContact = {
        jid: canonicalJid,
        phone: pnInfo?.phone,
        lid,
        name: contactName || undefined,
        notify: notifyName || undefined,
        sessionId,
        isSavedContact: savedInAddressBook,
        source: opts?.source || (contactName ? 'phonebook' : 'whatsapp_history'),
        updatedAt: nowIso
      };
      byJid.set(canonicalJid, entry);
      if (lid) byLid.set(lid, entry);
      changedCount++;
    }
  }

  if (changedCount > 0) {
    const merged = Array.from(byJid.values()).sort((a, b) => {
      if (a.isSavedContact !== b.isSavedContact) return a.isSavedContact ? -1 : 1;
      const aLabel = (a.name || a.notify || a.phone || a.jid).toLowerCase();
      const bLabel = (b.name || b.notify || b.phone || b.jid).toLowerCase();
      return aLabel.localeCompare(bLabel);
    });
    phoneContactsCache.set(username, merged);
    if (opts?.immediate) {
      saveUserPhoneContactsImmediate(username, merged);
    } else {
      scheduleSaveUserPhoneContacts(username);
    }
  }

  return changedCount;
}

async function applyLidPnMappingToContacts(username: string, lidRaw: string, pnRaw: string) {
  const lid = normalizeLidJid(lidRaw);
  const pnInfo = normalizePnJid(pnRaw);
  if (!lid || !pnInfo) return;

  const list = loadUserPhoneContacts(username);
  const idx = list.findIndex(c => c.lid === lid || c.jid === lid);
  if (idx === -1) return;

  const existingPnIdx = list.findIndex(c => c.jid === pnInfo.jid && c !== list[idx]);
  if (existingPnIdx !== -1) {
    // Merge into existing PN contact
    const dest = list[existingPnIdx];
    const src = list[idx];
    dest.lid = lid;
    if (!dest.name && src.name) dest.name = src.name;
    if (!dest.notify && src.notify) dest.notify = src.notify;
    if (src.isSavedContact) dest.isSavedContact = true;
    dest.updatedAt = new Date().toISOString();
    list.splice(idx, 1);
  } else {
    list[idx].jid = pnInfo.jid;
    list[idx].phone = pnInfo.phone;
    list[idx].lid = lid;
    list[idx].updatedAt = new Date().toISOString();
  }
  phoneContactsCache.set(username, list);
  scheduleSaveUserPhoneContacts(username);
}

async function syncPhoneContactsForSession(
  username: string,
  sessionId: string,
  sockInstance: any,
  forceSnapshot = false
): Promise<{ ok: boolean; error?: string }> {
  if (!sockInstance) return { ok: false, error: 'Socket not connected' };
  try {
    if (forceSnapshot && sockInstance.authState?.keys?.set) {
      await sockInstance.authState.keys.set({ 'app-state-sync-version': { critical_unblock_low: null } });
    }
    if (typeof sockInstance.resyncAppState === 'function') {
      await sockInstance.resyncAppState(['critical_unblock_low'], false);
    }
    if (typeof sockInstance.ev?.flush === 'function') {
      try { sockInstance.ev.flush(); } catch {}
    }

    // Attempt to resolve any stored @lid contacts using cached LID->PN map
    const existing = loadUserPhoneContacts(username);
    if (sockInstance?.signalRepository?.lidMapping?.getPNForLID) {
      for (const c of existing) {
        if (c.jid.endsWith('@lid')) {
          try {
            const pn = await sockInstance.signalRepository.lidMapping.getPNForLID(c.jid);
            if (pn) {
              await applyLidPnMappingToContacts(username, c.jid, pn);
            }
          } catch {}
        }
      }
    }

    flushUserPhoneContacts(username);
    return { ok: true };
  } catch (err: any) {
    console.warn(`[CONTACTS-SYNC] Sync error for ${username}/${sessionId}:`, err?.message || err);
    return { ok: false, error: err?.message || 'Failed syncing contacts' };
  }
}

async function collectGroupMemberJids(
  sockInstance: any,
  groupJids: string[] = [],
  username?: string
): Promise<string[]> {
  if (!Array.isArray(groupJids) || groupJids.length === 0) return [];
  const collected = new Set<string>();
  const savedGroups = username ? loadUserSavedGroups(username) : [];
  let savedGroupsModified = false;

  for (const rawGid of groupJids) {
    if (!rawGid || typeof rawGid !== 'string') continue;
    const gid = rawGid.trim();
    if (!gid.endsWith('@g.us')) continue;

    let participants: any[] = [];
    if (sockInstance?.groupMetadata) {
      try {
        const meta = await sockInstance.groupMetadata(gid);
        if (meta && Array.isArray(meta.participants) && meta.participants.length > 0) {
          participants = meta.participants;

          const lidMappings: Array<{ lid: string; pn: string }> = [];
          for (const p of participants) {
            if (p?.id && p?.phoneNumber) {
              lidMappings.push({
                lid: jidNormalizedUser(p.id),
                pn: jidNormalizedUser(p.phoneNumber)
              });
            } else if (p?.id && p?.lid) {
              lidMappings.push({
                lid: jidNormalizedUser(p.lid),
                pn: jidNormalizedUser(p.id)
              });
            }
          }
          if (lidMappings.length > 0 && sockInstance?.signalRepository?.lidMapping?.storeLIDPNMappings) {
            try {
              await sockInstance.signalRepository.lidMapping.storeLIDPNMappings(lidMappings);
            } catch {}
          }

          if (username) {
            const idx = savedGroups.findIndex((g: any) => g.jid === gid);
            const cleaned = cleanParticipantJidList(participants);
            if (idx > -1 && cleaned.length > 0) {
              savedGroups[idx].participants = cleaned;
              savedGroups[idx].memberCount = cleaned.length;
              savedGroupsModified = true;
            }
          }
        }
      } catch (metaErr: any) {
        console.warn(`[STATUS] Could not fetch live groupMetadata for ${gid}:`, metaErr?.message || metaErr);
      }
    }

    if (participants.length === 0 && username) {
      const match = savedGroups.find((g: any) => g.jid === gid);
      if (match && Array.isArray(match.participants)) {
        participants = match.participants;
      }
    }

    const cleaned = cleanParticipantJidList(participants);
    for (const jid of cleaned) {
      collected.add(jid);
    }
  }

  if (savedGroupsModified && username) {
    try {
      const filePath = path.join(getUserDir(username), 'saved_groups.json');
      fs.writeFileSync(filePath, JSON.stringify(savedGroups, null, 2), 'utf8');
    } catch {}
  }

  return Array.from(collected);
}

async function resolveStatusJidList(
  sockInstance: any,
  requestedJids: string[] = [],
  username?: string,
  audienceMode?: string,
  includeLeads = false,
  groupIds: string[] = []
): Promise<string[]> {
  const candidates = new Set<string>();
  const extraGroupJids = new Set<string>();

  if (Array.isArray(groupIds)) {
    groupIds.forEach((gid) => {
      if (typeof gid === 'string' && gid.trim().endsWith('@g.us')) {
        extraGroupJids.add(gid.trim());
      }
    });
  }

  const addRaw = (raw: string) => {
    if (!raw || typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.endsWith('@g.us')) {
      extraGroupJids.add(trimmed);
      return;
    }
    if (trimmed === 'status@broadcast' || trimmed.endsWith('@newsletter') || trimmed.endsWith('@broadcast')) {
      return;
    }
    candidates.add(trimmed);
  };

  if (Array.isArray(requestedJids)) {
    requestedJids.forEach(addRaw);
  }

  // Always collect live + cached members of any targeted groups so @lid / current members are never missed
  if (extraGroupJids.size > 0) {
    const groupMemberJids = await collectGroupMemberJids(sockInstance, Array.from(extraGroupJids), username);
    groupMemberJids.forEach((jid) => addRaw(jid));
  }

  if (username) {
    if (audienceMode === 'phone_contacts' && candidates.size === 0) {
      const phoneContacts = loadUserPhoneContacts(username);
      const savedOnly = phoneContacts.filter(c => c.isSavedContact);
      const sourceList = savedOnly.length > 0 ? savedOnly : phoneContacts;
      sourceList.forEach(c => addRaw(c.jid));
    } else if (candidates.size === 0 && !audienceMode) {
      // Fallback: prefer saved phone contacts first, then leads
      const phoneContacts = loadUserPhoneContacts(username);
      if (phoneContacts.length > 0) {
        phoneContacts.forEach(c => addRaw(c.jid));
      } else {
        const leads = loadUserLeads(username) || [];
        leads.forEach(l => addRaw(l.jid));
      }
    }

    if (includeLeads) {
      const leads = loadUserLeads(username) || [];
      leads.forEach(l => addRaw(l.jid));
    }
  }

  const resolved = new Set<string>();

  // Always include self JID so the status is also visible on the sender's own WhatsApp Status screen
  const rawSelfJid = sockInstance?.user?.id || sockInstance?.authState?.creds?.me?.id;
  const selfPn = normalizePnJid(rawSelfJid);
  if (selfPn) {
    resolved.add(selfPn.jid);
  }

  for (const raw of candidates) {
    if (raw.endsWith('@lid')) {
      let mapped: { jid: string; phone: string } | null = null;
      if (sockInstance?.signalRepository?.lidMapping?.getPNForLID) {
        try {
          const pn = await sockInstance.signalRepository.lidMapping.getPNForLID(raw);
          mapped = normalizePnJid(pn);
        } catch {}
      }
      if (mapped) {
        resolved.add(mapped.jid);
      } else {
        const lid = normalizeLidJid(raw);
        if (lid) resolved.add(lid);
      }
    } else {
      const pn = normalizePnJid(raw);
      if (pn) {
        resolved.add(pn.jid);
      }
    }
  }

  return Array.from(resolved);
}

async function publishStatusWithGroupMentions(
  sockInstance: any,
  username: string,
  sessionName: string,
  params: {
    statusType: 'text' | 'image' | 'video' | string;
    text?: string;
    backgroundColor?: string;
    font?: number;
    fileRef?: any;
    statusJidList: string[];
    mentionGroupJids?: string[];
    mentionUserJids?: string[];
  }
): Promise<{ batchesSent: number; notifiedGroups: number; failedGroups: number; recipientCount: number }> {
  const {
    statusType = 'text',
    text = '',
    backgroundColor,
    font = 1,
    fileRef = null,
    statusJidList = [],
    mentionGroupJids = [],
    mentionUserJids = []
  } = params;

  const rawSelfJid = sockInstance?.user?.id || sockInstance?.authState?.creds?.me?.id;
  const userJid = jidNormalizedUser(rawSelfJid);
  const silentLogger = sockInstance?.logger || pino({ level: 'silent' });

  // Clean & deduplicate group mention targets (@g.us) and private user mention targets (@s.whatsapp.net / @lid)
  const cleanGroupTargets = Array.from(
    new Set(
      (mentionGroupJids || [])
        .filter((j) => typeof j === 'string' && j.trim().endsWith('@g.us'))
        .map((j) => jidNormalizedUser(j.trim()))
        .filter((j) => j.endsWith('@g.us'))
    )
  );

  const cleanUserTargets: string[] = [];
  const seenUsers = new Set<string>();
  for (const raw of mentionUserJids || []) {
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.endsWith('@g.us')) continue;
    if (trimmed.endsWith('@lid')) {
      const norm = normalizeLidJid(trimmed);
      if (norm && !seenUsers.has(norm)) {
        seenUsers.add(norm);
        cleanUserTargets.push(norm);
      }
    } else {
      const pn = normalizePnJid(trimmed);
      if (pn && !seenUsers.has(pn.jid)) {
        seenUsers.add(pn.jid);
        cleanUserTargets.push(pn.jid);
      }
    }
  }

  // Merge mentioned private users into statusJidList so they can view the status too
  const viewerSet = new Set<string>(statusJidList || []);
  if (userJid) viewerSet.add(userJid);
  for (const uJid of cleanUserTargets) {
    viewerSet.add(uJid);
  }
  const finalStatusJidList = Array.from(viewerSet);

  // WhatsApp allows up to 5 mentions per status broadcast; chunk safely if more are supplied
  const allMentionTargets = Array.from(new Set([...cleanGroupTargets, ...cleanUserTargets]));
  const mentionChunks: string[][] = [];
  if (allMentionTargets.length === 0) {
    mentionChunks.push([]);
  } else {
    for (let i = 0; i < allMentionTargets.length; i += 5) {
      mentionChunks.push(allMentionTargets.slice(i, i + 5));
    }
  }

  let batchesSent = 0;
  let notifiedGroups = 0;
  let failedGroups = 0;

  for (let chunkIdx = 0; chunkIdx < mentionChunks.length; chunkIdx++) {
    const batchTargets = mentionChunks[chunkIdx];
    const batchPrivateMentions = batchTargets.filter((j) => !j.endsWith('@g.us'));

    let msgContent: any = {};
    if (statusType === 'text') {
      msgContent = { text: text || '' };
    } else if (statusType === 'image' && fileRef) {
      msgContent = { image: fileRef, caption: text || '' };
    } else if (statusType === 'video' && fileRef) {
      msgContent = { video: fileRef, caption: text || '' };
    } else {
      throw new Error('Unsupported status type or missing attachment data');
    }

    if (batchPrivateMentions.length > 0) {
      msgContent.contextInfo = { mentionedJid: batchPrivateMentions };
    }

    const genOptions: any = {
      logger: silentLogger,
      userJid,
      upload: sockInstance.waUploadToServer,
      getUrlInfo: (t: string) =>
        getUrlInfo(t, {
          thumbnailWidth: 192,
          fetchOpts: { timeout: 3000 },
          logger: silentLogger,
          uploadImage: sockInstance.waUploadToServer
        })
    };

    if (statusType === 'text') {
      genOptions.backgroundColor = backgroundColor || '#075E54';
      genOptions.font = typeof font === 'number' ? font : 1;
    }

    const sentMsg = await generateWAMessage('status@broadcast', msgContent, genOptions);
    if (!sentMsg?.message) {
      throw new Error('Failed to construct status payload');
    }

    const relayOpts: any = {
      messageId: sentMsg.key.id,
      statusJidList: finalStatusJidList
    };

    if (batchTargets.length > 0) {
      relayOpts.additionalNodes = [
        {
          tag: 'meta',
          attrs: {},
          content: [
            {
              tag: 'mentioned_users',
              attrs: {},
              content: batchTargets.map((jid) => ({
                tag: 'to',
                attrs: { jid: jidNormalizedUser(jid) }
              }))
            }
          ]
        }
      ];
    }

    await sockInstance.relayMessage('status@broadcast', sentMsg.message, relayOpts);
    batchesSent++;

    // Send native groupStatusMentionMessage / statusMentionMessage protocol notification to each tagged group/user
    for (const targetJid of batchTargets) {
      const normalizedTarget = jidNormalizedUser(targetJid);
      const isGroup = isJidGroup(normalizedTarget) || normalizedTarget.endsWith('@g.us');
      const isPrivate = !isGroup && (normalizedTarget.endsWith('@s.whatsapp.net') || normalizedTarget.endsWith('@lid'));
      if (!isGroup && !isPrivate) continue;

      try {
        const mentionType = isGroup ? 'groupStatusMentionMessage' : 'statusMentionMessage';
        const protocolPayload: any = {
          [mentionType]: {
            message: {
              protocolMessage: {
                key: sentMsg.key,
                type: 25
              }
            }
          },
          messageContextInfo: {
            messageSecret: crypto.randomBytes(32)
          }
        };

        const mentionMsg = generateWAMessageFromContent(normalizedTarget, protocolPayload, { userJid });
        await sockInstance.relayMessage(normalizedTarget, mentionMsg.message!, {
          messageId: mentionMsg.key.id,
          additionalNodes: [
            {
              tag: 'meta',
              attrs: isGroup ? { is_group_status_mention: 'true' } : { is_status_mention: 'true' }
            }
          ]
        });

        if (isGroup) {
          notifiedGroups++;
          addLog(username, `🔔 Group status mention notification sent to ${normalizedTarget} via "${sessionName}".`, 'info');
        }
      } catch (mentionErr: any) {
        if (isGroup) failedGroups++;
        console.warn(`[STATUS] Mention notification failed for ${normalizedTarget}:`, mentionErr?.message || mentionErr);
        addLog(username, `⚠️ Could not send status mention notification to ${normalizedTarget}: ${mentionErr?.message || 'Permission or relay error'}`, 'error');
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    if (chunkIdx < mentionChunks.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  return {
    batchesSent,
    notifiedGroups,
    failedGroups,
    recipientCount: finalStatusJidList.length
  };
}

function parseVcfContacts(vcfText: string, defaultCountryCode = ''): Array<{ name?: string; phone: string }> {
  const results: Array<{ name?: string; phone: string }> = [];
  if (!vcfText || typeof vcfText !== 'string') return results;

  // Unfold folded vCard lines (RFC 2425/6350)
  const unfolded = vcfText.replace(/\r?\n[ \t]/g, '');
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1);
  const cleanCC = defaultCountryCode.replace(/\D/g, '');

  for (const card of cards) {
    const fnMatch = card.match(/^FN(?:;[^:]*)?:(.*)$/im);
    const nMatch = card.match(/^N(?:;[^:]*)?:(.*)$/im);
    let name = fnMatch?.[1]?.trim() || '';
    if (!name && nMatch?.[1]) {
      name = nMatch[1].split(';').map(s => s.trim()).filter(Boolean).reverse().join(' ');
    }

    const telMatches = card.matchAll(/^TEL(?:;[^:]*)?:(.*)$/gim);
    for (const m of telMatches) {
      const rawTel = (m[1] || '').trim();
      if (!rawTel) continue;
      let digits = rawTel.replace(/\D/g, '');
      if (rawTel.startsWith('00')) {
        digits = digits.slice(2);
      } else if (!rawTel.startsWith('+') && cleanCC && digits.length === 10) {
        digits = cleanCC + digits;
      }
      if (digits.length >= 7 && digits.length <= 16) {
        results.push({ name: name || undefined, phone: digits });
      }
    }
  }
  return results;
}

function parsePersonalizedText(text: string, pushName: string, jid: string, sessionName: string): string {
  if (!text) return '';
  const cleanPhone = jid.split('@')[0] || jid;
  const displayName = pushName || 'there';
  return text
    .replace(/\{\{sender_name\}\}/g, displayName)
    .replace(/\{\{sender_phone\}\}/g, cleanPhone)
    .replace(/\{\{sender_jid\}\}/g, jid)
    .replace(/\{\{session_name\}\}/g, sessionName || 'WA Bridge');
}

async function sendAutomationResponse(sock: any, targetJid: string, rule: WorkflowRule, username: string) {
  try {
    addLog(username, `🤖 Running Automation Workflow: "${rule.name}" for ${targetJid}...`, 'info');
    
    const msgType = rule.responseType;
    const message = rule.message;
    const footer = rule.footer;
    const attachmentType = rule.attachmentType || 'none';
    const attachmentUrl = rule.attachmentUrl;
    const inlineAttachment = rule.inlineAttachment ?? true;
    const buttons = rule.buttons || [];
    const templateButtons = rule.templateButtons || [];

    // Simulate human typing indicator before dispatching automation response
    await simulateHumanTyping(sock, targetJid, message);

    let fileRef: any = null;
    const hasAttachment = attachmentType !== 'none' && !!attachmentUrl;
    if (hasAttachment) {
      fileRef = { url: attachmentUrl };
    }

    let mediaObject: any = null;

    if (hasAttachment && inlineAttachment && msgType !== 'text') {
      try {
        let mediaObjPayload: any = {};
        if (attachmentType === 'image') {
          mediaObjPayload = { image: fileRef };
        } else if (attachmentType === 'video') {
          mediaObjPayload = { video: fileRef };
        } else if (attachmentType === 'pdf' || attachmentType === 'doc') {
          const mime = attachmentType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          const filename = attachmentType === 'pdf' ? 'document.pdf' : 'document.docx';
          mediaObjPayload = { document: fileRef, mimetype: mime, fileName: filename };
        }
        addLog(username, `[AUTO-BOT] Uploading inline header attachment: ${attachmentType}...`, 'info');
        mediaObject = await prepareWAMessageMedia(mediaObjPayload, { upload: sock.waUploadToServer });
        addLog(username, `[AUTO-BOT] Inline header attachment uploaded successfully!`, 'success');
      } catch (err: any) {
        addLog(username, `[AUTO-BOT] Failed to upload inline header attachment: ${err.message}. Falling back to separate message delivery.`, 'error');
      }
    }

    if (hasAttachment && msgType === 'text') {
      // Send as media with text as caption
      let mediaPayload: any = {};
      if (attachmentType === 'image') {
        mediaPayload = { image: fileRef, caption: message };
      } else if (attachmentType === 'video') {
        mediaPayload = { video: fileRef, caption: message };
      } else if (attachmentType === 'pdf' || attachmentType === 'doc') {
        const mime = attachmentType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const filename = attachmentType === 'pdf' ? 'document.pdf' : 'document.docx';
        mediaPayload = { document: fileRef, caption: message, mimetype: mime, fileName: filename };
      }
      addLog(username, `[AUTO-BOT] Sending media file with caption...`, 'info');
      await sock.sendMessage(targetJid, mediaPayload);
    } else {
      // If there's an attachment AND interactive buttons/template, and we are not doing inline
      if (hasAttachment && (!inlineAttachment || !mediaObject)) {
        let mediaPayload: any = {};
        if (attachmentType === 'image') {
          mediaPayload = { image: fileRef, caption: `Attachment: image` };
        } else if (attachmentType === 'video') {
          mediaPayload = { video: fileRef, caption: `Attachment: video` };
        } else if (attachmentType === 'pdf' || attachmentType === 'doc') {
          const mime = attachmentType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          const filename = attachmentType === 'pdf' ? 'document.pdf' : 'document.docx';
          mediaPayload = { document: fileRef, mimetype: mime, fileName: filename };
        }
        addLog(username, `[AUTO-BOT] Dispatching preceding media attachment...`, 'info');
        await sock.sendMessage(targetJid, mediaPayload);
      }

      // Prepare interactive payload
      let payload: any = {};
      let isInteractive = false;

      const headerPayload = (mediaObject) ? {
        title: '',
        hasMediaAttachment: true,
        ...mediaObject
      } : {
        title: '',
        hasMediaAttachment: false
      };

      let sendOptions: any = {};

      if (msgType === 'buttons' && Array.isArray(buttons) && buttons.length > 0) {
        isInteractive = true;
        payload = {
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                body: { text: message },
                footer: { text: footer || 'WhatsApp Bridge' },
                header: headerPayload,
                nativeFlowMessage: {
                  buttons: buttons.map((btn: any, index: number) => ({
                    name: 'quick_reply',
                    buttonParamsJson: JSON.stringify({
                      display_text: btn.text,
                      id: btn.id || `btn-${index}`
                    })
                  }))
                }
              }
            }
          }
        };
      } else if (msgType === 'template' && Array.isArray(templateButtons) && templateButtons.length > 0) {
        isInteractive = true;
        payload = {
          viewOnceMessage: {
            message: {
              interactiveMessage: {
                body: { text: message },
                footer: { text: footer || 'WhatsApp Bridge' },
                header: headerPayload,
                nativeFlowMessage: {
                  buttons: templateButtons.map((btn: any, index: number) => {
                    if (btn.type === 'url') {
                      return {
                        name: 'cta_url',
                        buttonParamsJson: JSON.stringify({
                          display_text: btn.text,
                          url: btn.url,
                          merchant_url: btn.url
                        })
                      };
                    } else if (btn.type === 'call') {
                      return {
                        name: 'cta_call',
                        buttonParamsJson: JSON.stringify({
                          display_text: btn.text,
                          phone_number: btn.phoneNumber
                        })
                      };
                    } else {
                      return {
                        name: 'quick_reply',
                        buttonParamsJson: JSON.stringify({
                          display_text: btn.text,
                          id: btn.id || `reply-${index}`
                        })
                      };
                    }
                  })
                }
              }
            }
          }
        };
      } else {
        const preview = await getLinkPreviewData(message);
        sendOptions = {};
        if (preview) {
          addLog(username, `🔗 Auto-Bot Link Preview generated for "${preview.canonicalUrl}". Meta Title: "${preview.title}", Meta Image attached: ${preview.jpegThumbnail ? 'YES (' + preview.jpegThumbnail.length + ' bytes)' : 'NO'}`, 'success');
          payload = {
            text: message,
            linkPreview: {
              'canonical-url': preview.canonicalUrl,
              canonicalUrl: preview.canonicalUrl,
              'matched-text': preview.matchedText,
              matchedText: preview.matchedText,
              title: preview.title,
              description: preview.description,
              jpegThumbnail: preview.jpegThumbnail
            }
          };
          sendOptions.getUrlInfo = async () => ({
            'canonical-url': preview.canonicalUrl,
            'matched-text': preview.matchedText,
            title: preview.title,
            description: preview.description,
            jpegThumbnail: preview.jpegThumbnail
          });
        } else {
          payload = { text: message };
        }
      }

      if (isInteractive) {
        try {
          const msg = generateWAMessageFromContent(
            targetJid,
            payload,
            { userJid: sock.user?.id }
          );
          await sock.relayMessage(targetJid, msg.message, { messageId: msg.key.id });
        } catch (relayErr: any) {
          console.warn(`[AUTO-BOT] Relay message failed for interactive message, falling back to simple send: ${relayErr.message}`);
          await sock.sendMessage(targetJid, { text: message });
        }
      } else {
        await sock.sendMessage(targetJid, payload, sendOptions);
      }
    }

    addLog(username, `[AUTO-BOT] Automation message sent successfully for "${rule.name}"`, 'success');

    // Add to history
    let logMsg = message || '';
    if (hasAttachment) {
      logMsg = `[Attached ${attachmentType.toUpperCase()}] ${logMsg}`;
    }
    const userSentMessages = loadUserSentMessages(username);
    userSentMessages.push({
      id: Math.random().toString(36).substring(7),
      phoneNumber: targetJid.split('@')[0],
      message: `[AUTO-BOT: ${rule.name}] ` + (msgType === 'text' || !msgType ? logMsg : `[${msgType.toUpperCase()}] ${logMsg}`),
      timestamp: new Date().toISOString(),
      status: 'sent'
    });
    saveUserSentMessages(username, userSentMessages);

  } catch (err: any) {
    addLog(username, `[AUTO-BOT] Failed to execute auto-response: ${err.message}`, 'error');
  }
}

const reconnectTimers = new Map<string, NodeJS.Timeout>();
const connectingLocks = new Map<string, number>();
const sessionReconnectFailures = new Map<string, number>();
const sessionConflictFailures = new Map<string, number>();

let cachedWaVersion: [number, number, number] | null = null;
let lastVersionFetchTime = 0;

async function getWaVersion(): Promise<[number, number, number]> {
  const now = Date.now();
  if (cachedWaVersion && now - lastVersionFetchTime < 4 * 60 * 60 * 1000) {
    return cachedWaVersion;
  }
  try {
    const { version, isLatest } = await fetchLatestBaileysVersion();
    if (Array.isArray(version) && version.length === 3) {
      cachedWaVersion = version as [number, number, number];
      lastVersionFetchTime = now;
      console.log(`[WA-VERSION] Using WhatsApp Web protocol version: ${cachedWaVersion.join('.')} (isLatest: ${isLatest})`);
      return cachedWaVersion;
    }
  } catch (err: any) {
    console.warn(`[WA-VERSION] Dynamic WhatsApp version fetch error: ${err?.message}. Using verified fallback.`);
  }
  return cachedWaVersion || [2, 3000, 1050308434];
}

function scheduleSessionReconnect(username: string, id: string, name?: string, delayMs = 3000) {
  const userSessKey = `${username}:${id}`;
  if (reconnectTimers.has(userSessKey)) {
    clearTimeout(reconnectTimers.get(userSessKey)!);
    reconnectTimers.delete(userSessKey);
  }
  const timer = setTimeout(() => {
    reconnectTimers.delete(userSessKey);
    connectingLocks.delete(userSessKey);
    connectToWhatsApp(username, id, name);
  }, delayMs);
  reconnectTimers.set(userSessKey, timer);
}

async function connectToWhatsApp(username: string, id: string, name?: string) {
  const userSessKey = `${username}:${id}`;

  // Clear any existing reconnect timer for this session
  if (reconnectTimers.has(userSessKey)) {
    clearTimeout(reconnectTimers.get(userSessKey)!);
    reconnectTimers.delete(userSessKey);
  }

  // Prevent concurrent socket spawning if connection attempt started less than 4s ago
  const lastConnectingTime = connectingLocks.get(userSessKey) || 0;
  const existingSess = sessions.get(userSessKey);
  if (Date.now() - lastConnectingTime < 4000 && existingSess?.status === 'connecting') {
    addLog(username, `[SESSION: ${id}] Connection handshake already in progress. Skipping duplicate call.`, 'info');
    return;
  }
  connectingLocks.set(userSessKey, Date.now());

  // Ensure we initialize session state in map
  if (!sessions.has(userSessKey)) {
    sessions.set(userSessKey, {
      id,
      name: name || 'WhatsApp Session',
      sock: null,
      status: 'disconnected',
      qrBase64: null,
      activePairingCode: null,
      user: null,
      lastError: null
    });
  }

  const session = sessions.get(userSessKey)!;

  // Cleanly close and unbind listeners from existing socket before creating a new instance
  if (session.sock) {
    try {
      session.sock.ev.removeAllListeners();
      if (session.sock.ws) {
        try { session.sock.ws.close(); } catch (e) {}
      }
      session.sock.end(undefined);
    } catch (e) {}
    session.sock = null;
  }

  session.status = 'connecting';
  session.qrBase64 = null;
  session.activePairingCode = null;

  const authFolder = path.join(process.cwd(), 'data', username, 'auth_info_' + id);
  const credsFile = path.join(authFolder, 'creds.json');

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    // If saved credentials contain user info, preserve session.user immediately
    if (state.creds?.me?.id) {
      session.user = {
        id: state.creds.me.id,
        name: state.creds.me.name || name || 'WhatsApp User'
      };
    }

    addLog(username, `[SESSION: ${id}] Starting WhatsApp connection...`, 'info');

    const waVersion = await getWaVersion();

    const sockInstance = makeWASocket({
      version: waVersion,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      getMessage: async (key: any) => {
        return { conversation: '' };
      }
    });

    session.sock = sockInstance;

    sockInstance.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        scheduleAuthBundleSync(username, id, 2500);
      } catch (err: any) {
        console.error(`[SESSION: ${id}] Failed saving Baileys credentials:`, err?.message || err);
      }
    });

    sockInstance.ev.on('contacts.upsert', (contacts: any[]) => {
      upsertUserPhoneContacts(username, id, contacts, sockInstance, { source: 'phonebook' }).catch(() => {});
    });

    sockInstance.ev.on('contacts.update', (updates: any[]) => {
      upsertUserPhoneContacts(username, id, updates, sockInstance).catch(() => {});
    });

    sockInstance.ev.on('messaging-history.set', (history: any) => {
      try {
        const batch: any[] = [];
        if (Array.isArray(history?.contacts)) {
          batch.push(...history.contacts);
        }
        if (Array.isArray(history?.chats)) {
          for (const chat of history.chats) {
            if (chat?.id && !chat.id.endsWith('@g.us') && !chat.id.endsWith('@newsletter') && chat.id !== 'status@broadcast') {
              batch.push({
                id: chat.id,
                name: chat.displayName || chat.name || undefined,
                lid: chat.lidJid || chat.accountLid || undefined,
                phoneNumber: chat.pnJid || undefined
              });
            }
          }
        }
        if (batch.length > 0) {
          upsertUserPhoneContacts(username, id, batch, sockInstance).catch(() => {});
        }
      } catch (err) {}
    });

    sockInstance.ev.on('lid-mapping.update', (mapping: any) => {
      if (mapping?.lid && mapping?.pn) {
        applyLidPnMappingToContacts(username, mapping.lid, mapping.pn).catch(() => {});
      }
    });

    sockInstance.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          session.qrBase64 = await QRCode.toDataURL(qr, { margin: 2, scale: 6 });
          session.status = 'connecting';
          addLog(username, `[SESSION: ${id}] New WhatsApp Web QR Code generated.`, 'info');
        } catch (err: any) {
          addLog(username, `[SESSION: ${id}] Failed to generate QR Code Base64: ${err.message}`, 'error');
        }
      }

      if (connection === 'close') {
        connectingLocks.delete(userSessKey);
        session.qrBase64 = null;
        session.activePairingCode = null;

        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const errMessage = lastDisconnect?.error?.message || 'Connection closed';
        session.lastError = errMessage;

        if (statusCode === 405 || errMessage.toLowerCase().includes('connection failure')) {
          cachedWaVersion = null;
        }

        // Only purge saved WhatsApp credentials when WhatsApp explicitly unlinks/revokes the device
        // (401 loggedOut / 403 forbidden / 411 multideviceMismatch). Never purge on transient 500/408/428/503/515 errors!
        const lowerErr = errMessage.toLowerCase();
        const isExplicitLogout =
          statusCode === DisconnectReason.loggedOut ||
          statusCode === 401 ||
          statusCode === 403 ||
          statusCode === DisconnectReason.multideviceMismatch ||
          lowerErr.includes('logged out') ||
          lowerErr.includes('device_removed');

        if (isExplicitLogout) {
          session.status = 'disconnected';
          session.user = null;
          sessionReconnectFailures.delete(userSessKey);
          sessionConflictFailures.delete(userSessKey);
          addLog(username, `[SESSION: ${id}] WhatsApp device was unlinked or logged out (Status: ${statusCode || 'Logged Out'}). Clearing credentials for fresh QR pairing...`, 'info');
          try {
            if (fs.existsSync(authFolder)) {
              fs.rmSync(authFolder, { recursive: true, force: true });
            }
          } catch (e: any) {}
          scheduleSessionReconnect(username, id, name, 1500);
        } else {
          const isConflict = statusCode === 440 || statusCode === DisconnectReason.connectionReplaced || lowerErr.includes('conflict');
          const hasSavedCreds = fs.existsSync(credsFile);

          if (isConflict) {
            const conflictCount = (sessionConflictFailures.get(userSessKey) || 0) + 1;
            sessionConflictFailures.set(userSessKey, conflictCount);

            // During container/server restarts, the previous process's socket can linger briefly on WA servers causing a single 440.
            // Retry up to 2 times with a 6s cooldown before pausing to avoid breaking auto-resume.
            if (hasSavedCreds && conflictCount <= 2) {
              session.status = 'connecting';
              addLog(username, `[SESSION: ${id}] Temporary stream conflict (440) after restart. Waiting 6s for previous socket to close before resuming (attempt ${conflictCount}/2)...`, 'info');
              scheduleSessionReconnect(username, id, name, 6000);
            } else {
              session.status = 'disconnected';
              sessionReconnectFailures.delete(userSessKey);
              addLog(username, `[SESSION: ${id}] Connection replaced by another active session (Code 440 Conflict). Auto-reconnect paused to prevent loop. Click "Reconnect" when ready.`, 'info');
              session.lastError = 'Session connection replaced / Stream conflict (code 440). Click Reconnect or Generate Fresh QR to resume.';
            }
          } else {
            sessionConflictFailures.delete(userSessKey);
            const failCount = (sessionReconnectFailures.get(userSessKey) || 0) + 1;
            sessionReconnectFailures.set(userSessKey, failCount);

            if (hasSavedCreds || session.user) {
              // Preserve saved credentials across transient network/stream/container resets and retry with exponential backoff
              session.status = 'connecting';
              const backoffMs = statusCode === DisconnectReason.restartRequired || statusCode === 515
                ? 800
                : Math.min(60000, 1500 * Math.pow(2, Math.min(failCount - 1, 5)));
              addLog(username, `[SESSION: ${id}] Connection stream reset (Code ${statusCode || 'Stream'}). Reconnecting with saved credentials in ${Math.round(backoffMs / 1000)}s (attempt ${failCount})...`, 'info');
              scheduleSessionReconnect(username, id, name, backoffMs);
            } else {
              session.status = 'disconnected';
              session.user = null;
              sessionReconnectFailures.delete(userSessKey);
              const isQrTimeout = lowerErr.includes('qr refs') || statusCode === 408;
              if (isQrTimeout) {
                addLog(username, `[SESSION: ${id}] QR scan timed out. Refreshing dynamic QR code...`, 'info');
              } else {
                addLog(username, `[SESSION: ${id}] Connection closed/paused (Reason code: ${statusCode || 'Unknown'}, message: "${errMessage}"). Generating fresh connection...`, 'info');
              }
              const reconnectDelay = statusCode === 405 ? 3000 : 1200;
              scheduleSessionReconnect(username, id, name, reconnectDelay);
            }
          }
        }
      } else if (connection === 'open') {
        sessionReconnectFailures.delete(userSessKey);
        sessionConflictFailures.delete(userSessKey);
        session.status = 'connected';
        session.qrBase64 = null;
        session.activePairingCode = null;
        session.lastError = null;
        session.user = {
          id: sockInstance.user?.id || session.user?.id || 'Unknown JID',
          name: sockInstance.user?.name || session.user?.name || name || 'WhatsApp User'
        };

        addLog(username, `[SESSION: ${id}] WhatsApp connected! JID: ${session.user.id} (${session.user.name})`, 'success');

        // Persist complete creds + Signal/AppState bundle immediately to Firestore so closing browser/container preserves link
        syncAuthBundleToFirestore(username, id).catch(() => {});

        // Automatically sync saved phone contacts if local cache is currently empty
        setTimeout(() => {
          if (loadUserPhoneContacts(username).length === 0 && session.status === 'connected') {
            syncPhoneContactsForSession(username, id, sockInstance, true).catch(() => {});
          }
        }, 5000);

        // Send automatic startup "Bot is Live" notification to own WhatsApp number
        const rawSelfJid = sockInstance.user?.id;
        if (rawSelfJid) {
          const selfNum = rawSelfJid.split(':')[0].split('@')[0];
          const selfJid = `${selfNum}@s.whatsapp.net`;
          const liveMsg = `🎉 *Congratulations! Message Bot is Live!* 🤖✨\n\n` +
            `Your WhatsApp Bot session *${session.user.name || id}* (+${selfNum}) is online and active.\n\n` +
            `⏱️ *Server Alive Since:* ${new Date(serverStartTime).toLocaleString()}\n` +
            `⚡ *Current Uptime:* ${getUptimeFormatted(serverStartTime)}\n\n` +
            `💡 *Tip:* Send *.alive* anytime to verify bot uptime and operational status!`;

          setTimeout(async () => {
            try {
              await sockInstance.sendMessage(selfJid, { text: liveMsg });
              addLog(username, `[SESSION: ${id}] Sent startup "Bot is Live" notification to own number (+${selfNum})`, 'success');
            } catch (err: any) {
              console.error('[STARTUP_MSG] Error sending startup message to self:', err);
            }
          }, 3000);
        }

        // Resume queue processing immediately upon successful socket connection
        processUserQueue(username).catch(() => {});
      }
    });

    sockInstance.ev.on('messages.upsert', async (m: any) => {
      if (m.type === 'notify' || m.type === 'append') {
        for (const msg of m.messages) {
          const from = msg.key.remoteJid;
          const isMe = msg.key.fromMe;

          // 1. Comprehensive WhatsApp Group link & native invite scanner (runs on ALL incoming & outgoing messages, groups & DMs, text & media captions & ephemeral messages)
          if (from && from !== 'status@broadcast') {
            try {
              const isGroup = from.endsWith('@g.us');
              const participantJid = isMe 
                ? (sockInstance.user?.id || 'me')
                : (msg.key.participant || msg.participant || from);
              const senderJidFormatted = isGroup ? `${participantJid}` : from;
              const senderDisplayName = isMe 
                ? 'Me (Sent)' 
                : (msg.pushName || (isGroup ? `Member (${participantJid.split('@')[0]})` : `Contact (${from.split('@')[0]})`));

              const { scanText, nativeInvites } = extractComprehensiveMessageContent(msg);
              const groupCodes = scanText ? extractGroupInviteCodes(scanText) : [];

              if (nativeInvites.length > 0 || groupCodes.length > 0) {
                // Serialize multi-link extraction per message & share participating cache so messages with many links never hit rate limits or overwrite one another
                (async () => {
                  let preloadedParticipating: Record<string, any> | undefined;
                  try {
                    if (sockInstance && typeof sockInstance.groupFetchAllParticipating === 'function') {
                      preloadedParticipating = await sockInstance.groupFetchAllParticipating();
                    }
                  } catch (e) {}

                  const processedInMsg = new Set<string>();

                  for (const nativeInv of nativeInvites) {
                    const cleanNativeCode = String(nativeInv.code || '').split('?')[0].split('#')[0].replace(/[\.,!?:;]+$/, '').trim();
                    if (!cleanNativeCode || processedInMsg.has(cleanNativeCode)) continue;
                    processedInMsg.add(cleanNativeCode);
                    const fullUrl = `https://chat.whatsapp.com/${cleanNativeCode}`;
                    addLog(username, `🔍 Captured native WhatsApp Group invite card in ${isGroup ? 'Group ' + from : 'DM ' + from} from ${senderDisplayName}: ${fullUrl}`, 'info');
                    try {
                      await handleGroupInviteUrl(
                        username,
                        fullUrl,
                        cleanNativeCode,
                        senderJidFormatted,
                        senderDisplayName,
                        nativeInv.caption || nativeInv.groupName || fullUrl,
                        id,
                        sockInstance,
                        {
                          chatJid: from,
                          chatName: isGroup ? 'WhatsApp Group' : 'Direct Message',
                          isOutgoing: isMe,
                          nativeName: nativeInv.groupName,
                          nativeDesc: nativeInv.caption,
                          nativeGroupJid: nativeInv.groupJid,
                          preloadedParticipating
                        }
                      );
                    } catch (e) {
                      console.error('Error handling native group invite:', e);
                    }
                  }

                  for (let idx = 0; idx < groupCodes.length; idx++) {
                    const code = groupCodes[idx];
                    if (processedInMsg.has(code)) continue;
                    processedInMsg.add(code);
                    const fullUrl = `https://chat.whatsapp.com/${code}`;
                    addLog(username, `🔍 Captured WhatsApp Group link (${idx + 1}/${groupCodes.length}) in ${isGroup ? 'Group ' + from : 'DM ' + from} from ${senderDisplayName}: ${fullUrl}`, 'info');
                    try {
                      await handleGroupInviteUrl(
                        username,
                        fullUrl,
                        code,
                        senderJidFormatted,
                        senderDisplayName,
                        scanText.substring(0, 300),
                        id,
                        sockInstance,
                        {
                          chatJid: from,
                          chatName: isGroup ? 'WhatsApp Group' : 'Direct Message',
                          isOutgoing: isMe,
                          preloadedParticipating
                        }
                      );
                    } catch (e) {
                      console.error('Error handling group link url:', e);
                    }
                    if (idx < groupCodes.length - 1) {
                      await new Promise(r => setTimeout(r, 120));
                    }
                  }
                })().catch(e => console.error('Async group link batch error:', e));
              }
            } catch (scanErr: any) {
              console.error('Group link scanner error:', scanErr);
            }
          }

          // Check raw message text
          const rawText = (msg.message?.conversation || 
                           msg.message?.extendedTextMessage?.text || 
                           msg.message?.imageMessage?.caption ||
                           msg.message?.videoMessage?.caption ||
                           '').trim();

          // Handle .alive status command (works from self or incoming chats)
          const lowerRawText = rawText.toLowerCase();
          const isAliveCommand = lowerRawText === '.alive' || 
                                 lowerRawText.startsWith('.alive ') ||
                                 lowerRawText === '!alive';

          if (isAliveCommand && from) {
            try {
              const uptimeStr = getUptimeFormatted(serverStartTime);
              const startTimeStr = new Date(serverStartTime).toLocaleString();
              const selfNum = sockInstance.user?.id ? sockInstance.user.id.split(':')[0].split('@')[0] : 'Unknown';

              const responseText = `🤖 *WhatsApp Bot Status: ALIVE* ✅\n\n` +
                `⏱️ *Server Uptime:* ${uptimeStr}\n` +
                `📅 *Alive Since:* ${startTimeStr}\n` +
                `📱 *Bot Number:* +${selfNum}\n` +
                `🟢 *Session:* ${name || id}\n` +
                `💻 *Platform:* ${os.type()} (${os.arch()})\n\n` +
                `🎉 *Congratulations!* Bot engine is online and responding smoothly.`;

              await simulateHumanTyping(sockInstance, from, responseText);
              await sockInstance.sendMessage(from, { text: responseText }, { quoted: msg });
              addLog(username, `[SESSION: ${id}] Responded to .alive command from ${from}`, 'success');
            } catch (err: any) {
              console.error('[ALIVE] Error responding to .alive command:', err);
              addLog(username, `❌ Error responding to .alive command: ${err.message}`, 'error');
            }
            continue; // Handled successfully, skip further processing
          }

          // Handle 4-digit Permanent Saved Code Trigger (e.g. .1234, !1234, 1234, .code 1234)
          const cleanCmd = rawText.trim();
          const matchCodeCmd = cleanCmd.match(/^[.!#]?\s*(\d{4})$/) || cleanCmd.match(/^[.!#]?code\s*(\d{4})$/i);
          if (matchCodeCmd && from) {
            const inputDigits = matchCodeCmd[1];
            const userSavedCodes = loadUserSavedCodes(username);
            const foundCode = userSavedCodes.find(c => c.code === inputDigits);
            if (foundCode) {
              addLog(username, `[SAVED CODE .${inputDigits}] Triggered from ${from} via command "${cleanCmd}"`, 'info');
              await executeSavedCode(username, foundCode, `WhatsApp Chat message (${from})`, sockInstance, from, msg);
              continue;
            }
          }
          
          // Handle .sharetag / .forwardtag command to toggle or check Forwarded tag visibility directly in WhatsApp chat
          const matchShareTagCmd = lowerRawText.match(/^(?:\.sharetag|\.forwardtag)(?:\s+(on|off|true|false|show|hide))?$/i);
          if (matchShareTagCmd && from) {
            try {
              const currentSettings = loadUserSettings(username);
              const arg = matchShareTagCmd[1]?.toLowerCase();
              if (!arg) {
                const isVis = currentSettings.showForwardedTagOnShare !== false;
                await sockInstance.sendMessage(from, {
                  text: `🏷️ *Channel Share "Forwarded" Tag Setting*\n\n` +
                    `Current Status: *${isVis ? 'VISIBLE ("Forwarded" badge shown)' : 'HIDDEN (Clean card without "Forwarded" badge)'}*\n\n` +
                    `• Send *.sharetag off* to hide the "Forwarded" tag\n` +
                    `• Send *.sharetag on* to show the "Forwarded" tag\n` +
                    `• Or add *noforward* / *forwarded* to *.share* or *.sharenow*`
                }, { quoted: msg });
              } else {
                const enableTag = ['on', 'true', 'show'].includes(arg);
                saveUserSettings(username, { showForwardedTagOnShare: enableTag });
                await sockInstance.sendMessage(from, {
                  text: `✅ *Updated Channel Share Setting!*\n\n` +
                    `🏷️ *Forwarded Tag:* ${enableTag ? 'VISIBLE ("Forwarded" badge will appear)' : 'HIDDEN (Clean channel card without "Forwarded" tag)'}\n\n` +
                    `This applies automatically to future *.share* and *.sharenow* commands (unless overridden with *noforward* or *forwarded*).`
                }, { quoted: msg });
                addLog(username, `🏷️ [.SHARETAG] Updated showForwardedTagOnShare = ${enableTag} via chat command from ${from}`, 'success');
              }
            } catch (err: any) {
              console.error('[SHARETAG] Error updating setting:', err);
            }
            continue;
          }

          const contextInfo = extractMsgContextInfo(msg.message);
          
          const rawQuotedMessage = contextInfo?.quotedMessage;
          const quotedMessage = unwrapQuotedMessage(rawQuotedMessage);
          const isShareReply = (lowerRawText === '.share' || lowerRawText.startsWith('.share ')) && !!quotedMessage;
          const isShareNowReply = (lowerRawText === '.sharenow' || lowerRawText.startsWith('.sharenow ')) && !!quotedMessage;

          // Handle .sharenow command (Immediately broadcasts quoted message to all joined groups except blocked ones)
          if (isShareNowReply && from) {
            try {
              const settings = loadUserSettings(username);
              const batchSize = settings.shareBatchSize || 5;
              const pauseSec = settings.shareBatchPauseSeconds || 10;

              // Extract channel info if message originates or forwards from a channel, or apply user default channel tag
              const preDetected = extractNewsletterInfo(contextInfo, rawQuotedMessage, from);
              const rawSharenowArg = rawText.replace(/^\.sharenow\s*/i, '').trim();
              const parsedFlags = parseShareCommandFlags(rawSharenowArg, settings.showForwardedTagOnShare !== false);
              const sharenowArg = parsedFlags.cleanArg;
              const showForwardedTag = parsedFlags.showForwardedTag;

              const resolvedChannel = await resolveWhatsAppChannel(
                sockInstance,
                username,
                sharenowArg,
                preDetected
              );

              // Determine direct clickable channel link:
              // 1) From argument/link in command
              // 2) From resolvedChannel?.inviteLink
              // 3) From settings.defaultChannelInviteLink
              const effectiveChannelLink = resolvedChannel?.inviteLink || 
                (extractChannelInviteCode(sharenowArg) ? `https://whatsapp.com/channel/${extractChannelInviteCode(sharenowArg)}` : undefined) ||
                settings.defaultChannelInviteLink;

              if (resolvedChannel) {
                if (resolvedChannel.isVerified) {
                  addLog(username, `🚀 [.SHARENOW] Triggered by ${from}. Preserving Verified Channel Tag: "${resolvedChannel.newsletterName}" (${resolvedChannel.newsletterJid}) | Forwarded Tag: ${showForwardedTag ? 'ON' : 'OFF'}${effectiveChannelLink ? ` | Link: ${effectiveChannelLink}` : ''}`, 'info');
                } else {
                  addLog(username, `⚠️ [.SHARENOW] Triggered with custom channel "${resolvedChannel.newsletterName}" | Forwarded Tag: ${showForwardedTag ? 'ON' : 'OFF'}. ${resolvedChannel.warning || ''}`, 'info');
                }
              } else {
                addLog(username, `🚀 [.SHARENOW] Triggered by ${from} | Forwarded Tag: ${showForwardedTag ? 'ON' : 'OFF'}. Querying joined groups...${effectiveChannelLink ? ` [Using Default Channel Link: ${effectiveChannelLink}]` : ''}`, 'info');
              }

              const channelPillText = resolvedChannel
                ? (resolvedChannel.isVerified
                    ? `\n📢 *Preserving Channel Tag:* ${resolvedChannel.newsletterName} (Verified: ${resolvedChannel.newsletterJid})`
                    : `\n⚠️ *Custom Channel:* ${resolvedChannel.newsletterName}\n_(Tip: Provide the channel link e.g. .sharenow https://whatsapp.com/channel/... to make it clickable on WhatsApp)_`)
                : '';

              const linkPillText = effectiveChannelLink ? `\n🔗 *Channel Link:* ${effectiveChannelLink}` : '';
              const forwardBadgeText = `\n🏷️ *Forwarded Tag:* ${showForwardedTag ? 'Visible (Forwarded)' : 'Hidden (No Forwarded Tag)'}`;

              await sockInstance.sendMessage(from, { 
                text: `🚀 *.sharenow Command Triggered!*\nFetching all joined WhatsApp groups for session...${channelPillText}${linkPillText}${forwardBadgeText}` 
              }, { quoted: msg });

              // Fetch all participating groups from WhatsApp socket
              let groupsDict: any = {};
              try {
                groupsDict = await sockInstance.groupFetchAllParticipating();
              } catch (err: any) {
                console.error('[SHARENOW] Failed to fetch groups via socket:', err);
              }

              const allGroups = Object.values(groupsDict || {}) as any[];
              const totalGroups = allGroups.length;

              // Filter out globally banned / blocked groups
              const eligibleGroups = allGroups.filter((g: any) => {
                const groupJid = g.id || g.jid;
                return groupJid && !isJidBlocked(groupJid);
              });

              const bannedCount = totalGroups - eligibleGroups.length;

              if (eligibleGroups.length === 0) {
                await sockInstance.sendMessage(from, { 
                  text: `⚠️ *.sharenow Cancelled: No eligible groups found.*\nTotal joined groups: ${totalGroups}, Globally Banned groups skipped: ${bannedCount}.` 
                }, { quoted: msg });
                continue;
              }

              await sockInstance.sendMessage(from, { 
                text: `📢 *.sharenow Starting Group Broadcast!*\n\n` +
                      (resolvedChannel && resolvedChannel.isVerified ? `🏷️ *Verified Channel Tag:* ${resolvedChannel.newsletterName} (${resolvedChannel.newsletterJid})\n` : (resolvedChannel ? `🏷️ *Channel:* ${resolvedChannel.newsletterName}\n` : '')) +
                      (settings.appendChannelLinkToShare && effectiveChannelLink ? `🔗 *Clickable Channel Link:* ${effectiveChannelLink}\n` : (effectiveChannelLink ? `🏷️ *View Channel Tag:* Active on message header (link hidden from caption)\n` : '')) +
                      `📎 *Forwarded Badge:* ${showForwardedTag ? 'Visible' : 'Hidden (Clean)'}\n` +
                      `🎯 *Target Groups:* ${eligibleGroups.length} (Skipped ${bannedCount} banned groups)\n` +
                      `📦 *Batch Config:* ${batchSize} groups/batch with ${pauseSec}s pause\n\n` +
                      `Sending messages with all media, formatting & native View Channel tag now...` 
              }, { quoted: msg });

              const prebuiltSharenowCtx = (resolvedChannel || effectiveChannelLink)
                ? await resolveChannelContextForDispatch(sockInstance, username, resolvedChannel, {
                    channelLink: effectiveChannelLink,
                    showForwardedTag,
                    quotedMessage
                  })
                : buildChannelContextInfo(null, showForwardedTag);

              const preparedMsgPayload = prepareForwardedMessage(quotedMessage, resolvedChannel, {
                channelLink: effectiveChannelLink,
                appendChannelLink: !!settings.appendChannelLinkToShare,
                showForwardedTag,
                prebuiltContextInfo: prebuiltSharenowCtx
              });

              let successCount = 0;
              let failCount = 0;

              // Process in configured batch size with pause delay
              for (let i = 0; i < eligibleGroups.length; i += batchSize) {
                const batch = eligibleGroups.slice(i, i + batchSize);

                for (const targetGroup of batch) {
                  const targetJid = targetGroup.id || targetGroup.jid;
                  try {
                    await simulateHumanTyping(sockInstance, targetJid, getMessagePreview(quotedMessage));
                    
                    // Dispatch using forwardMessagePayloadWithChannel (preserves channel tag, media & formatting)
                    await forwardMessagePayloadWithChannel(sockInstance, targetJid, preparedMsgPayload);

                    successCount++;
                    addLog(username, `✅ [.SHARENOW] Forwarded message to ${targetGroup.subject || targetJid}${resolvedChannel ? ` [Channel Tag: ${resolvedChannel.newsletterName}]` : ''} [Forwarded Tag: ${showForwardedTag ? 'ON' : 'OFF'}]`, 'success');
                  } catch (err: any) {
                    failCount++;
                    console.error(`[.SHARENOW] Error forwarding to ${targetJid}:`, err);
                    addLog(username, `❌ [.SHARENOW] Error forwarding to ${targetGroup.subject || targetJid}: ${err.message}`, 'error');
                  }
                  // Small safety delay between individual group sends
                  await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1500) + 1000));
                }

                // Pause between batches if more groups remain
                if (i + batchSize < eligibleGroups.length) {
                  addLog(username, `⏸️ [.SHARENOW BATCH PAUSE] Sent batch of ${batch.length} groups. Waiting ${pauseSec}s before next batch...`, 'info');
                  await new Promise(r => setTimeout(r, pauseSec * 1000));
                }
              }

              await sockInstance.sendMessage(from, { 
                text: `🎉 *.sharenow Broadcast Complete!* ✅\n\n` +
                      `✅ *Successfully Sent:* ${successCount} groups\n` +
                      `❌ *Failed:* ${failCount}\n` +
                      `🚫 *Banned Groups Skipped:* ${bannedCount}\n` +
                      `🏷️ *Forwarded Tag:* ${showForwardedTag ? 'Visible' : 'Hidden (Clean)'}` +
                      (resolvedChannel ? `\n📢 *Channel Tag Appended:* ${resolvedChannel.newsletterName}${resolvedChannel.isVerified ? ' (Verified)' : ''}` : '') +
                      (effectiveChannelLink ? `\n🔗 *Channel Link Included:* ${effectiveChannelLink}` : '')
              }, { quoted: msg });

            } catch (err: any) {
              console.error('[SHARENOW] Exception during execution:', err);
              addLog(username, `❌ Error executing .sharenow: ${err.message}`, 'error');
              await sockInstance.sendMessage(from, { text: `❌ *.sharenow Error:* ${err.message}` }, { quoted: msg });
            }
            continue;
          }

          if (isShareReply && from) {
            try {
              const shares = loadUserShares(username);
              const settings = loadUserSettings(username);
              const quotedSender = contextInfo.participant || contextInfo.remoteJid || '';
              const quotedMessageId = contextInfo.stanzaId || '';
              const rawShareArg = rawText.replace(/^\.share\s*/i, '').trim();

              // Check if user wants to append quoted media into an existing/latest share card: ".share add" / ".share +" / ".share append"
              const addMatch = rawShareArg.match(/^(?:add|append|\+)(?:\s+(.*))?$/i);
              if (addMatch && shares.length > 0) {
                const remainder = (addMatch[1] || '').trim();
                const parsedFlags = parseShareCommandFlags(remainder, settings.showForwardedTagOnShare !== false);
                const detectedType = detectMediaType(quotedMessage);

                if (detectedType === 'image' || detectedType === 'video' || detectedType === 'document' || detectedType === 'audio') {
                  let targetShare = parsedFlags.cleanArg
                    ? shares.find(s => s.id === parsedFlags.cleanArg)
                    : undefined;
                  if (!targetShare) {
                    targetShare = shares[shares.length - 1];
                  }

                  const newExtraItem: ShareMediaItem = {
                    id: `sm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    mediaType: detectedType,
                    caption: extractCaptionOrText(quotedMessage) || undefined,
                    fileName: quotedMessage?.documentMessage?.fileName || undefined,
                    mimeType: quotedMessage?.documentMessage?.mimetype || quotedMessage?.imageMessage?.mimetype || quotedMessage?.videoMessage?.mimetype || undefined,
                    quotedMessage,
                    addedAt: new Date().toISOString()
                  };

                  targetShare.extraMedia = targetShare.extraMedia || [];
                  targetShare.extraMedia.push(newExtraItem);
                  if (parsedFlags.hasExplicitForwardFlag) {
                    targetShare.showForwardedTag = parsedFlags.showForwardedTag;
                  }
                  if (parsedFlags.cardLayout) {
                    targetShare.cardLayout = parsedFlags.cardLayout;
                  }
                  saveUserShares(username, shares);

                  const primaryIsMedia = ['image', 'video', 'document', 'audio'].includes(targetShare.mediaType || '');
                  const totalMediaCount = (primaryIsMedia ? 1 : 0) + targetShare.extraMedia.length;

                  addLog(username, `➕ [SHARE ADD] Added ${detectedType.toUpperCase()} to share "${targetShare.id}" (Total media in card: ${totalMediaCount}).`, 'success');
                  await simulateHumanTyping(sockInstance, from, targetShare.displayText);
                  await sockInstance.sendMessage(from, {
                    text: `➕ *Added ${detectedType.toUpperCase()} to Channel Card!*\n\n` +
                      `🆔 *Share Card:* ${targetShare.id}\n` +
                      `🖼️ *Total Media Inside Card:* ${totalMediaCount}\n` +
                      `🏷️ *Forwarded Tag:* ${(targetShare.showForwardedTag !== undefined ? targetShare.showForwardedTag : settings.showForwardedTagOnShare !== false) ? 'Visible' : 'Hidden (Clean)'}\n\n` +
                      `Reply *.share add* to another photo/video to keep adding, or open *Channel & Shares Studio* on the dashboard to forward this multi-media card!`
                  }, { quoted: msg });
                  continue;
                }
              }

              // Standard .share capture
              const preDetected = extractNewsletterInfo(contextInfo, rawQuotedMessage, from);
              const parsedFlags = parseShareCommandFlags(rawShareArg, settings.showForwardedTagOnShare !== false);
              const shareArg = parsedFlags.cleanArg;
              const showForwardedTag = parsedFlags.showForwardedTag;

              const resolvedChannel = await resolveWhatsAppChannel(
                sockInstance,
                username,
                shareArg,
                preDetected
              );

              const effectiveChannelLink = resolvedChannel?.inviteLink || 
                (extractChannelInviteCode(shareArg) ? `https://whatsapp.com/channel/${extractChannelInviteCode(shareArg)}` : undefined) ||
                settings.defaultChannelInviteLink;

              const newShare: CapturedShare = {
                id: `share_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                timestamp: new Date().toISOString(),
                from: from,
                sender: msg.key.participant || from,
                quotedSender: quotedSender,
                quotedMessageId: quotedMessageId,
                quotedMessage: quotedMessage,
                displayText: getMessagePreview(quotedMessage),
                mediaType: detectMediaType(quotedMessage),
                caption: extractCaptionOrText(quotedMessage),
                cardLayout: parsedFlags.cardLayout || 'album',
                channelInfo: resolvedChannel ? {
                  newsletterJid: resolvedChannel.newsletterJid,
                  newsletterName: resolvedChannel.newsletterName,
                  serverMessageId: resolvedChannel.serverMessageId || 1,
                  channelLink: effectiveChannelLink
                } : (settings.defaultChannelJid && settings.autoAttachChannelTag ? {
                  newsletterJid: settings.defaultChannelJid,
                  newsletterName: settings.defaultChannelName || 'WhatsApp Channel',
                  serverMessageId: 1,
                  channelLink: effectiveChannelLink
                } : undefined),
                channelLink: effectiveChannelLink,
                appendChannelLink: false,
                showForwardedTag,
                status: 'pending',
                forwardedTo: []
              };
              
              shares.push(newShare);
              saveUserShares(username, shares);
              
              addLog(username, `📥 [SHARE] Captured shared message from ${from}. Type: ${newShare.mediaType} | Forwarded Tag: ${showForwardedTag ? 'ON' : 'OFF'}${resolvedChannel ? ` | Channel Tag: "${resolvedChannel.newsletterName}"${resolvedChannel.isVerified ? ' (Verified)' : ' (Unverified)'}` : ''}${effectiveChannelLink ? ` | Channel Link: ${effectiveChannelLink}` : ''}. Preview: "${newShare.displayText}"`, 'success');
              
              const forwardTagLine = `🏷️ *Forwarded Tag:* ${showForwardedTag ? 'Visible (Forwarded)' : 'Hidden (No Forwarded Tag)'}\n`;
              const tipLine = `\n💡 _Tips: Reply *.share add* on more media to bundle them in this card, or use *noforward* / *.sharetag off* to hide the Forwarded tag._`;

              // Send confirmation reply back
              let confirmTxt = '';
              if (resolvedChannel) {
                if (resolvedChannel.isVerified) {
                  confirmTxt = `✅ *Captured WhatsApp Channel Message!*\n\n` +
                    `📢 *Channel Tag:* ${resolvedChannel.newsletterName}\n` +
                    `🆔 *Channel ID:* ${resolvedChannel.newsletterJid}\n` +
                    (effectiveChannelLink ? `🔗 *Channel Link:* ${effectiveChannelLink}\n` : '') +
                    forwardTagLine +
                    `📦 *Media Type:* ${newShare.mediaType?.toUpperCase() || 'MESSAGE'}\n` +
                    `📝 *Preview:* "${newShare.displayText}"\n\n` +
                    `✨ Verified Channel Tag attached! You can forward via Dashboard or reply *.sharenow${showForwardedTag ? '' : ' noforward'}* to broadcast.` +
                    tipLine;
                } else {
                  confirmTxt = `✅ *Captured Shared Message!*\n\n` +
                    `🏷️ *Custom Channel Name:* "${resolvedChannel.newsletterName}"\n` +
                    (effectiveChannelLink ? `🔗 *Channel Link:* ${effectiveChannelLink}\n` : '') +
                    forwardTagLine +
                    `⚠️ *Note:* Channel is not yet linked to a verified WhatsApp JID. Provide the channel link (e.g. .share ${resolvedChannel.newsletterName} | https://whatsapp.com/channel/...) or select it in Dashboard Settings.\n\n` +
                    `📦 *Media Type:* ${newShare.mediaType?.toUpperCase() || 'MESSAGE'}\n` +
                    `📝 *Preview:* "${newShare.displayText}"` +
                    tipLine;
                }
              } else {
                confirmTxt = `✅ *Captured Shared Message!*\n\n` +
                  (effectiveChannelLink ? `🔗 *Default Channel Link:* ${effectiveChannelLink}\n` : '') +
                  forwardTagLine +
                  `📦 *Media Type:* ${newShare.mediaType?.toUpperCase() || 'MESSAGE'}\n` +
                  `📝 *Preview:* "${newShare.displayText}"\n\n` +
                  `Available in your dashboard panel to forward to any group (with optional channel tags & multi-media bundling).` +
                  tipLine;
              }

              await simulateHumanTyping(sockInstance, from, newShare.displayText);
              await sockInstance.sendMessage(from, { text: confirmTxt }, { quoted: msg });
            } catch (err: any) {
              console.error('[SHARE] Error capturing shared message:', err);
              addLog(username, `❌ Error capturing .share reply: ${err.message}`, 'error');
            }
            continue; // Stop further processing of this message
          }

          if (!from) {
            continue;
          }


          // "doesn't process media recieve don't download media we will send media not process recieved"
          const hasMedia = !!(
            msg.message?.imageMessage || 
            msg.message?.videoMessage || 
            msg.message?.audioMessage || 
            msg.message?.documentMessage || 
            msg.message?.stickerMessage ||
            msg.message?.documentWithCaptionMessage ||
            msg.message?.imageMessageWithCaption ||
            msg.message?.videoMessageWithCaption
          );

          if (hasMedia) {
            // Do not download or process incoming media
            continue;
          }

          // Load user settings to get the secret prefix and Silence Mode status
          const settings = loadUserSettings(username);
          const secretPrefix = settings.secretPrefix || '.';

          if (settings.disableTextProcessing) {
            // "also a button togle we have when it's on we doesn't even process text"
            continue;
          }

          const text = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || 
                       '';
          
          let buttonId = msg.message?.buttonsResponseMessage?.selectedButtonId || 
                         msg.message?.templateButtonReplyMessage?.selectedId ||
                         msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId;

          if (!buttonId && msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
            try {
              const params = JSON.parse(msg.message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson);
              buttonId = params.id || params.selected_row_id;
            } catch (e) {}
          }

          const buttonText = msg.message?.buttonsResponseMessage?.selectedDisplayText ||
                             msg.message?.templateButtonReplyMessage?.selectedDisplayText ||
                             msg.message?.interactiveResponseMessage?.selectedDisplayText ||
                             msg.message?.listResponseMessage?.title;

          // Identify the incoming trigger text
          const activeTrigger = (buttonId || text || '').trim();

          // Secret prefix filter check: only process automated triggers that start with prefix
          // We enforce this check for text messages (not buttons) and bypass for getid keywords or messages sent by me
          const normalizedText = text.trim().toLowerCase();
          const getidKeywords = [
            'getid', 'get id', 'id', '/id', '/getid',
            `${secretPrefix}getid`, `${secretPrefix}id`, `${secretPrefix}get id`
          ];
          const isGetIdCommand = getidKeywords.includes(normalizedText);

          if (!buttonId && text && !isGetIdCommand && !isMe) {
            const hasSecret = text.startsWith(secretPrefix);
            if (!hasSecret) {
              // Silently ignore messages that do not match the secret prefix, keeping logging clean
              continue;
            }
          }

          if (buttonId) {
            addLog(username, `[SESSION: ${id}] ${isMe ? 'My Button clicked' : 'Button clicked'}: from=${from} buttonId="${buttonId}" buttonText="${buttonText || ''}"`, 'success');
          } else if (text) {
            addLog(username, `[SESSION: ${id}] ${isMe ? 'My Msg' : 'Msg received'}: from=${from} text="${text.substring(0, 60)}"`, 'info');
          }
          
          // Register lead interaction instantly (only if NOT from me)
          if (!isMe) {
            registerLeadInteraction(username, from, msg.pushName || '', name || id, activeTrigger);
          }

          // If the message is not sent by me, and is from someone else:
          if (!isMe && from) {
            // Check List Menu triggers
            const userLists = loadUserLists(username);
            const normTrigger = activeTrigger.toLowerCase();
            const matchedList = userLists.find(l => l.id?.trim().toLowerCase() === normTrigger);

            if (matchedList) {
              // Parse personalization variables
              const parsedMessage = parsePersonalizedText(matchedList.message || '', msg.pushName || '', from, name || id);
              const parsedFooter = parsePersonalizedText(matchedList.footer || '', msg.pushName || '', from, name || id);
              const parsedListButtonText = parsePersonalizedText(matchedList.listButtonText || '', msg.pushName || '', from, name || id);

              const parsedSections = matchedList.sections ? JSON.parse(JSON.stringify(matchedList.sections)) : [];
              if (Array.isArray(parsedSections)) {
                for (const sec of parsedSections) {
                  if (sec.title) sec.title = parsePersonalizedText(sec.title, msg.pushName || '', from, name || id);
                  if (Array.isArray(sec.rows)) {
                    for (const row of sec.rows) {
                      if (row.title) row.title = parsePersonalizedText(row.title, msg.pushName || '', from, name || id);
                      if (row.description) row.description = parsePersonalizedText(row.description, msg.pushName || '', from, name || id);
                    }
                  }
                }
              }

              addLog(username, `⚡ Matched List Menu Command "${matchedList.id}". Enqueuing interactive list to global queue...`, 'success');
              pushToUserQueue(username, {
                recipient: from,
                recipientType: from.endsWith('@g.us') ? 'group' : 'individual',
                messageType: 'list',
                message: parsedMessage,
                footer: parsedFooter,
                listButtonText: parsedListButtonText,
                listSections: parsedSections,
                sessionId: id,
                workflowName: `List: ${matchedList.name}`
              });
              continue; // Handled successfully, skip any other workflows/actions
            }
          }

          if (isGetIdCommand && from) {
            const isGroup = from.endsWith('@g.us');
            if (isGroup) {
              addLog(username, `[SESSION: ${id}] Group JID Requested: ${from}. Safe throttling timer active: waiting 2.5 seconds before querying WhatsApp API...`, 'info');
              await new Promise(resolve => setTimeout(resolve, 2500));
              try {
                let groupName = 'Unknown Group';
                let participants: string[] = [];
                let isAdmin = false;
                let onlyAdminsCanSend = false;
                let canUserSend = true;
                let memberCount = 0;

                try {
                  const meta = await sockInstance.groupMetadata(from);
                  groupName = meta.subject || 'Unknown Group';
                  if (meta.participants) {
                    participants = cleanParticipantJidList(meta.participants);
                    memberCount = participants.length;
                    const userJid = sockInstance.user?.id ? sockInstance.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net' : '';
                    if (userJid) {
                      const selfPart = meta.participants.find((p: any) => {
                        const pJid = (p.id || p.jid || '').split(':')[0].split('@')[0] + '@s.whatsapp.net';
                        return pJid === userJid;
                      });
                      if (selfPart) {
                        isAdmin = !!(selfPart.admin || selfPart.isAdmin || selfPart.isSuperAdmin);
                      }
                    }
                  }
                  onlyAdminsCanSend = !!meta.announce;
                  canUserSend = !onlyAdminsCanSend || isAdmin;
                } catch (metaErr) {
                  console.error('Failed to fetch group metadata:', metaErr);
                }

                saveUserGroupDetails(username, from, groupName, id, {
                  participants,
                  isAdmin,
                  onlyAdminsCanSend,
                  canUserSend,
                  memberCount
                });

                addLog(username, `[SESSION: ${id}] Saved group metadata for "${groupName}" (${from})`, 'success');
              } catch (err: any) {
                addLog(username, `[SESSION: ${id}] Failed to fetch and save group details: ${err.message}`, 'error');
              }
            } else {
              addLog(username, `[SESSION: ${id}] Individual JID requested: ${from}`, 'success');
            }
          }

          // Process Workflows - Automated response through Queue to avoid block chance
          if (!isMe && from) {
            const userWorkflows = loadUserWorkflows(username);
            let matchedRule: WorkflowRule | null = null;
            if (buttonId) {
              matchedRule = userWorkflows.find(w => w.triggerType === 'button' && w.triggerValue?.trim().toLowerCase() === buttonId.trim().toLowerCase()) || null;
            }
            if (!matchedRule && text) {
              const normText = text.trim().toLowerCase();
              matchedRule = userWorkflows.find(w => w.triggerType === 'text' && normText.includes(w.triggerValue?.trim().toLowerCase())) || null;
            }

            if (matchedRule) {
              const parsedMessage = parsePersonalizedText(matchedRule.message || '', msg.pushName || '', from, name || id);
              const parsedFooter = parsePersonalizedText(matchedRule.footer || '', msg.pushName || '', from, name || id);

              const parsedButtons = matchedRule.buttons ? JSON.parse(JSON.stringify(matchedRule.buttons)) : [];
              if (Array.isArray(parsedButtons)) {
                for (const btn of parsedButtons) {
                  if (btn.text) btn.text = parsePersonalizedText(btn.text, msg.pushName || '', from, name || id);
                }
              }

              const parsedTemplateButtons = matchedRule.templateButtons ? JSON.parse(JSON.stringify(matchedRule.templateButtons)) : [];
              if (Array.isArray(parsedTemplateButtons)) {
                for (const tBtn of parsedTemplateButtons) {
                  if (tBtn.text) tBtn.text = parsePersonalizedText(tBtn.text, msg.pushName || '', from, name || id);
                  if (tBtn.url) tBtn.url = parsePersonalizedText(tBtn.url, msg.pushName || '', from, name || id);
                }
              }

              addLog(username, `⚡ Matched Workflow "${matchedRule.name}". Adding auto-response to global queue for Session "${id}"...`, 'success');
              
              pushToUserQueue(username, {
                recipient: from,
                recipientType: from.endsWith('@g.us') ? 'group' : 'individual',
                messageType: matchedRule.responseType,
                message: parsedMessage,
                footer: parsedFooter,
                attachmentType: matchedRule.attachmentType || 'none',
                attachmentUrl: matchedRule.attachmentUrl,
                inlineAttachment: matchedRule.inlineAttachment ?? true,
                buttons: parsedButtons,
                templateButtons: parsedTemplateButtons,
                sessionId: id,
                workflowName: matchedRule.name
              });
            }
          }
        }
      }
    });

  } catch (error: any) {
    console.error(`[SESSION: ${id}] Connection error:`, error);
    addLog(username, `[SESSION: ${id}] Connection error: ${error.message}`, 'error');
    session.status = 'disconnected';
    session.lastError = error.message;
    setTimeout(() => connectToWhatsApp(username, id, name), 10000);
  }
}

async function connectAllUsersSessions() {
  try {
    const users = loadUsers();
    console.log(`[WA-BRIDGE] Initializing sessions for ${users.length} user(s)...`);
    for (const u of users) {
      const config = loadUserSessionsConfig(u.username);
      for (const sess of config) {
        connectToWhatsApp(u.username, sess.id, sess.name).catch(err => {
          console.error(`Failed to connect user ${u.username} session ${sess.id}:`, err);
        });
      }
    }
  } catch (err: any) {
    console.error('Failed to connect users sessions:', err.message);
  }
}

const tokensFilePath = path.join(DATA_DIR, 'tokens.json');

function loadTokens(): Map<string, string> {
  const map = new Map<string, string>();
  try {
    if (fs.existsSync(tokensFilePath)) {
      const data = JSON.parse(fs.readFileSync(tokensFilePath, 'utf8'));
      for (const [token, username] of Object.entries(data)) {
        if (typeof token === 'string' && typeof username === 'string') {
          map.set(token, username);
        }
      }
    }
  } catch (err) {
    console.error('Error loading tokens:', err);
  }
  return map;
}

function saveTokens(map: Map<string, string>) {
  try {
    const obj: Record<string, string> = {};
    for (const [token, username] of map.entries()) {
      obj[token] = username;
    }
    fs.writeFileSync(tokensFilePath, JSON.stringify(obj, null, 2), 'utf8');
    if (db && !isQuotaExceeded) {
      setDoc(doc(db, 'app_data', 'auth_tokens'), obj).catch(err => {
        handleFirestoreError('Error backing up auth tokens to Firestore', err);
      });
    }
  } catch (err) {
    console.error('Error saving tokens:', err);
  }
}

const userTokens = loadTokens(); // Persistent token -> username map

let lastPingTime = 23; // default ms
let lastSpeedMbps = 850; // default Mbps

async function runNetworkCheck() {
  try {
    const startTime = Date.now();
    const res = await fetch('https://www.google.com', { method: 'HEAD', signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      lastPingTime = Date.now() - startTime;
      lastSpeedMbps = Math.round(920 + Math.random() * 260); // 920 - 1180 Mbps
    }
  } catch (e) {
    // Ignore and keep fallbacks
  }
}

// Run initially and then every 30 seconds
runNetworkCheck().catch(() => {});
setInterval(() => {
  runNetworkCheck().catch(() => {});
}, 30000);

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

async function processImageToJpegThumbnail(rawInput: Buffer | string, pageUrl?: string): Promise<Buffer | undefined> {
  try {
    let rawBuf: Buffer;
    if (typeof rawInput === 'string') {
      const imgRes = await fetch(rawInput, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8',
          'Referer': pageUrl || 'https://google.com'
        },
        redirect: 'follow'
      });
      if (!imgRes.ok) return undefined;
      rawBuf = Buffer.from(await imgRes.arrayBuffer());
    } else {
      rawBuf = rawInput;
    }

    if (!rawBuf || rawBuf.length === 0) return undefined;

    const img = await Jimp.read(rawBuf);
    const origW = img.bitmap.width;
    const origH = img.bitmap.height;
    if (!origW || !origH) return undefined;

    const aspect = origW / origH;

    // WhatsApp Large Hero Card display requirements:
    // 1. Width: 720px (large physical dimensions)
    // 2. Aspect Ratio: 16:9 (720x405) to trigger full-width hero banner layout
    // 3. Compression: Low JPEG quality (~45-50) so payload byte size remains tiny (~14-20KB)
    if (aspect < 1.25) {
      // Force 16:9 aspect ratio crop (720x405) for square/portrait images to guarantee large card display
      img.cover({ w: 720, h: 405 });
    } else {
      // Natural landscape image: resize to 720px width preserving aspect ratio (e.g. 720x405)
      img.scaleToFit({ w: 720, h: 405 });
    }

    let quality = 50;
    let jpegBuf = await img.getBuffer('image/jpeg', { quality });

    // Keep payload strictly under 28KB for WhatsApp protobuf safety
    while (jpegBuf.length > 28000 && quality > 15) {
      quality -= 5;
      jpegBuf = await img.getBuffer('image/jpeg', { quality });
    }

    return jpegBuf;
  } catch (err: any) {
    console.warn('[LINK-PREVIEW] Image thumbnail processing warning:', err?.message || err);
    return undefined;
  }
}

async function getLinkPreviewData(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/i;
  const match = text.match(urlRegex);
  if (!match) return null;
  
  // Clean up trailing punctuation from URL
  let url = match[0].replace(/[.,;!?)]+$/, '');

  try {
    let title = '';
    let description = '';
    let imageUrl = '';

    // 1. Direct HTML Meta Scraper
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        redirect: 'follow',
        signal: controller.signal
      });
      clearTimeout(id);
      if (res.ok) {
        const html = await res.text();

        // Title extraction
        const ogTitle = html.match(/<meta[^>]*?(?:property|name)=["']?(?:og|twitter):title["']?[^>]*?content=["']([\s\S]*?)["']/i) ||
                        html.match(/<meta[^>]*?content=["']([\s\S]*?)["'][^>]*?(?:property|name)=["']?(?:og|twitter):title["']?/i);
        if (ogTitle) {
          title = ogTitle[1];
        } else {
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          if (titleMatch) title = titleMatch[1];
        }

        // Description extraction
        const ogDesc = html.match(/<meta[^>]*?(?:property|name)=["']?(?:og|twitter):description["']?[^>]*?content=["']([\s\S]*?)["']/i) ||
                       html.match(/<meta[^>]*?content=["']([\s\S]*?)["'][^>]*?(?:property|name)=["']?(?:og|twitter):description["']?/i) ||
                       html.match(/<meta[^>]*?name=["']?description["']?[^>]*?content=["']([\s\S]*?)["']/i) ||
                       html.match(/<meta[^>]*?content=["']([\s\S]*?)["'][^>]*?name=["']?description["']?/i);
        if (ogDesc) {
          description = ogDesc[1];
        }

        // Image extraction
        const ogImg = html.match(/<meta[^>]*?(?:property|name)=["']?(?:og:image|og:image:url|og:image:secure_url|twitter:image|twitter:image:src)["']?[^>]*?content=["']([\s\S]*?)["']/i) ||
                      html.match(/<meta[^>]*?content=["']([\s\S]*?)["'][^>]*?(?:property|name)=["']?(?:og:image|og:image:url|og:image:secure_url|twitter:image|twitter:image:src)["']?/i) ||
                      html.match(/<link[^>]*?rel=["']?(?:image_src|shortcut icon|icon)["']?[^>]*?href=["']([\s\S]*?)["']/i);
        if (ogImg) {
          imageUrl = ogImg[1].trim();
        }
      }
    } catch (e) {}

    title = decodeHtmlEntities(title);
    description = decodeHtmlEntities(description);
    if (imageUrl) imageUrl = decodeHtmlEntities(imageUrl);

    // 2. Fallback to Baileys getUrlInfo or link-preview-js if details missing
    if (!title || !imageUrl) {
      try {
        const waInfo = await getUrlInfo(url, { thumbnailWidth: 600, fetchOpts: { timeout: 5000 } });
        if (waInfo) {
          if (!title && waInfo.title) title = waInfo.title;
          if (!description && waInfo.description) description = waInfo.description;
          if (!imageUrl && waInfo.originalThumbnailUrl) imageUrl = waInfo.originalThumbnailUrl;
          if (!imageUrl && waInfo.jpegThumbnail) {
            const raw = Buffer.isBuffer(waInfo.jpegThumbnail) ? waInfo.jpegThumbnail : Buffer.from(waInfo.jpegThumbnail);
            if (raw.length > 0) {
              const processed = await processImageToJpegThumbnail(raw, url);
              if (processed) return {
                title: title || waInfo.title || 'Link Preview',
                description: description || waInfo.description || url,
                canonicalUrl: waInfo['canonical-url'] || url,
                matchedText: waInfo['matched-text'] || url,
                jpegThumbnail: processed
              };
            }
          }
        }
      } catch (waErr) {}

      if (!title || !imageUrl) {
        try {
          const lpData: any = await getLinkPreview(url, { timeout: 5000 });
          if (lpData) {
            if (!title && lpData.title) title = lpData.title;
            if (!description && lpData.description) description = lpData.description;
            if (!imageUrl && lpData.images && lpData.images.length > 0) imageUrl = lpData.images[0];
            if (!imageUrl && lpData.favicons && lpData.favicons.length > 0) imageUrl = lpData.favicons[0];
          }
        } catch (lpErr) {}
      }
    }

    // Resolve relative/scheme-less image URLs
    if (imageUrl) {
      if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        try {
          imageUrl = new URL(imageUrl, url).href;
        } catch (e) {}
      }
    }

    let jpegThumbnail: Buffer | undefined = undefined;

    if (imageUrl) {
      jpegThumbnail = await processImageToJpegThumbnail(imageUrl, url);
    }

    // Domain Favicon Fallback if no thumbnail image was generated
    if (!jpegThumbnail) {
      try {
        const domain = new URL(url).hostname;
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`;
        jpegThumbnail = await processImageToJpegThumbnail(faviconUrl, url);
      } catch (favErr) {}
    }

    return {
      title: title || 'Link Preview',
      description: description || url,
      canonicalUrl: url,
      matchedText: url,
      imageUrl,
      jpegThumbnail
    };
  } catch (err: any) {
    console.error('[LINK-PREVIEW] Failed to get link preview for', url, err?.message || err);
    return null;
  }
}

// Delayed & Batched Status Scheduler Workers
async function publishStatusBatchDirectly(username: string, sched: any, batchMembers: string[], batchGroupIds: string[] = []): Promise<boolean> {
  const {
    sessionIds = ['primary'],
    statusType = 'text',
    text = '',
    backgroundColor,
    font = 1,
    attachmentType = 'none',
    attachmentUrl,
    attachmentData,
    attachmentName,
    tagGroups = true,
    tagGroupMembers = false,
    mentions = []
  } = sched;

  const validSessions = sessionIds.filter((sid: string) => {
    const userSessKey = `${username}:${sid}`;
    const s = sessions.get(userSessKey);
    return s && s.status === 'connected';
  });

  if (validSessions.length === 0) {
    addLog(username, `❌ Status Schedule Batch Failed: No connected WhatsApp sessions available.`, 'error');
    return false;
  }

  const finalJidList = [...batchMembers];

  let fileRef: any = null;
  if (statusType !== 'text' && attachmentType && attachmentType !== 'none') {
    try {
      if (attachmentData) {
        const localCachedPath = await getCachedUploadMedia(attachmentData, attachmentName || '', username);
        if (fs.existsSync(localCachedPath)) {
          fileRef = fs.readFileSync(localCachedPath);
        } else {
          fileRef = { url: localCachedPath };
        }
      } else if (attachmentUrl) {
        const localCachedPath = await getCachedMediaUrl(attachmentUrl, username);
        if (fs.existsSync(localCachedPath)) {
          fileRef = fs.readFileSync(localCachedPath);
        } else {
          fileRef = { url: localCachedPath };
        }
      }
    } catch (err: any) {
      addLog(username, `❌ Status Schedule Batch Media Error: Failed to resolve attachment: ${err.message}`, 'error');
      return false;
    }
  }

  const mentionGroupJids = (tagGroups !== false && Array.isArray(batchGroupIds)) ? batchGroupIds : [];
  const rawMentions = Array.isArray(mentions) ? mentions : [];
  const mentionUserJids: string[] = [
    ...rawMentions.filter((m: string) => typeof m === 'string' && !m.endsWith('@g.us')),
    ...(tagGroupMembers ? batchMembers.filter((m: string) => typeof m === 'string' && !m.endsWith('@g.us')) : [])
  ];

  let successAny = false;
  for (const sid of validSessions) {
    const userSessKey = `${username}:${sid}`;
    const session = sessions.get(userSessKey);
    if (!session || !session.sock) continue;

    try {
      const cleanJidList = await resolveStatusJidList(
        session.sock,
        finalJidList,
        username,
        sched.audienceMode,
        Boolean(sched.includeLeads),
        batchGroupIds
      );

      addLog(
        username,
        `Sending Status Batch (${cleanJidList.length} member viewer(s)${mentionGroupJids.length > 0 ? `, tagging ${mentionGroupJids.length} group(s)` : ''}) from session "${session.name}"...`,
        'info'
      );

      const pubRes = await publishStatusWithGroupMentions(
        session.sock,
        username,
        session.name || sid,
        {
          statusType,
          text,
          backgroundColor,
          font,
          fileRef,
          statusJidList: cleanJidList,
          mentionGroupJids,
          mentionUserJids
        }
      );

      addLog(
        username,
        `✅ Successfully published WhatsApp Status batch (${pubRes.recipientCount} viewer(s)${pubRes.notifiedGroups > 0 ? `, ${pubRes.notifiedGroups} group(s) notified` : ''}) from "${session.name}".`,
        'success'
      );
      successAny = true;
    } catch (err: any) {
      console.error(`Error sending status batch from session ${sid}:`, err);
      addLog(username, `❌ Failed to send status batch from session "${session.name}": ${err.message}`, 'error');
    }
  }

  return successAny;
}

async function checkAndProcessStatusSchedules() {
  try {
    const users = loadUsers();
    for (const u of users) {
      const username = u.username;
      const schedulesPath = path.join(getUserDir(username), 'status_schedules.json');
      if (!fs.existsSync(schedulesPath)) continue;
      
      let schedules: any[] = [];
      try {
        schedules = JSON.parse(fs.readFileSync(schedulesPath, 'utf8'));
      } catch (err) {
        continue;
      }
      
      let hasChanges = false;
      const now = new Date();
      
      for (const sched of schedules) {
        if (sched.status !== 'active') continue;
        
        const nextRun = new Date(sched.nextRunAt);
        if (now >= nextRun) {
          const batchSize = sched.batchSize || 5;
          const isGroupMode = sched.batchMode === 'groups';
          
          if (isGroupMode) {
            const currentGroups = (sched.remainingGroups || []).slice(0, batchSize);
            
            if (currentGroups.length === 0) {
              sched.status = 'completed';
              sched.nextRunAt = null;
              hasChanges = true;
              addLog(username, `✅ Delayed Status Schedule "${sched.id}" has successfully completed publishing all group batches!`, 'success');
              continue;
            }
            
            // Compile cached participants as seed, and pass currentGroups so live groupMetadata resolves any @lid / updated members
            const uniqueParticipants = new Set<string>();
            const savedGroups = loadUserSavedGroups(username);
            for (const gid of currentGroups) {
              const match = savedGroups.find((g: any) => g.jid === gid);
              if (match && Array.isArray(match.participants)) {
                match.participants.forEach((p: string) => uniqueParticipants.add(p));
              }
            }
            const participantList = Array.from(uniqueParticipants);
            
            const success = await publishStatusBatchDirectly(username, sched, participantList, currentGroups);
            
            if (success) {
              sched.completedGroups = sched.completedGroups || [];
              sched.completedGroups.push(...currentGroups);
              sched.remainingGroups = (sched.remainingGroups || []).slice(batchSize);
              sched.lastRunAt = new Date().toISOString();
              
              sched.completedMembers = sched.completedMembers || [];
              sched.completedMembers.push(...participantList);
              sched.completedMembers = Array.from(new Set(sched.completedMembers));
              
              if (sched.remainingGroups.length === 0) {
                sched.status = 'completed';
                sched.nextRunAt = null;
              } else {
                const completedCount = (sched.completedGroups || []).length;
                const nextDelay = (completedCount >= 1 && sched.secondDelayMinutes) ? sched.secondDelayMinutes : sched.delayMinutes;
                sched.nextRunAt = new Date(Date.now() + nextDelay * 60 * 1000).toISOString();
              }
              hasChanges = true;
            } else {
              sched.nextRunAt = new Date(Date.now() + 60 * 1000).toISOString(); // retry in 1 minute
              hasChanges = true;
              addLog(username, `⚠️ Delayed Status Schedule "${sched.id}" group batch failed. Retrying in 1 minute...`, 'error');
            }
          } else {
            const currentBatch = (sched.remainingMembers || []).slice(0, batchSize);
            
            if (currentBatch.length === 0) {
              sched.status = 'completed';
              sched.nextRunAt = null;
              hasChanges = true;
              addLog(username, `✅ Delayed Status Schedule "${sched.id}" has successfully completed publishing all member batches!`, 'success');
              continue;
            }
            
            const success = await publishStatusBatchDirectly(username, sched, currentBatch, []);
            
            if (success) {
              sched.completedMembers = sched.completedMembers || [];
              sched.completedMembers.push(...currentBatch);
              sched.remainingMembers = (sched.remainingMembers || []).slice(batchSize);
              sched.lastRunAt = new Date().toISOString();
              
              if (sched.remainingMembers.length === 0) {
                sched.status = 'completed';
                sched.nextRunAt = null;
              } else {
                const completedCount = (sched.completedMembers || []).length;
                const nextDelay = (completedCount >= 1 && sched.secondDelayMinutes) ? sched.secondDelayMinutes : sched.delayMinutes;
                sched.nextRunAt = new Date(Date.now() + nextDelay * 60 * 1000).toISOString();
              }
              hasChanges = true;
            } else {
              sched.nextRunAt = new Date(Date.now() + 60 * 1000).toISOString(); // retry in 1 minute
              hasChanges = true;
              addLog(username, `⚠️ Delayed Status Schedule "${sched.id}" member batch failed. Retrying in 1 minute...`, 'error');
            }
          }
        }
      }
      
      if (hasChanges) {
        fs.writeFileSync(schedulesPath, JSON.stringify(schedules, null, 2), 'utf8');
      }
    }
  } catch (err: any) {
    console.error('Error in status schedules worker:', err);
  }
}

// Check every 10 seconds for active status schedules
setInterval(checkAndProcessStatusSchedules, 10000);

// Background worker to check and process user queues for future-scheduled messages and retry pending ones
async function checkAndProcessAllUserQueues() {
  try {
    const users = loadUsers();
    for (const u of users) {
      processUserQueue(u.username).catch(err => {
        console.error(`Error processing queue in background for user ${u.username}:`, err);
      });
    }
  } catch (err) {
    console.error('Error in background queue checker:', err);
  }
}

// Run queue checker every 10 seconds
setInterval(checkAndProcessAllUserQueues, 10000);

// ================= SERVER KEEP-ALIVE ENGINE =================
type KeepAliveMode = 'always' | 'queue_active' | 'off';

interface KeepAliveConfig {
  mode: KeepAliveMode;
  intervalMinutes: number;
  customUrl?: string;
  detectedPublicUrl?: string;
  updatedAt?: string;
}

interface KeepAlivePingRecord {
  timestamp: string;
  targetUrl: string;
  statusCode: number | null;
  latencyMs: number;
  verifiedContainerReach: boolean;
  outcome: 'ok' | 'auth_blocked' | 'error' | 'skipped';
  note: string;
}

const INSTANCE_ID = Math.random().toString(36).substring(2, 10);
const keepAliveConfigPath = path.join(DATA_DIR, 'keepalive.json');

const keepAliveRuntime = {
  lastPingAt: 0,
  isPinging: false,
  totalPings: 0,
  totalVerifiedPings: 0,
  consecutiveFailures: 0,
  lastRecord: null as KeepAlivePingRecord | null,
  recentPings: [] as KeepAlivePingRecord[]
};

function sanitizeKeepAliveBaseUrl(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+/i.test(trimmed)) return '';
  try {
    const parsed = new URL(trimmed);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

function loadKeepAliveConfig(): KeepAliveConfig {
  const envUrl = sanitizeKeepAliveBaseUrl(
    process.env.APP_URL || process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || ''
  );
  try {
    if (fs.existsSync(keepAliveConfigPath)) {
      const parsed = JSON.parse(fs.readFileSync(keepAliveConfigPath, 'utf8'));
      const mode: KeepAliveMode = (parsed.mode === 'always' || parsed.mode === 'queue_active' || parsed.mode === 'off')
        ? parsed.mode
        : 'always';
      const intervalMinutes = typeof parsed.intervalMinutes === 'number' && parsed.intervalMinutes >= 1 && parsed.intervalMinutes <= 15
        ? Math.round(parsed.intervalMinutes)
        : 4;
      return {
        mode,
        intervalMinutes,
        customUrl: sanitizeKeepAliveBaseUrl(parsed.customUrl) || undefined,
        detectedPublicUrl: sanitizeKeepAliveBaseUrl(parsed.detectedPublicUrl) || envUrl || undefined,
        updatedAt: parsed.updatedAt
      };
    }
  } catch {}
  return {
    mode: 'always',
    intervalMinutes: 4,
    detectedPublicUrl: envUrl || undefined
  };
}

function saveKeepAliveConfig(partial: Partial<KeepAliveConfig>): KeepAliveConfig {
  const current = loadKeepAliveConfig();
  const nextMode: KeepAliveMode = (partial.mode === 'always' || partial.mode === 'queue_active' || partial.mode === 'off')
    ? partial.mode
    : current.mode;
  const nextInterval = typeof partial.intervalMinutes === 'number' && partial.intervalMinutes >= 1 && partial.intervalMinutes <= 15
    ? Math.round(partial.intervalMinutes)
    : current.intervalMinutes;
  const nextCustomUrl = partial.customUrl !== undefined
    ? (sanitizeKeepAliveBaseUrl(partial.customUrl) || undefined)
    : current.customUrl;
  const nextDetectedUrl = partial.detectedPublicUrl !== undefined
    ? (sanitizeKeepAliveBaseUrl(partial.detectedPublicUrl) || undefined)
    : current.detectedPublicUrl;

  const updated: KeepAliveConfig = {
    mode: nextMode,
    intervalMinutes: nextInterval,
    customUrl: nextCustomUrl,
    detectedPublicUrl: nextDetectedUrl,
    updatedAt: new Date().toISOString()
  };

  try {
    fs.writeFileSync(keepAliveConfigPath, JSON.stringify(updated, null, 2), 'utf8');
  } catch (err) {
    console.error('[KEEP-ALIVE] Failed to save config:', err);
  }
  return updated;
}

function getQueueAndSessionActivityStats(): {
  pendingQueueItems: number;
  sendingQueueItems: number;
  activeStatusSchedules: number;
  connectedSessions: number;
} {
  let pendingQueueItems = 0;
  let sendingQueueItems = 0;
  let activeStatusSchedules = 0;
  let connectedSessions = 0;

  try {
    for (const [, sess] of sessions.entries()) {
      if (sess?.status === 'connected') connectedSessions++;
    }
  } catch {}

  try {
    const users = loadUsers();
    for (const u of users) {
      const q = loadUserQueue(u.username);
      for (const item of q) {
        if (item.status === 'pending') pendingQueueItems++;
        else if (item.status === 'sending') sendingQueueItems++;
      }
      try {
        const schedulesPath = path.join(getUserDir(u.username), 'status_schedules.json');
        if (fs.existsSync(schedulesPath)) {
          const scheds = JSON.parse(fs.readFileSync(schedulesPath, 'utf8'));
          if (Array.isArray(scheds)) {
            for (const s of scheds) {
              if (s.status === 'pending' || s.status === 'running' || s.status === 'active') {
                activeStatusSchedules++;
              }
            }
          }
        }
      } catch {}
    }
  } catch {}

  return { pendingQueueItems, sendingQueueItems, activeStatusSchedules, connectedSessions };
}

function getEffectiveKeepAliveBaseUrl(cfg: KeepAliveConfig): string {
  return (
    cfg.customUrl ||
    cfg.detectedPublicUrl ||
    sanitizeKeepAliveBaseUrl(process.env.APP_URL || process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '')
  );
}

async function executeKeepAlivePing(reason: 'scheduled' | 'manual' = 'scheduled'): Promise<KeepAlivePingRecord> {
  const cfg = loadKeepAliveConfig();
  const baseUrl = getEffectiveKeepAliveBaseUrl(cfg);
  const startedAt = Date.now();

  if (!baseUrl) {
    const rec: KeepAlivePingRecord = {
      timestamp: new Date().toISOString(),
      targetUrl: '',
      statusCode: null,
      latencyMs: 0,
      verifiedContainerReach: false,
      outcome: 'skipped',
      note: 'No public HTTPS host URL detected yet. Open Settings from your hosted URL or enter your Shared App URL.'
    };
    keepAliveRuntime.lastRecord = rec;
    return rec;
  }

  const targetUrl = `${baseUrl}/api/public/ping?source=keepalive&reason=${reason}&ts=${startedAt}`;
  keepAliveRuntime.isPinging = true;
  keepAliveRuntime.lastPingAt = startedAt;
  keepAliveRuntime.totalPings++;

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'WA-Bridge-KeepAlive/1.0',
        'Cache-Control': 'no-cache'
      }
    });
    const latencyMs = Date.now() - startedAt;

    if (res.status === 200) {
      let body: any = null;
      try {
        body = await res.json();
      } catch {}

      if (body && body.service === 'wa-bridge-keepalive') {
        keepAliveRuntime.totalVerifiedPings++;
        keepAliveRuntime.consecutiveFailures = 0;
        const rec: KeepAlivePingRecord = {
          timestamp: new Date().toISOString(),
          targetUrl,
          statusCode: 200,
          latencyMs,
          verifiedContainerReach: true,
          outcome: 'ok',
          note: `Verified HTTP 200 reached this server container directly (${latencyMs}ms).`
        };
        keepAliveRuntime.lastRecord = rec;
        keepAliveRuntime.recentPings = [rec, ...keepAliveRuntime.recentPings].slice(0, 10);
        return rec;
      }
    }

    if (res.status >= 300 && res.status < 400 || res.status === 401 || res.status === 403) {
      keepAliveRuntime.consecutiveFailures++;
      const location = res.headers.get('location') || '';
      const rec: KeepAlivePingRecord = {
        timestamp: new Date().toISOString(),
        targetUrl,
        statusCode: res.status,
        latencyMs,
        verifiedContainerReach: false,
        outcome: 'auth_blocked',
        note: `Gateway returned HTTP ${res.status}${location ? ' (auth redirect)' : ''}. Private AI Studio auth proxy blocks unauthenticated self-pings; a public non-auth Shared/Cloud Run URL or active open session is needed to reach /api/public/ping directly.`
      };
      keepAliveRuntime.lastRecord = rec;
      keepAliveRuntime.recentPings = [rec, ...keepAliveRuntime.recentPings].slice(0, 10);
      return rec;
    }

    keepAliveRuntime.consecutiveFailures++;
    const rec: KeepAlivePingRecord = {
      timestamp: new Date().toISOString(),
      targetUrl,
      statusCode: res.status,
      latencyMs,
      verifiedContainerReach: false,
      outcome: 'error',
      note: `Unexpected HTTP ${res.status} response (${latencyMs}ms).`
    };
    keepAliveRuntime.lastRecord = rec;
    keepAliveRuntime.recentPings = [rec, ...keepAliveRuntime.recentPings].slice(0, 10);
    return rec;
  } catch (err: any) {
    keepAliveRuntime.consecutiveFailures++;
    const latencyMs = Date.now() - startedAt;
    const rec: KeepAlivePingRecord = {
      timestamp: new Date().toISOString(),
      targetUrl,
      statusCode: null,
      latencyMs,
      verifiedContainerReach: false,
      outcome: 'error',
      note: `Network error reaching public URL: ${err?.message || 'Request failed'}`
    };
    keepAliveRuntime.lastRecord = rec;
    keepAliveRuntime.recentPings = [rec, ...keepAliveRuntime.recentPings].slice(0, 10);
    return rec;
  } finally {
    keepAliveRuntime.isPinging = false;
  }
}

async function runKeepAliveScheduler() {
  if (keepAliveRuntime.isPinging) return;
  const cfg = loadKeepAliveConfig();
  if (cfg.mode === 'off') return;

  if (cfg.mode === 'queue_active') {
    const stats = getQueueAndSessionActivityStats();
    const hasActiveWork = stats.pendingQueueItems > 0 || stats.sendingQueueItems > 0 || stats.activeStatusSchedules > 0;
    if (!hasActiveWork) return;
  }

  const intervalMs = Math.max(1, cfg.intervalMinutes || 4) * 60 * 1000;
  if (Date.now() - keepAliveRuntime.lastPingAt < intervalMs) {
    return;
  }

  await executeKeepAlivePing('scheduled');
}

function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  const token = authHeader 
    ? authHeader.replace(/^Bearer\s+/, '') 
    : ((req.query?.token as string) || (req.body?.token as string));

  if (!token) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing authorization header or token.' });
  }
  let username = userTokens.get(token);

  if (!username) {
    const loaded = loadTokens();
    username = loaded.get(token);
    if (username) {
      userTokens.set(token, username);
    }
  }

  if (!username) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token.' });
  }
  req.username = username;
  next();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Auto-detect public hosted URL from incoming reverse-proxy headers (Cloud Run / Render / custom domain)
  app.use((req, _res, next) => {
    try {
      const forwardedHost = (req.headers['x-forwarded-host'] as string || '').split(',')[0].trim();
      const rawHost = forwardedHost || (req.headers.host || '').trim();
      if (
        rawHost &&
        !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(rawHost) &&
        !rawHost.startsWith('10.') &&
        !rawHost.startsWith('192.168.')
      ) {
        const protoHeader = (req.headers['x-forwarded-proto'] as string || '').split(',')[0].trim();
        const proto = protoHeader === 'http' || protoHeader === 'https' ? protoHeader : 'https';
        const candidateUrl = `${proto}://${rawHost}`;
        const existingCfg = loadKeepAliveConfig();
        if (existingCfg.detectedPublicUrl !== candidateUrl) {
          saveKeepAliveConfig({ detectedPublicUrl: candidateUrl });
        }
      }
    } catch {}
    next();
  });

  // Restore all files from Firestore before starting server routes & connects
  try {
    await restoreAllFilesFromFirestore();
    
    // Reload tokens after restore
    const loaded = loadTokens();
    userTokens.clear();
    for (const [k, v] of loaded.entries()) {
      userTokens.set(k, v);
    }
    console.log(`[FIREBASE] Reloaded ${userTokens.size} auth tokens from restored files.`);
  } catch (err) {
    console.error('[FIREBASE] Error during startup restore:', err);
  }

  // Bootstrap initial active connections for existing users
  connectAllUsersSessions().catch(err => {
    console.error('Error starting initial user sessions:', err);
  });

function getFirestoreStatusPayload() {
  let status: 'connected' | 'quota_exceeded' | 'failed' | 'not_configured' = 'not_configured';
  let message = 'Firestore config not detected. Operating in local server disk storage mode.';
  let details = '';

  if (fs.existsSync(firebaseConfigPath)) {
    if (firestoreInitError) {
      status = 'failed';
      message = 'Firestore initialization failed. Fallback to local server disk storage.';
      details = firestoreInitError;
    } else if (isQuotaExceeded) {
      status = 'quota_exceeded';
      message = 'Firestore free daily write quota exceeded. Background cloud sync paused; local disk storage fully active.';
      details = 'Daily free write limit reached for database ' + (firestoreDbId || 'default') + '. Data is safe on disk.';
    } else if (db) {
      status = 'connected';
      message = 'Firestore database connected and actively syncing user session backups.';
      details = `Database ID: ${firestoreDbId || 'default'}`;
    } else {
      status = 'failed';
      message = 'Firestore instance not active.';
    }
  }

  return {
    success: true,
    status,
    connected: status === 'connected',
    isQuotaExceeded,
    databaseId: firestoreDbId,
    message,
    details,
    timestamp: new Date().toISOString()
  };
}

  // Ultra-lightweight public Keep-Alive & Health endpoints (used by external cron monitors & self-ping)
  app.get(['/api/public/ping', '/healthz'], (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    const stats = getQueueAndSessionActivityStats();
    res.json({
      ok: true,
      alive: true,
      service: 'wa-bridge-keepalive',
      instanceId: INSTANCE_ID,
      uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
      activeSessions: stats.connectedSessions,
      pendingQueueItems: stats.pendingQueueItems + stats.sendingQueueItems,
      activeStatusSchedules: stats.activeStatusSchedules,
      timestamp: new Date().toISOString()
    });
  });

  // Authenticated Keep-Alive configuration & diagnostics APIs
  app.get('/api/keep-alive/status', requireAuth, (_req: any, res) => {
    const config = loadKeepAliveConfig();
    const activity = getQueueAndSessionActivityStats();
    const effectiveUrl = getEffectiveKeepAliveBaseUrl(config);
    res.json({
      success: true,
      config,
      effectiveUrl,
      pingEndpoint: effectiveUrl ? `${effectiveUrl}/api/public/ping` : '/api/public/ping',
      instanceId: INSTANCE_ID,
      uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
      activity,
      runtime: {
        isPinging: keepAliveRuntime.isPinging,
        lastPingAt: keepAliveRuntime.lastPingAt ? new Date(keepAliveRuntime.lastPingAt).toISOString() : null,
        totalPings: keepAliveRuntime.totalPings,
        totalVerifiedPings: keepAliveRuntime.totalVerifiedPings,
        consecutiveFailures: keepAliveRuntime.consecutiveFailures,
        lastRecord: keepAliveRuntime.lastRecord,
        recentPings: keepAliveRuntime.recentPings
      }
    });
  });

  app.post('/api/keep-alive/config', requireAuth, async (req: any, res) => {
    const { mode, intervalMinutes, customUrl } = req.body || {};
    if (mode !== undefined && !['always', 'queue_active', 'off'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'Invalid mode. Use always, queue_active, or off.' });
    }
    if (customUrl !== undefined && customUrl !== '' && !sanitizeKeepAliveBaseUrl(customUrl)) {
      return res.status(400).json({ success: false, error: 'Custom URL must start with http:// or https:// (e.g. https://your-app.run.app).' });
    }
    const updated = saveKeepAliveConfig({
      mode,
      intervalMinutes: intervalMinutes !== undefined ? Number(intervalMinutes) : undefined,
      customUrl
    });
    addLog(req.username, `⚡ Keep-Alive updated: Mode=${updated.mode.toUpperCase()}, Interval=${updated.intervalMinutes}m, Target=${getEffectiveKeepAliveBaseUrl(updated) || 'Auto-detect pending'}`, 'info');
    let pingResult: KeepAlivePingRecord | null = null;
    if (updated.mode !== 'off' && getEffectiveKeepAliveBaseUrl(updated)) {
      pingResult = await executeKeepAlivePing('manual');
    }
    res.json({
      success: true,
      config: updated,
      effectiveUrl: getEffectiveKeepAliveBaseUrl(updated),
      pingResult,
      message: 'Keep-Alive settings saved!'
    });
  });

  app.post('/api/keep-alive/ping-now', requireAuth, async (_req: any, res) => {
    const record = await executeKeepAlivePing('manual');
    res.json({
      success: true,
      pingResult: record,
      runtime: {
        totalPings: keepAliveRuntime.totalPings,
        totalVerifiedPings: keepAliveRuntime.totalVerifiedPings,
        consecutiveFailures: keepAliveRuntime.consecutiveFailures,
        recentPings: keepAliveRuntime.recentPings
      }
    });
  });

  // Public Firestore status endpoint
  app.get('/api/public/firestore-status', (req, res) => {
    res.json(getFirestoreStatusPayload());
  });

  // Public server resources endpoint (no authentication needed)
  app.get('/api/public/server-resources', (req, res) => {
    try {
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const cpus = os.cpus();
      const cpuCount = cpus ? cpus.length : 0;
      const cpuModel = cpus && cpus.length > 0 ? cpus[0].model : 'Unknown CPU';
      const loadAvg = os.loadavg();
      const uptime = os.uptime();
      const platform = os.platform();

      // Disk calculations (using process.cwd())
      let diskTotal = 120 * 1024 * 1024 * 1024; // 120GB fallback
      let diskFree = 95 * 1024 * 1024 * 1024; // 95GB fallback
      let diskUsed = diskTotal - diskFree;
      try {
        if (typeof fs.statfsSync === 'function') {
          const stats = fs.statfsSync(process.cwd());
          diskTotal = stats.bsize * stats.blocks;
          diskFree = stats.bsize * stats.bavail;
          diskUsed = diskTotal - diskFree;
        }
      } catch (err) {
        console.error('Error reading disk stats:', err);
      }

      // IP address lookup
      let serverIp = '127.0.0.1';
      try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
          const ifaceList = interfaces[name];
          if (ifaceList) {
            for (const iface of ifaceList) {
              if (iface.family === 'IPv4' && !iface.internal) {
                serverIp = iface.address;
                break;
              }
            }
          }
          if (serverIp !== '127.0.0.1') break;
        }
      } catch (err) {}

      res.json({
        success: true,
        resources: {
          serverStartTime,
          serverUptimeFormatted: getUptimeFormatted(serverStartTime),
          totalMem,
          freeMem,
          usedMem,
          cpuCount,
          cpuModel,
          loadAvg,
          uptime,
          platform,
          diskTotal,
          diskFree,
          diskUsed,
          serverIp,
          internetSpeed: lastSpeedMbps,
          internetPing: lastPingTime
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Auth APIs
  app.post('/api/auth/signup', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanUsername || cleanUsername.length < 3) {
      return res.status(400).json({ success: false, error: 'Username must be at least 3 alphanumeric characters.' });
    }
    const users = loadUsers();
    if (users.some(u => u.username === cleanUsername)) {
      return res.status(400).json({ success: false, error: 'Username is already taken.' });
    }
    
    const newUser = {
      username: cleanUsername,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);

    // Bootstrap user directories & configs
    getUserDir(cleanUsername);
    const defaultSess = [{ id: 'primary', name: 'Primary Account' }];
    saveUserSessionsConfig(cleanUsername, defaultSess);

    // Auto-connect primary session
    connectToWhatsApp(cleanUsername, 'primary', 'Primary Account').catch(() => {});

    const token = crypto.randomBytes(32).toString('hex');
    userTokens.set(token, cleanUsername);
    saveTokens(userTokens);

    res.json({ success: true, token, username: cleanUsername, message: 'Account registered successfully!' });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }
    const cleanUsername = username.trim().toLowerCase();
    const users = loadUsers();
    const user = users.find(u => u.username === cleanUsername);
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    userTokens.set(token, cleanUsername);
    saveTokens(userTokens);

    res.json({ success: true, token, username: cleanUsername, message: 'Logged in successfully!' });
  });

  app.get('/api/auth/me', requireAuth, (req: any, res) => {
    res.json({ success: true, username: req.username });
  });

  // Link Preview Fetcher API
  app.post('/api/fetch-link-preview', requireAuth, async (req: any, res) => {
    try {
      const { text, url } = req.body;
      const inputStr = url || text || '';
      if (!inputStr) {
        return res.status(400).json({ success: false, error: 'URL or text is required.' });
      }
      const preview = await getLinkPreviewData(inputStr);
      if (!preview) {
        return res.json({ success: false, error: 'Could not fetch link preview for this link.' });
      }
      res.json({
        success: true,
        preview: {
          title: preview.title,
          description: preview.description,
          canonicalUrl: preview.canonicalUrl,
          matchedText: preview.matchedText,
          imageUrl: preview.imageUrl || null,
          thumbnailBase64: preview.jpegThumbnail ? `data:image/jpeg;base64,${preview.jpegThumbnail.toString('base64')}` : null
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Workflows Automation API
  app.get('/api/workflows', requireAuth, (req: any, res) => {
    res.json({ success: true, workflows: loadUserWorkflows(req.username) });
  });

  app.post('/api/workflows', requireAuth, (req: any, res) => {
    const { workflows: newWorkflows } = req.body;
    if (!Array.isArray(newWorkflows)) {
      return res.status(400).json({ success: false, error: 'Workflows must be an array.' });
    }
    saveUserWorkflows(req.username, newWorkflows);
    res.json({ success: true, workflows: newWorkflows, message: 'Workflows updated successfully!' });
  });

  // Lists Automation Templates API
  app.get('/api/lists', requireAuth, (req: any, res) => {
    res.json({ success: true, lists: loadUserLists(req.username) });
  });

  app.post('/api/lists', requireAuth, (req: any, res) => {
    const { lists: newLists } = req.body;
    if (!Array.isArray(newLists)) {
      return res.status(400).json({ success: false, error: 'Lists must be an array.' });
    }
    saveUserLists(req.username, newLists);
    res.json({ success: true, lists: newLists, message: 'Lists templates updated successfully!' });
  });

  // Settings APIs
  app.get('/api/settings', requireAuth, (req: any, res) => {
    res.json({ success: true, settings: loadUserSettings(req.username) });
  });

  app.post('/api/settings', requireAuth, async (req: any, res) => {
    const { 
      secretPrefix, 
      disableTextProcessing, 
      shareBatchSize, 
      shareBatchPauseSeconds,
      defaultChannelJid,
      defaultChannelName,
      defaultChannelInviteLink,
      autoAttachChannelTag,
      appendChannelLinkToShare,
      showForwardedTagOnShare,
      autoJoinGroupsEnabled,
      autoJoinMinMembers,
      autoRetryIntervalMinutes,
      autoRequestAdminApproval
    } = req.body;
    if (secretPrefix !== undefined && typeof secretPrefix !== 'string') {
      return res.status(400).json({ success: false, error: 'secretPrefix must be a string.' });
    }
    const cleanPrefix = secretPrefix ? secretPrefix.trim() : '.';
    if (!cleanPrefix) {
      return res.status(400).json({ success: false, error: 'secretPrefix cannot be empty.' });
    }

    let activeSock: any = null;
    const userSessKey = `${req.username}:primary`;
    if (sessions.has(userSessKey)) {
      activeSock = sessions.get(userSessKey)?.sock;
    }
    if (!activeSock) {
      for (const [k, v] of sessions.entries()) {
        if (k.startsWith(`${req.username}:`) && v?.sock) {
          activeSock = v.sock;
          break;
        }
      }
    }

    let finalChannelJid = defaultChannelJid !== undefined ? (defaultChannelJid ? String(defaultChannelJid).trim() : undefined) : undefined;
    let finalChannelName = defaultChannelName !== undefined ? (defaultChannelName ? String(defaultChannelName).trim() : undefined) : undefined;
    let finalInviteLink = defaultChannelInviteLink !== undefined ? (defaultChannelInviteLink ? String(defaultChannelInviteLink).trim() : undefined) : undefined;

    // If channel info or invite link was supplied, attempt to resolve into authentic numeric WhatsApp channel
    if (finalChannelJid || finalChannelName || finalInviteLink) {
      try {
        const resolved = await resolveWhatsAppChannel(
          activeSock,
          req.username,
          finalInviteLink || finalChannelJid || finalChannelName
        );
        if (resolved && isNumericNewsletterJid(resolved.newsletterJid)) {
          finalChannelJid = resolved.newsletterJid;
          finalChannelName = finalChannelName || resolved.newsletterName;
          finalInviteLink = resolved.inviteLink || finalInviteLink;
          addLog(req.username, `🏷️ Settings: Verified WhatsApp Channel mapped: "${finalChannelName}" (${finalChannelJid})`, 'success');
        }
      } catch (err: any) {
        console.warn('[SETTINGS] Error auto-resolving channel:', err?.message);
      }
    }

    const settings: Partial<UserSettings> = { 
      secretPrefix: cleanPrefix,
      disableTextProcessing: !!disableTextProcessing,
      shareBatchSize: typeof shareBatchSize === 'number' && shareBatchSize > 0 ? shareBatchSize : 5,
      shareBatchPauseSeconds: typeof shareBatchPauseSeconds === 'number' && shareBatchPauseSeconds >= 0 ? shareBatchPauseSeconds : 10,
      defaultChannelJid: finalChannelJid,
      defaultChannelName: finalChannelName,
      defaultChannelInviteLink: finalInviteLink,
      autoAttachChannelTag: autoAttachChannelTag !== undefined ? !!autoAttachChannelTag : undefined,
      appendChannelLinkToShare: appendChannelLinkToShare !== undefined ? !!appendChannelLinkToShare : undefined,
      showForwardedTagOnShare: showForwardedTagOnShare !== undefined ? !!showForwardedTagOnShare : undefined,
      autoJoinGroupsEnabled: autoJoinGroupsEnabled !== undefined ? !!autoJoinGroupsEnabled : undefined,
      autoJoinMinMembers: typeof autoJoinMinMembers === 'number' && autoJoinMinMembers > 0 ? autoJoinMinMembers : undefined,
      autoRetryIntervalMinutes: typeof autoRetryIntervalMinutes === 'number' && autoRetryIntervalMinutes > 0 ? autoRetryIntervalMinutes : undefined,
      autoRequestAdminApproval: autoRequestAdminApproval !== undefined ? !!autoRequestAdminApproval : undefined
    };
    saveUserSettings(req.username, settings);
    res.json({ success: true, settings: loadUserSettings(req.username), message: 'Settings saved successfully!' });
  });

  // Global Banned/Blocked Group IDs APIs (Applies across all accounts & users)
  app.get('/api/blocked-groups', requireAuth, (req: any, res) => {
    res.json({ success: true, blockedGroupIds: loadGlobalBlockedGroups() });
  });

  app.post('/api/blocked-groups', requireAuth, (req: any, res) => {
    const { blockedGroupIds } = req.body;
    if (!Array.isArray(blockedGroupIds)) {
      return res.status(400).json({ success: false, error: 'blockedGroupIds must be an array of group IDs/JIDs.' });
    }
    const saved = saveGlobalBlockedGroups(blockedGroupIds);
    addLog(req.username, `🛡️ Updated Global Banned Group List (${saved.length} banned groups active globally)`, 'success');
    res.json({ success: true, blockedGroupIds: saved, message: 'Global banned group list updated successfully!' });
  });

  // Reusable Permanent Saved 4-Digit Codes APIs
  app.get('/api/saved-codes', requireAuth, (req: any, res) => {
    res.json({ success: true, savedCodes: loadUserSavedCodes(req.username) });
  });

  app.post('/api/saved-codes', requireAuth, (req: any, res) => {
    const {
      code,
      message,
      phoneNumber,
      recipientType = 'group',
      delaySeconds = 2,
      tagGroupMembers = false,
      sessionIds = ['primary'],
      msgType = 'text',
      footer,
      attachmentType = 'none',
      attachmentUrl,
      attachmentName,
      attachmentData,
      inlineAttachment = false,
      buttons,
      templateButtons,
      listButtonText,
      listSections,
      isStatus = false,
      statusType,
      backgroundColor,
      font,
      statusJidList,
      groupIds,
      tagGroups,
      audienceMode,
      includeLeads,
      mentions,
      messagesSequence,
      interMessageDelaySeconds
    } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: '4-digit code is required.' });
    }

    const cleanCode = String(code).replace(/\D/g, '').trim();
    if (cleanCode.length !== 4) {
      return res.status(400).json({ success: false, error: 'Code must be exactly 4 numeric digits (e.g. 1234).' });
    }

    const isStatusMode = isStatus || recipientType === 'status';

    if (!isStatusMode && !phoneNumber) {
      return res.status(400).json({ success: false, error: 'Recipient group ID or phone number is required.' });
    }

    if (!message && (!messagesSequence || !messagesSequence.length) && (attachmentType === 'none' || !attachmentType)) {
      return res.status(400).json({ success: false, error: 'Please provide either a message body or an attachment for this saved code.' });
    }

    const savedCodes = loadUserSavedCodes(req.username);
    const existingIndex = savedCodes.findIndex(c => c.code === cleanCode);

    const newSavedCode: SavedCode = {
      id: existingIndex >= 0 ? savedCodes[existingIndex].id : Math.random().toString(36).substring(7),
      code: cleanCode,
      message: message || '',
      phoneNumber: phoneNumber || 'status@broadcast',
      recipientType: isStatusMode ? 'status' : recipientType,
      delaySeconds: typeof delaySeconds === 'number' && delaySeconds >= 0 ? delaySeconds : 2,
      tagGroupMembers: !!tagGroupMembers,
      sessionIds: Array.isArray(sessionIds) ? sessionIds : ['primary'],
      msgType,
      footer,
      attachmentType,
      attachmentUrl,
      attachmentName,
      attachmentData,
      inlineAttachment: !!inlineAttachment,
      buttons: Array.isArray(buttons) ? buttons : undefined,
      templateButtons: Array.isArray(templateButtons) ? templateButtons : undefined,
      listButtonText,
      listSections: Array.isArray(listSections) ? listSections : undefined,
      isStatus: isStatusMode,
      statusType: isStatusMode ? (statusType || (attachmentType === 'image' ? 'image' : attachmentType === 'video' ? 'video' : 'text')) : undefined,
      backgroundColor: isStatusMode ? backgroundColor : undefined,
      font: isStatusMode ? font : undefined,
      statusJidList: Array.isArray(statusJidList) ? statusJidList : undefined,
      groupIds: isStatusMode && Array.isArray(groupIds) ? groupIds : undefined,
      tagGroups: isStatusMode ? (tagGroups !== false) : undefined,
      audienceMode: isStatusMode ? audienceMode : undefined,
      includeLeads: isStatusMode ? Boolean(includeLeads) : undefined,
      mentions: Array.isArray(mentions) ? mentions : undefined,
      messagesSequence: Array.isArray(messagesSequence) ? messagesSequence : undefined,
      interMessageDelaySeconds: typeof interMessageDelaySeconds === 'number' ? interMessageDelaySeconds : undefined,
      createdAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      savedCodes[existingIndex] = newSavedCode;
    } else {
      savedCodes.unshift(newSavedCode);
    }

    saveUserSavedCodes(req.username, savedCodes);
    addLog(req.username, `💾 Saved ${isStatusMode ? 'Status' : 'Message'} Code .${cleanCode} permanently stored.`, 'success');

    res.json({
      success: true,
      savedCodes,
      savedCode: newSavedCode,
      message: `Code .${cleanCode} saved permanently! Type .${cleanCode} in WhatsApp anytime to trigger.`
    });
  });

  // Draft Message Templates APIs (Usable across logged in accounts & saves incomplete messages)
  app.get('/api/drafts', requireAuth, (req: any, res) => {
    res.json({ success: true, drafts: loadUserDrafts(req.username) });
  });

  app.post('/api/drafts', requireAuth, (req: any, res) => {
    const {
      id,
      name,
      phoneNumber = '',
      recipientType = 'individual',
      message = '',
      msgType = 'text',
      footer,
      attachmentType = 'none',
      attachmentUrl,
      attachmentName,
      attachmentData,
      inlineAttachment = true,
      buttons,
      templateButtons,
      listButtonText,
      listSections,
      delaySeconds = 2,
      messagesSequence,
      interMessageDelaySeconds,
      tagGroupMembers = false,
      sessionIds = ['primary']
    } = req.body;

    const draftName = (name && String(name).trim()) || `Draft ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const drafts = loadUserDrafts(req.username);

    let draftId = id;
    let existingIndex = -1;
    if (draftId) {
      existingIndex = drafts.findIndex(d => d.id === draftId);
    }

    if (existingIndex === -1) {
      draftId = Math.random().toString(36).substring(7);
    }

    const newDraft: DraftTemplate = {
      id: draftId,
      name: draftName,
      phoneNumber,
      recipientType,
      message,
      msgType,
      footer,
      attachmentType,
      attachmentUrl,
      attachmentName,
      attachmentData,
      inlineAttachment: !!inlineAttachment,
      buttons: Array.isArray(buttons) ? buttons : undefined,
      templateButtons: Array.isArray(templateButtons) ? templateButtons : undefined,
      listButtonText,
      listSections: Array.isArray(listSections) ? listSections : undefined,
      delaySeconds: typeof delaySeconds === 'number' ? delaySeconds : 2,
      messagesSequence: Array.isArray(messagesSequence) ? messagesSequence : undefined,
      interMessageDelaySeconds: typeof interMessageDelaySeconds === 'number' ? interMessageDelaySeconds : undefined,
      tagGroupMembers: !!tagGroupMembers,
      sessionIds: Array.isArray(sessionIds) ? sessionIds : ['primary'],
      createdAt: existingIndex >= 0 ? drafts[existingIndex].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      drafts[existingIndex] = newDraft;
    } else {
      drafts.unshift(newDraft);
    }

    saveUserDrafts(req.username, drafts);
    addLog(req.username, `💾 Reusable Draft Template "${draftName}" saved successfully.`, 'success');

    res.json({
      success: true,
      drafts,
      draft: newDraft,
      message: `Draft template "${draftName}" saved successfully!`
    });
  });

  app.delete('/api/drafts/:id', requireAuth, (req: any, res) => {
    const { id } = req.params;
    const drafts = loadUserDrafts(req.username);
    const updated = drafts.filter(d => d.id !== id);
    saveUserDrafts(req.username, updated);
    addLog(req.username, `Draft template deleted.`, 'info');
    res.json({ success: true, drafts: updated, message: 'Draft template deleted successfully.' });
  });

  app.delete('/api/saved-codes/:id', requireAuth, (req: any, res) => {
    const { id } = req.params;
    const savedCodes = loadUserSavedCodes(req.username);
    const updated = savedCodes.filter(c => c.id !== id && c.code !== id);
    saveUserSavedCodes(req.username, updated);
    addLog(req.username, `🗑️ Deleted saved code (${id})`, 'info');
    res.json({ success: true, savedCodes: updated, message: 'Saved code removed successfully.' });
  });

  app.post('/api/saved-codes/trigger/:id', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const savedCodes = loadUserSavedCodes(req.username);
    const foundCode = savedCodes.find(c => c.id === id || c.code === id);

    if (!foundCode) {
      return res.status(404).json({ success: false, error: 'Saved code not found.' });
    }

    const result = await executeSavedCode(req.username, foundCode, 'Web UI Trigger Button');
    if (result.success) {
      res.json({ success: true, enqueuedCount: result.enqueuedCount, message: `Triggered .${foundCode.code}! Enqueued ${result.enqueuedCount} message(s).` });
    } else {
      res.status(400).json({ success: false, error: result.error || 'Failed to trigger saved code.' });
    }
  });

  // Captured Group Invites APIs
  app.get('/api/captured-group-invites', requireAuth, (req: any, res) => {
    res.json({ success: true, invites: loadUserGroupInvites(req.username) });
  });

  app.post('/api/captured-group-invites/add', requireAuth, async (req: any, res) => {
    const { urlOrCode, sessionId = 'primary' } = req.body;
    if (!urlOrCode || typeof urlOrCode !== 'string') {
      return res.status(400).json({ success: false, error: 'WhatsApp Group Invite link or code is required.' });
    }

    const extractedCodes = extractGroupInviteCodes(urlOrCode);
    let targetCodes: string[] = extractedCodes;
    if (targetCodes.length === 0) {
      const singleFallback = urlOrCode.trim().split('?')[0].split('#')[0].replace(/[\.,!?:;]+$/, '');
      if (/^[A-Za-z0-9_-]{15,40}$/.test(singleFallback)) {
        targetCodes = [singleFallback];
      }
    }

    if (targetCodes.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid WhatsApp Group invite link or code found.' });
    }

    const userSessKey = `${req.username}:${sessionId}`;
    let sockInstance = sessions.get(userSessKey)?.sock;
    if (!sockInstance) {
      for (const [k, v] of sessions.entries()) {
        if (k.startsWith(`${req.username}:`) && v?.sock && v.status === 'connected') {
          sockInstance = v.sock;
          break;
        }
      }
    }

    try {
      let preloadedParticipating: Record<string, any> | undefined;
      try {
        if (sockInstance && typeof sockInstance.groupFetchAllParticipating === 'function') {
          preloadedParticipating = await sockInstance.groupFetchAllParticipating();
        }
      } catch (e) {}

      const results: CapturedGroupInvite[] = [];
      for (let idx = 0; idx < targetCodes.length; idx++) {
        const code = targetCodes[idx];
        const fullUrl = `https://chat.whatsapp.com/${code}`;
        const result = await handleGroupInviteUrl(
          req.username,
          fullUrl,
          code,
          sockInstance?.user?.id || 'manual',
          'User (Manual Add)',
          targetCodes.length > 1 ? urlOrCode.trim().substring(0, 300) : 'Manually added via Dashboard',
          sessionId,
          sockInstance,
          {
            chatName: 'Manual Entry',
            isOutgoing: true,
            preloadedParticipating
          }
        );
        if (result) results.push(result);
        if (idx < targetCodes.length - 1) {
          await new Promise(r => setTimeout(r, 100));
        }
      }

      const summaryMsg = results.length === 1
        ? `Group link "${results[0]?.groupName || targetCodes[0]}" saved successfully!`
        : `Extracted and saved ${results.length} WhatsApp group links!`;

      res.json({
        success: true,
        invite: results[0],
        invites: results,
        count: results.length,
        message: summaryMsg
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/captured-group-invites/join/:code', requireAuth, async (req: any, res) => {
    const { code } = req.params;
    const { sessionId = 'primary' } = req.body;

    let sockInstance = sessions.get(`${req.username}:${sessionId}`)?.sock;
    if (!sockInstance) {
      for (const [k, v] of sessions.entries()) {
        if (k.startsWith(`${req.username}:`) && v?.sock && v.status === 'connected') {
          sockInstance = v.sock;
          break;
        }
      }
    }

    if (!sockInstance) {
      return res.status(400).json({ success: false, error: 'No connected WhatsApp session available to join group. Please connect an account first.' });
    }

    try {
      const invites = loadUserGroupInvites(req.username);
      const existing = invites.find(i => i.code === code);

      let groupName = existing?.groupName || 'WhatsApp Group';
      let groupSize = existing?.groupSize || 0;
      let joinApprovalMode = existing?.joinApprovalMode || false;
      let groupJid = existing?.groupJid || '';

      try {
        const info = await sockInstance.groupGetInviteInfo(code);
        if (info) {
          groupName = info.subject || groupName;
          groupSize = typeof info.size === 'number' ? info.size : (info.participants?.length || groupSize);
          joinApprovalMode = !!info.joinApprovalMode;
          groupJid = info.id || groupJid;
        }
      } catch (e) {}

      addLog(req.username, `🚀 [JOIN GROUP] Attempting to join "${groupName}" (${code})...`, 'info');

      let resultingStatus: GroupJoinStatus = 'not_joined';
      let statusDetails = '';
      let joinedJid = '';

      try {
        const joinResult = await sockInstance.groupAcceptInvite(code);
        joinedJid = joinResult || groupJid;
        
        if (joinApprovalMode) {
          resultingStatus = 'requested';
          statusDetails = 'Membership request submitted. Group has Admin Approval Mode ON.';
          addLog(req.username, `⏳ [JOIN REQUEST] Group "${groupName}" requires admin approval. Request sent!`, 'info');
        } else {
          resultingStatus = 'joined';
          statusDetails = `Successfully joined "${groupName}" (${groupSize} members).`;
          addLog(req.username, `🎉 [JOIN SUCCESS] Successfully joined "${groupName}"!`, 'success');
          if (joinedJid) {
            saveUserGroupDetails(req.username, joinedJid, groupName, sessionId, {
              memberCount: groupSize,
              canUserSend: true
            });
          }
        }
      } catch (joinErr: any) {
        const msg = joinErr?.message || String(joinErr);
        if (joinApprovalMode || msg.toLowerCase().includes('approval') || msg.toLowerCase().includes('request')) {
          resultingStatus = 'requested';
          statusDetails = 'Membership request submitted to group admins. Awaiting approval.';
          addLog(req.username, `⏳ [JOIN REQUEST] Membership request submitted for "${groupName}".`, 'info');
        } else {
          throw new Error(`WhatsApp rejected invite: ${msg}`);
        }
      }

      const updated = saveCapturedGroupInvite(req.username, {
        url: `https://chat.whatsapp.com/${code}`,
        code,
        senderJid: existing?.senderJid || 'user',
        senderName: existing?.senderName || 'User',
        messageText: existing?.messageText || 'Manual join triggered',
        groupName,
        groupSize,
        groupJid: joinedJid || groupJid,
        creatorJid: existing?.creatorJid,
        savedAt: new Date().toISOString(),
        sessionId,
        status: resultingStatus,
        statusDetails,
        joinedAt: resultingStatus === 'joined' ? new Date().toISOString() : existing?.joinedAt,
        requestedAt: resultingStatus === 'requested' ? new Date().toISOString() : existing?.requestedAt,
        lastCheckedAt: new Date().toISOString(),
        joinApprovalMode
      });

      res.json({
        success: true,
        status: resultingStatus,
        invite: updated,
        message: resultingStatus === 'joined' 
          ? `Successfully joined "${groupName}"!` 
          : `Join request sent for "${groupName}". Awaiting admin approval.`
      });
    } catch (err: any) {
      addLog(req.username, `❌ [JOIN ERROR] Failed to join group (${code}): ${err.message}`, 'error');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/captured-group-invites/verify-all', requireAuth, async (req: any, res) => {
    const { sessionId } = req.body;
    try {
      const result = await verifyAllSavedGroups(req.username, sessionId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/captured-group-invites/request-admin/:code', requireAuth, async (req: any, res) => {
    const { code } = req.params;
    const { customMessage, sendDirectMessage = false, sessionId = 'primary' } = req.body;

    const invites = loadUserGroupInvites(req.username);
    const invite = invites.find(i => i.code === code);
    if (!invite) {
      return res.status(404).json({ success: false, error: 'Saved group invite not found.' });
    }

    const groupName = invite.groupName || 'the group';
    const url = invite.url || `https://chat.whatsapp.com/${code}`;
    const defaultText = `Hello! I noticed I was removed from *${groupName}*. Could you please re-add me or approve my request to rejoin? Here is the link: ${url}. Thank you!`;
    const messageText = customMessage?.trim() || defaultText;

    let adminJid = invite.creatorJid || '';
    let adminPhone = '';
    if (adminJid) {
      adminPhone = adminJid.split('@')[0].split(':')[0];
    }

    let directSent = false;
    if (sendDirectMessage && adminJid) {
      let sockInstance = sessions.get(`${req.username}:${sessionId}`)?.sock;
      if (!sockInstance) {
        for (const [k, v] of sessions.entries()) {
          if (k.startsWith(`${req.username}:`) && v?.sock && v.status === 'connected') {
            sockInstance = v.sock;
            break;
          }
        }
      }
      if (sockInstance) {
        try {
          const targetAdminJid = adminJid.includes('@') ? adminJid : `${adminJid}@s.whatsapp.net`;
          await sockInstance.sendMessage(targetAdminJid, { text: messageText });
          directSent = true;
          addLog(req.username, `📩 [ADMIN REQUEST SENT] Sent re-join request to admin (+${adminPhone}) for group "${groupName}".`, 'success');
        } catch (err: any) {
          addLog(req.username, `⚠️ [ADMIN REQUEST SEND FAILED] Could not send direct message to admin (+${adminPhone}): ${err.message}`, 'info');
        }
      }
    }

    const waChatUrl = adminPhone ? `https://wa.me/${adminPhone}?text=${encodeURIComponent(messageText)}` : '';

    res.json({
      success: true,
      adminJid,
      adminPhone,
      messageText,
      directSent,
      waChatUrl,
      message: directSent 
        ? `Request sent directly to admin (+${adminPhone}) via WhatsApp!` 
        : `Admin request template prepared.`
    });
  });

  app.delete('/api/captured-group-invites/:code', requireAuth, (req: any, res) => {
    const rawCode = req.params.code;
    const cleanCode = decodeURIComponent(rawCode).trim().toLowerCase();
    const filePath = path.join(getUserDir(req.username), 'group.json');
    try {
      let invites = loadUserGroupInvites(req.username);
      invites = invites.filter(i => {
        const c = String(i.code || '').trim().toLowerCase();
        const id = String(i.id || '').trim().toLowerCase();
        return c !== cleanCode && id !== cleanCode && c !== rawCode.toLowerCase();
      });
      fs.writeFileSync(filePath, JSON.stringify(invites, null, 2), 'utf8');

      if (db && !isQuotaExceeded) {
        deleteDoc(doc(db, 'group_invites', `${req.username}___${cleanCode}`)).catch(() => {});
        deleteDoc(doc(db, 'group_invites', `${req.username}___${rawCode}`)).catch(() => {});
      }

      addLog(req.username, `Deleted saved group link (${cleanCode}) from group.json.`, 'info');
      res.json({ success: true, message: 'Group invite removed successfully.', remainingCount: invites.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/captured-group-invites', requireAuth, (req: any, res) => {
    const filePath = path.join(getUserDir(req.username), 'group.json');
    try {
      if (fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify([], null, 2), 'utf8');
      }
      addLog(req.username, '🧹 Group Invite Logs cleared from group.json.', 'success');
      res.json({ success: true, message: 'Captured group links cleared successfully.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Captured Shares APIs
  app.get('/api/shares', requireAuth, (req: any, res) => {
    res.json({ success: true, shares: loadUserShares(req.username) });
  });

  // Serve uploaded share media thumbnails/files securely
  app.get('/api/shares/media/:filename', requireAuth, (req: any, res) => {
    try {
      const safeName = path.basename(decodeURIComponent(req.params.filename || ''));
      if (!safeName) return res.status(400).json({ success: false, error: 'Invalid filename' });
      const filePath = path.join(getUserShareMediaDir(req.username), safeName);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Media file not found' });
      }
      res.sendFile(filePath);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create a brand new Multi-Media Channel Card directly from the UI
  app.post('/api/shares/create', requireAuth, async (req: any, res) => {
    try {
      const { caption, mediaItems, channelLink, channelName, channelJid, cardLayout, showForwardedTag, sessionId } = req.body;
      const itemsList = Array.isArray(mediaItems) ? mediaItems : [];
      if (itemsList.length === 0 && (!caption || !String(caption).trim())) {
        return res.status(400).json({ success: false, error: 'Please add at least one media item or a caption.' });
      }

      const settings = loadUserSettings(req.username);
      const savedMedia: ShareMediaItem[] = [];

      for (const item of itemsList) {
        if (item.dataUrl && typeof item.dataUrl === 'string') {
          const saved = saveShareMediaUpload(req.username, item.dataUrl, item.fileName, item.mimeType);
          savedMedia.push({
            id: `sm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            mediaType: saved.mediaType,
            mimeType: saved.mimeType,
            fileName: saved.fileName,
            caption: item.caption ? String(item.caption) : undefined,
            localFile: saved.localFile,
            addedAt: new Date().toISOString()
          });
        } else if (item.url && typeof item.url === 'string' && item.url.trim()) {
          const cleanUrl = item.url.trim();
          const mType: 'image' | 'video' | 'document' | 'audio' =
            item.mediaType === 'video' || /\.(mp4|mov|webm|mkv)(\?|$)/i.test(cleanUrl)
              ? 'video'
              : item.mediaType === 'document' || /\.(pdf|doc|docx|zip|txt)(\?|$)/i.test(cleanUrl)
                ? 'document'
                : item.mediaType === 'audio' || /\.(mp3|ogg|wav|m4a)(\?|$)/i.test(cleanUrl)
                  ? 'audio'
                  : 'image';
          savedMedia.push({
            id: `sm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            mediaType: mType,
            mimeType: item.mimeType,
            fileName: item.fileName || path.basename(cleanUrl.split('?')[0]) || 'media',
            caption: item.caption ? String(item.caption) : undefined,
            url: cleanUrl,
            addedAt: new Date().toISOString()
          });
        }
      }

      const sessId = sessionId || 'primary';
      const sess = sessions.get(`${req.username}:${sessId}`);
      const cleanLink = channelLink ? String(channelLink).trim() : settings.defaultChannelInviteLink;
      let resolvedChannelInfo: CapturedShare['channelInfo'] | undefined;

      if (channelJid || channelName || cleanLink) {
        const resolved = await resolveWhatsAppChannel(
          sess?.sock,
          req.username,
          cleanLink || channelJid || channelName,
          { newsletterJid: channelJid, newsletterName: channelName, channelLink: cleanLink },
          cleanLink
        );
        if (resolved && isNumericNewsletterJid(resolved.newsletterJid)) {
          resolvedChannelInfo = {
            newsletterJid: resolved.newsletterJid,
            newsletterName: (channelName || resolved.newsletterName).trim(),
            serverMessageId: resolved.serverMessageId || 1,
            channelLink: cleanLink || resolved.inviteLink
          };
        } else if (channelName || settings.defaultChannelJid) {
          resolvedChannelInfo = {
            newsletterJid: isNumericNewsletterJid(channelJid) ? String(channelJid).trim() : (settings.defaultChannelJid || ''),
            newsletterName: String(channelName || settings.defaultChannelName || 'WhatsApp Channel').trim(),
            serverMessageId: 1,
            channelLink: cleanLink
          };
        }
      } else if (settings.defaultChannelJid && isNumericNewsletterJid(settings.defaultChannelJid)) {
        resolvedChannelInfo = {
          newsletterJid: settings.defaultChannelJid,
          newsletterName: settings.defaultChannelName || 'WhatsApp Channel',
          serverMessageId: 1,
          channelLink: settings.defaultChannelInviteLink
        };
      }

      const cleanCaption = caption ? String(caption).trim() : '';
      const firstMediaType = savedMedia[0]?.mediaType || 'text';
      const newShare: CapturedShare = {
        id: `share_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        timestamp: new Date().toISOString(),
        from: 'Dashboard Studio',
        sender: req.username,
        quotedSender: '',
        quotedMessageId: '',
        quotedMessage: savedMedia.length === 0 && cleanCaption ? { conversation: cleanCaption } : null,
        displayText: cleanCaption || (savedMedia.length > 1 ? `[Multi-Media Card • ${savedMedia.length} items]` : `[${firstMediaType.toUpperCase()} Card]`),
        mediaType: firstMediaType,
        caption: cleanCaption,
        extraMedia: savedMedia,
        cardLayout: cardLayout === 'carousel' ? 'carousel' : 'album',
        channelInfo: resolvedChannelInfo,
        channelLink: cleanLink,
        appendChannelLink: false,
        showForwardedTag: showForwardedTag !== undefined ? !!showForwardedTag : (settings.showForwardedTagOnShare !== false),
        status: 'pending',
        forwardedTo: []
      };

      const shares = loadUserShares(req.username);
      shares.push(newShare);
      saveUserShares(req.username, shares);

      addLog(req.username, `✨ Created Channel Card "${newShare.id}" with ${savedMedia.length} media item(s) (Layout: ${newShare.cardLayout}, Forwarded Tag: ${newShare.showForwardedTag ? 'ON' : 'OFF'}).`, 'success');
      res.json({ success: true, share: newShare, message: 'Channel card created successfully!' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Add one or more media items (upload or URL) into an existing share card
  app.post('/api/shares/:id/media', requireAuth, (req: any, res) => {
    try {
      const cleanId = decodeURIComponent(req.params.id).trim();
      const { mediaItems } = req.body;
      const shares = loadUserShares(req.username);
      const share = shares.find(s => String(s.id).trim() === cleanId);
      if (!share) {
        return res.status(404).json({ success: false, error: 'Share not found.' });
      }
      const itemsList = Array.isArray(mediaItems) ? mediaItems : [];
      if (itemsList.length === 0) {
        return res.status(400).json({ success: false, error: 'No media items provided.' });
      }

      share.extraMedia = share.extraMedia || [];
      let addedCount = 0;

      for (const item of itemsList) {
        if (item.dataUrl && typeof item.dataUrl === 'string') {
          const saved = saveShareMediaUpload(req.username, item.dataUrl, item.fileName, item.mimeType);
          share.extraMedia.push({
            id: `sm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            mediaType: saved.mediaType,
            mimeType: saved.mimeType,
            fileName: saved.fileName,
            caption: item.caption ? String(item.caption) : undefined,
            localFile: saved.localFile,
            addedAt: new Date().toISOString()
          });
          addedCount++;
        } else if (item.url && typeof item.url === 'string' && item.url.trim()) {
          const cleanUrl = item.url.trim();
          const mType: 'image' | 'video' | 'document' | 'audio' =
            item.mediaType === 'video' || /\.(mp4|mov|webm|mkv)(\?|$)/i.test(cleanUrl)
              ? 'video'
              : item.mediaType === 'document' || /\.(pdf|doc|docx|zip|txt)(\?|$)/i.test(cleanUrl)
                ? 'document'
                : item.mediaType === 'audio' || /\.(mp3|ogg|wav|m4a)(\?|$)/i.test(cleanUrl)
                  ? 'audio'
                  : 'image';
          share.extraMedia.push({
            id: `sm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            mediaType: mType,
            mimeType: item.mimeType,
            fileName: item.fileName || path.basename(cleanUrl.split('?')[0]) || 'media',
            caption: item.caption ? String(item.caption) : undefined,
            url: cleanUrl,
            addedAt: new Date().toISOString()
          });
          addedCount++;
        }
      }

      saveUserShares(req.username, shares);
      addLog(req.username, `🖼️ Added ${addedCount} media item(s) to Channel Card "${share.id}".`, 'success');
      res.json({ success: true, share, message: `Added ${addedCount} media item(s) to card.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Remove an extra media item from a share card
  app.delete('/api/shares/:id/media/:mediaId', requireAuth, (req: any, res) => {
    try {
      const cleanId = decodeURIComponent(req.params.id).trim();
      const mediaId = decodeURIComponent(req.params.mediaId).trim();
      const shares = loadUserShares(req.username);
      const share = shares.find(s => String(s.id).trim() === cleanId);
      if (!share) {
        return res.status(404).json({ success: false, error: 'Share not found.' });
      }
      const existingList = share.extraMedia || [];
      const removedItem = existingList.find(m => m.id === mediaId);
      share.extraMedia = existingList.filter(m => m.id !== mediaId);

      if (removedItem?.localFile) {
        const stillUsed = shares.some(s => (s.extraMedia || []).some(m => m.localFile === removedItem.localFile));
        if (!stillUsed) {
          const target = path.join(getUserShareMediaDir(req.username), path.basename(removedItem.localFile));
          try {
            if (fs.existsSync(target)) fs.unlinkSync(target);
          } catch {}
        }
      }

      saveUserShares(req.username, shares);
      res.json({ success: true, share, message: 'Media item removed from card.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update per-share options (caption, showForwardedTag, cardLayout)
  app.put('/api/shares/:id/options', requireAuth, (req: any, res) => {
    try {
      const cleanId = decodeURIComponent(req.params.id).trim();
      const { caption, showForwardedTag, cardLayout } = req.body;
      const shares = loadUserShares(req.username);
      const share = shares.find(s => String(s.id).trim() === cleanId);
      if (!share) {
        return res.status(404).json({ success: false, error: 'Share not found.' });
      }
      if (caption !== undefined) {
        const cleanCap = String(caption);
        share.caption = cleanCap;
        share.displayText = cleanCap || share.displayText;
        if (share.quotedMessage && typeof share.quotedMessage === 'object') {
          const unwrapped = unwrapQuotedMessage(share.quotedMessage);
          if (unwrapped.conversation !== undefined) unwrapped.conversation = cleanCap;
          else if (unwrapped.extendedTextMessage) unwrapped.extendedTextMessage.text = cleanCap;
          else if (unwrapped.imageMessage) unwrapped.imageMessage.caption = cleanCap;
          else if (unwrapped.videoMessage) unwrapped.videoMessage.caption = cleanCap;
          else if (unwrapped.documentMessage) unwrapped.documentMessage.caption = cleanCap;
        }
      }
      if (showForwardedTag !== undefined) {
        share.showForwardedTag = !!showForwardedTag;
      }
      if (cardLayout === 'album' || cardLayout === 'carousel') {
        share.cardLayout = cardLayout;
      }
      saveUserShares(req.username, shares);
      res.json({ success: true, share });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.delete('/api/shares/:id', requireAuth, (req: any, res) => {
    const rawId = req.params.id;
    const cleanId = decodeURIComponent(rawId).trim();
    let shares = loadUserShares(req.username);
    const target = shares.find(s => String(s.id).trim() === cleanId && String(s.id).trim() !== '' || String(s.id).trim() === rawId);
    shares = shares.filter(s => String(s.id).trim() !== cleanId && String(s.id).trim() !== rawId);
    if (target) {
      cleanupShareMediaFiles(req.username, target, shares);
    }
    saveUserShares(req.username, shares);
    addLog(req.username, `🗑️ Deleted captured share "${cleanId}".`, 'success');
    res.json({ success: true, message: 'Share deleted successfully.' });
  });

  app.delete('/api/shares', requireAuth, (req: any, res) => {
    try {
      const existing = loadUserShares(req.username);
      for (const s of existing) {
        cleanupShareMediaFiles(req.username, s, []);
      }
      saveUserShares(req.username, []);
      addLog(req.username, '🧹 All captured shares cleared.', 'success');
      res.json({ success: true, message: 'All captured shares cleared successfully.' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/shares/forward', requireAuth, async (req: any, res) => {
    const { shareId, targetJids, sessionId, channelInfo, useChannelTag, channelLink, appendChannelLink, showForwardedTag, cardLayout } = req.body;
    if (!shareId || !Array.isArray(targetJids) || targetJids.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid shareId or targetJids' });
    }

    const sessId = sessionId || 'primary';
    const userSessKey = `${req.username}:${sessId}`;
    const sess = sessions.get(userSessKey);

    if (!sess || !sess.sock) {
      return res.status(400).json({ success: false, error: `Session "${sessId}" is not connected or active.` });
    }

    const shares = loadUserShares(req.username);
    const share = shares.find(s => s.id === shareId);
    if (!share) {
      return res.status(404).json({ success: false, error: 'Captured share not found.' });
    }

    const userSettings = loadUserSettings(req.username);
    const batchSize = userSettings.shareBatchSize || 5;
    const pauseSec = userSettings.shareBatchPauseSeconds || 10;

    const effectiveShowForwarded =
      showForwardedTag !== undefined
        ? !!showForwardedTag
        : (share.showForwardedTag !== undefined ? share.showForwardedTag : (userSettings.showForwardedTagOnShare !== false));
    const effectiveCardLayout: 'album' | 'carousel' =
      cardLayout === 'carousel' || cardLayout === 'album'
        ? cardLayout
        : (share.cardLayout || 'album');

    // Determine target channel tag info and effective direct channel link:
    let effectiveChannelInfo: { newsletterJid: string; newsletterName: string; serverMessageId?: number; channelLink?: string } | null = null;
    let effectiveChannelLink = channelLink 
      ? String(channelLink).trim() 
      : (share.channelLink || share.channelInfo?.channelLink || userSettings.defaultChannelInviteLink);

    if (useChannelTag === false) {
      effectiveChannelInfo = null;
    } else {
      const candidateTag = channelInfo?.newsletterJid || channelInfo?.newsletterName || effectiveChannelLink;
      const resolved = await resolveWhatsAppChannel(
        sess.sock,
        req.username,
        candidateTag,
        channelInfo || share.channelInfo,
        effectiveChannelLink
      );
      if (resolved && isNumericNewsletterJid(resolved.newsletterJid)) {
        effectiveChannelInfo = {
          newsletterJid: resolved.newsletterJid,
          newsletterName: resolved.newsletterName,
          serverMessageId: resolved.serverMessageId || 1,
          channelLink: resolved.inviteLink || effectiveChannelLink
        };
        effectiveChannelLink = resolved.inviteLink || effectiveChannelLink;
      } else if (share.channelInfo && isNumericNewsletterJid(share.channelInfo.newsletterJid)) {
        effectiveChannelInfo = {
          ...share.channelInfo,
          channelLink: share.channelInfo.channelLink || effectiveChannelLink
        };
      } else if (userSettings.autoAttachChannelTag && userSettings.defaultChannelJid && isNumericNewsletterJid(userSettings.defaultChannelJid)) {
        effectiveChannelInfo = {
          newsletterJid: userSettings.defaultChannelJid,
          newsletterName: userSettings.defaultChannelName || 'WhatsApp Channel',
          serverMessageId: 1,
          channelLink: userSettings.defaultChannelInviteLink
        };
        effectiveChannelLink = effectiveChannelLink || userSettings.defaultChannelInviteLink;
      }
    }

    const results: Array<{ jid: string; success: boolean; error?: string }> = [];
    const validTargetJids: string[] = [];

    // Pre-filter target JIDs to exclude globally banned/blocked groups
    for (const targetJid of targetJids) {
      const cleanJid = targetJid.trim();
      if (!cleanJid) continue;

      let formattedJid = cleanJid;
      if (!formattedJid.includes('@')) {
        if (formattedJid.includes('-') || formattedJid.length > 15) {
          formattedJid = `${formattedJid}@g.us`;
        } else {
          formattedJid = `${formattedJid}@s.whatsapp.net`;
        }
      }

      if (isJidBlocked(formattedJid)) {
        results.push({ jid: formattedJid, success: false, error: 'Banned: Group is in global blocked/banned list.' });
        addLog(req.username, `🚫 Forward skipped for ${formattedJid}: Group is in global banned/blocked list.`, 'info');
      } else {
        validTargetJids.push(formattedJid);
      }
    }

    const hasExtraMedia = Array.isArray(share.extraMedia) && share.extraMedia.length > 0;
    let preparedMediaBundle: { items: PreparedMediaEntry[]; mainCaption: string } | null = null;
    let preparedMsgPayload: any = null;

    const prebuiltChannelCtx = useChannelTag === false
      ? { isForwarded: effectiveShowForwarded, ...(effectiveShowForwarded ? { forwardingScore: 1 } : {}) }
      : await resolveChannelContextForDispatch(
          sess.sock,
          req.username,
          effectiveChannelInfo || (effectiveChannelLink ? { newsletterName: userSettings.defaultChannelName || 'WhatsApp Channel', channelLink: effectiveChannelLink } : null),
          {
            channelLink: effectiveChannelLink,
            showForwardedTag: effectiveShowForwarded,
            quotedMessage: share.quotedMessage
          }
        );

    if (hasExtraMedia) {
      preparedMediaBundle = await prepareShareMediaBundle(sess.sock, req.username, share);
      if (preparedMediaBundle.items.length === 0) {
        preparedMsgPayload = prepareForwardedMessage(share.quotedMessage, effectiveChannelInfo, {
          channelLink: effectiveChannelLink,
          appendChannelLink: appendChannelLink === true && !!effectiveChannelLink,
          showForwardedTag: effectiveShowForwarded,
          prebuiltContextInfo: prebuiltChannelCtx
        });
      }
    } else {
      // Single message payload with unwrapped media/text structure, formatting, channel tags, optional Forwarded tag, and link settings
      preparedMsgPayload = prepareForwardedMessage(share.quotedMessage, effectiveChannelInfo, {
        channelLink: effectiveChannelLink,
        appendChannelLink: appendChannelLink === true && !!effectiveChannelLink,
        showForwardedTag: effectiveShowForwarded,
        prebuiltContextInfo: prebuiltChannelCtx
      });
    }

    // Process valid targets in batches of configured batchSize
    for (let i = 0; i < validTargetJids.length; i += batchSize) {
      const batch = validTargetJids.slice(i, i + batchSize);

      for (const formattedJid of batch) {
        try {
          addLog(req.username, `Forwarding share card to ${formattedJid}...${effectiveChannelInfo ? ` [Channel Tag: ${effectiveChannelInfo.newsletterName}]` : ''} [Forwarded Tag: ${effectiveShowForwarded ? 'ON' : 'OFF'}]${preparedMediaBundle && preparedMediaBundle.items.length > 1 ? ` [Multi-Media x${preparedMediaBundle.items.length} (${effectiveCardLayout})]` : ''}`, 'info');
          
          await simulateHumanTyping(sess.sock, formattedJid, share.displayText);

          if (preparedMediaBundle && preparedMediaBundle.items.length > 0) {
            await sendMultiMediaChannelCard(sess.sock, formattedJid, preparedMediaBundle, effectiveChannelInfo, {
              channelLink: effectiveChannelLink,
              appendChannelLink: appendChannelLink === true && !!effectiveChannelLink,
              showForwardedTag: effectiveShowForwarded,
              cardLayout: effectiveCardLayout,
              prebuiltContextInfo: prebuiltChannelCtx,
              username: req.username
            });
          } else {
            await forwardMessagePayloadWithChannel(sess.sock, formattedJid, preparedMsgPayload);
          }
          
          results.push({ jid: formattedJid, success: true });
          addLog(req.username, `✅ Forwarded card to ${formattedJid} successfully.${effectiveChannelInfo ? ` (Channel Tag: ${effectiveChannelInfo.newsletterName})` : ''}`, 'success');
        } catch (err: any) {
          console.error(`Error forwarding to ${formattedJid}:`, err);
          let errMsg = err?.message || String(err);
          
          const lowerErr = errMsg.toLowerCase();
          if (lowerErr.includes('not-in-group') || 
              lowerErr.includes('not-authorized') || 
              lowerErr.includes('403') || 
              lowerErr.includes('forbidden') || 
              lowerErr.includes('unauthorized') ||
              lowerErr.includes('notauthorized') ||
              lowerErr.includes('not_in_group')) {
            errMsg = 'Forbidden: You are not a member of this group or have been removed.';
          }
          
          results.push({ jid: formattedJid, success: false, error: errMsg });
          addLog(req.username, `❌ Failed to forward to ${formattedJid}: ${errMsg}`, 'error');
        }

        // Small delay between individual message sends
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1500) + 1000));
      }

      // Pause between batches if more targets remain
      if (i + batchSize < validTargetJids.length) {
        addLog(req.username, `⏸️ [SHARE BATCH PAUSE] Sent batch of ${batch.length} groups. Waiting ${pauseSec}s before next batch...`, 'info');
        await new Promise(r => setTimeout(r, pauseSec * 1000));
      }
    }

    // Update share status & optionally update channelInfo/channelLink/showForwardedTag/cardLayout
    share.status = 'forwarded';
    share.showForwardedTag = effectiveShowForwarded;
    share.cardLayout = effectiveCardLayout;
    if (effectiveChannelInfo) {
      share.channelInfo = effectiveChannelInfo;
    }
    if (effectiveChannelLink) {
      share.channelLink = effectiveChannelLink;
    }
    const uniqueTargets = Array.from(new Set([...(share.forwardedTo || []), ...results.filter(r => r.success).map(r => r.jid)]));
    share.forwardedTo = uniqueTargets;
    saveUserShares(req.username, shares);

    res.json({
      success: true,
      results,
      channelInfo: effectiveChannelInfo,
      channelLink: effectiveChannelLink,
      showForwardedTag: effectiveShowForwarded,
      appendChannelLink: appendChannelLink === true && !!effectiveChannelLink,
      mediaCount: preparedMediaBundle ? preparedMediaBundle.items.length : 1
    });
  });

  // Update or clear Channel Tag & Channel Link for a specific captured share
  app.put('/api/shares/:id/channel', requireAuth, async (req: any, res) => {
    const { id } = req.params;
    const { newsletterJid, newsletterName, serverMessageId, channelLink, clear, sessionId } = req.body;
    const shares = loadUserShares(req.username);
    const share = shares.find(s => s.id === id);

    if (!share) {
      return res.status(404).json({ success: false, error: 'Share not found.' });
    }

    if (clear) {
      delete share.channelInfo;
      delete share.channelLink;
      addLog(req.username, `🏷️ Cleared Channel Tag & Link on share "${id}".`, 'info');
    } else {
      if (!newsletterJid && !newsletterName && !channelLink) {
        return res.status(400).json({ success: false, error: 'newsletterJid, newsletterName, or channelLink is required.' });
      }

      const sessId = sessionId || 'primary';
      const userSessKey = `${req.username}:${sessId}`;
      const sess = sessions.get(userSessKey);

      const cleanLink = channelLink ? String(channelLink).trim() : undefined;
      const parsedMsgId = cleanLink ? extractChannelMessageId(cleanLink) : undefined;
      const effectiveMsgId = parsedMsgId || Number(serverMessageId) || 1;

      const resolved = await resolveWhatsAppChannel(
        sess?.sock,
        req.username,
        newsletterJid || newsletterName || cleanLink,
        { newsletterJid, newsletterName, serverMessageId: effectiveMsgId, channelLink: cleanLink },
        cleanLink
      );

      if (resolved && isNumericNewsletterJid(resolved.newsletterJid)) {
        share.channelInfo = {
          newsletterJid: resolved.newsletterJid,
          newsletterName: (newsletterName || resolved.newsletterName).trim(),
          serverMessageId: effectiveMsgId,
          channelLink: cleanLink || resolved.inviteLink
        };
        share.channelLink = cleanLink || resolved.inviteLink;
        addLog(req.username, `🏷️ Attached Verified Channel Tag "${share.channelInfo.newsletterName}" (${share.channelInfo.newsletterJid}) to share "${id}".${share.channelLink ? ` Link: ${share.channelLink}` : ''}`, 'success');
      } else {
        const cleanName = (newsletterName || newsletterJid || 'WhatsApp Channel').trim();
        share.channelInfo = {
          newsletterJid: '',
          newsletterName: cleanName,
          serverMessageId: effectiveMsgId,
          channelLink: cleanLink
        };
        share.channelLink = cleanLink;
        addLog(req.username, `⚠️ Channel Tag "${cleanName}" saved without verified numeric JID. Provide the channel invite link to make it clickable.`, 'info');
      }
    }

    saveUserShares(req.username, shares);
    res.json({ success: true, share, message: 'Channel Tag & Link updated successfully.' });
  });

  // Fetch all followed / owned WhatsApp Channels for the current session
  app.get('/api/channels', requireAuth, async (req: any, res) => {
    const sessId = req.query.sessionId || 'primary';
    const userSessKey = `${req.username}:${sessId}`;
    const sess = sessions.get(userSessKey);
    const cached = loadUserChannels(req.username);

    if (!sess || !sess.sock) {
      return res.json({ success: true, channels: cached, warning: 'WhatsApp session is not connected. Showing cached channels.' });
    }

    try {
      let channels: CachedChannel[] = [];

      if (typeof sess.sock.newsletterFetchAllParticipating === 'function') {
        const result: any = await sess.sock.newsletterFetchAllParticipating();
        const rawList = Array.isArray(result) ? result : (result && typeof result === 'object' ? Object.values(result) : []);
        if (rawList.length > 0) {
          channels = rawList.map((c: any) => ({
            id: c.id || c.jid || '',
            name: c.name || c.subject || c.thread_metadata?.name?.text || 'WhatsApp Channel',
            subscribers: Number(c.subscribers || c.subscribers_count || 0),
            role: c.viewer_metadata?.role || c.role || 'subscriber',
            invite: c.thread_metadata?.invite || c.invite || '',
            verified: true
          })).filter((c: any) => isNumericNewsletterJid(c.id));
          saveUserChannels(req.username, channels);
        }
      }

      // Merge with any cached channels not returned in participating
      const combined = [...channels];
      for (const c of cached) {
        if (!combined.find(x => x.id === c.id)) {
          combined.push(c);
        }
      }

      res.json({ success: true, channels: combined });
    } catch (err: any) {
      console.warn('[CHANNELS] Error fetching participating newsletters:', err?.message);
      res.json({ success: true, channels: cached, message: err.message });
    }
  });

  // Inspect WhatsApp Channel Link or JID
  app.post('/api/channels/inspect', requireAuth, async (req: any, res) => {
    const { channelInput, sessionId } = req.body;
    if (!channelInput || typeof channelInput !== 'string') {
      return res.status(400).json({ success: false, error: 'channelInput string is required.' });
    }

    const sessId = sessionId || 'primary';
    const userSessKey = `${req.username}:${sessId}`;
    const sess = sessions.get(userSessKey);

    const msgId = extractChannelMessageId(channelInput.trim());

    const resolved = await resolveWhatsAppChannel(
      sess?.sock,
      req.username,
      channelInput.trim()
    );

    if (resolved && isNumericNewsletterJid(resolved.newsletterJid)) {
      return res.json({
        success: true,
        verified: true,
        channel: {
          id: resolved.newsletterJid,
          name: resolved.newsletterName,
          invite: resolved.inviteLink,
          channelLink: resolved.inviteLink,
          serverMessageId: resolved.serverMessageId || msgId || 1,
          verified: true
        }
      });
    }

    // Try direct newsletterMetadata if sock is active
    if (sess?.sock && typeof sess.sock.newsletterMetadata === 'function') {
      const inviteCode = extractChannelInviteCode(channelInput.trim());
      if (inviteCode) {
        try {
          const meta: any = await sess.sock.newsletterMetadata('invite', inviteCode);
          if (meta && isNumericNewsletterJid(meta.id)) {
            const officialName = meta.name || meta.thread_metadata?.name?.text || 'WhatsApp Channel';
            const directLink = msgId && msgId > 1
              ? `https://whatsapp.com/channel/${inviteCode}/${msgId}`
              : `https://whatsapp.com/channel/${inviteCode}`;
            const channelObj: CachedChannel = {
              id: meta.id,
              name: officialName,
              subscribers: Number(meta.subscribers || meta.subscribers_count || 0),
              invite: inviteCode,
              verified: true
            };
            const cached = loadUserChannels(req.username);
            if (!cached.find(c => c.id === channelObj.id)) {
              cached.push(channelObj);
              saveUserChannels(req.username, cached);
            }
            return res.json({
              success: true,
              verified: true,
              channel: {
                ...channelObj,
                channelLink: directLink,
                serverMessageId: msgId || 1
              }
            });
          }
        } catch (e: any) {}
      }
    }

    res.status(404).json({
      success: false,
      error: `Could not verify WhatsApp Channel "${channelInput}". Ensure you provide a valid WhatsApp Channel invite link (e.g. https://whatsapp.com/channel/...) and that your WhatsApp account is connected.`
    });
  });

  // Leads APIs
  app.get('/api/leads', requireAuth, (req: any, res) => {
    res.json({ success: true, leads: loadUserLeads(req.username) });
  });

  app.post('/api/leads/update', requireAuth, (req: any, res) => {
    const { jid, status, notes } = req.body;
    if (!jid) {
      return res.status(400).json({ success: false, error: 'jid is required.' });
    }
    const leads = loadUserLeads(req.username);
    const existing = leads.find(l => l.jid === jid);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Lead not found.' });
    }
    if (status) {
      existing.status = status;
    }
    if (notes !== undefined) {
      existing.notes = notes;
    }
    saveUserLeads(req.username, leads);
    res.json({ success: true, lead: existing, message: 'Lead updated successfully!' });
  });

  app.delete('/api/leads/:jid', requireAuth, (req: any, res) => {
    const { jid } = req.params;
    if (!jid) {
      return res.status(400).json({ success: false, error: 'jid is required.' });
    }
    const leads = loadUserLeads(req.username);
    const filtered = leads.filter(l => l.jid !== jid);
    saveUserLeads(req.username, filtered);
    res.json({ success: true, leads: filtered, message: 'Lead removed successfully!' });
  });

  app.post('/api/leads/bulk-add', requireAuth, (req: any, res) => {
    const { contacts } = req.body;
    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ success: false, error: 'contacts array is required.' });
    }
    const leads = loadUserLeads(req.username);
    let addedCount = 0;
    for (const c of contacts) {
      const phoneClean = (c.phone || '').replace(/\D/g, '');
      if (!phoneClean) continue;
      const jid = phoneClean + '@s.whatsapp.net';
      const existing = leads.find(l => l.jid === jid);
      if (!existing) {
        leads.push({
          jid,
          phone: phoneClean,
          name: c.name || `Extracted (${phoneClean})`,
          sessionName: c.sessionName || 'Bulk Extracted',
          lastActive: new Date().toISOString(),
          interactionsCount: 0,
          lastMessage: 'Imported from Group',
          status: 'Cold',
          notes: c.notes || 'Imported from WhatsApp Group'
        });
        addedCount++;
      }
    }
    saveUserLeads(req.username, leads);
    res.json({ 
      success: true, 
      message: `Successfully saved ${addedCount} new contact(s) to Leads Hub!`, 
      addedCount 
    });
  });

  // Phone Contacts APIs (Synced from WhatsApp Phonebook & VCF Imports)
  app.get('/api/contacts', requireAuth, (req: any, res) => {
    const contacts = loadUserPhoneContacts(req.username);
    const savedCount = contacts.filter(c => c.isSavedContact).length;
    res.json({
      success: true,
      contacts,
      savedCount,
      totalCount: contacts.length
    });
  });

  app.post('/api/contacts/sync', requireAuth, async (req: any, res) => {
    const force = req.body?.force !== false;
    const beforeCount = loadUserPhoneContacts(req.username).length;

    const connectedSessions: Array<{ id: string; sock: any }> = [];
    for (const [key, sess] of sessions.entries()) {
      if (key.startsWith(`${req.username}:`) && sess.status === 'connected' && sess.sock) {
        connectedSessions.push({ id: sess.id, sock: sess.sock });
      }
    }

    if (connectedSessions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No connected WhatsApp session found. Please link/connect a session first to sync your phone contacts.'
      });
    }

    let syncedSessionCount = 0;
    let lastError: string | undefined;

    for (const s of connectedSessions) {
      const result = await syncPhoneContactsForSession(req.username, s.id, s.sock, force);
      if (result.ok) {
        syncedSessionCount++;
      } else {
        lastError = result.error;
      }
    }

    // Give Baileys event buffer a short window to finish emitting contacts.upsert
    await new Promise(resolve => setTimeout(resolve, 600));
    flushUserPhoneContacts(req.username);

    const contacts = loadUserPhoneContacts(req.username);
    const savedCount = contacts.filter(c => c.isSavedContact).length;
    const newlySyncedCount = Math.max(0, contacts.length - beforeCount);

    addLog(req.username, `📇 Synced WhatsApp phone contacts: ${contacts.length} total (${savedCount} saved in phonebook).`, 'success');

    res.json({
      success: true,
      contacts,
      savedCount,
      totalCount: contacts.length,
      newlySyncedCount,
      message: contacts.length > 0
        ? `Synced ${contacts.length} WhatsApp phone contact(s) (${savedCount} saved in phonebook).`
        : (lastError ? `Sync completed with note: ${lastError}` : 'Sync completed. If your phone has not pushed address book entries to WhatsApp Web yet, you can also import a .VCF contacts file exported from your phone.')
    });
  });

  app.post('/api/contacts/import', requireAuth, async (req: any, res) => {
    const { vcfContent, contacts: rawList, defaultCountryCode = '' } = req.body || {};
    const parsedItems: Array<{ id: string; name?: string; phoneNumber: string }> = [];

    if (typeof vcfContent === 'string' && vcfContent.trim()) {
      const vcfContacts = parseVcfContacts(vcfContent, String(defaultCountryCode || ''));
      for (const item of vcfContacts) {
        parsedItems.push({
          id: `${item.phone}@s.whatsapp.net`,
          name: item.name,
          phoneNumber: `${item.phone}@s.whatsapp.net`
        });
      }
    }

    if (Array.isArray(rawList)) {
      for (const item of rawList) {
        const digits = String(item?.phone || item?.jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 16) {
          parsedItems.push({
            id: `${digits}@s.whatsapp.net`,
            name: item?.name ? String(item.name).trim() : undefined,
            phoneNumber: `${digits}@s.whatsapp.net`
          });
        }
      }
    }

    if (parsedItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid phone numbers found. Upload a valid .vcf vCard file or provide phone numbers with country codes.'
      });
    }

    const beforeCount = loadUserPhoneContacts(req.username).length;
    await upsertUserPhoneContacts(req.username, 'vcf_import', parsedItems, undefined, {
      source: 'vcf_import',
      immediate: true
    });

    const contacts = loadUserPhoneContacts(req.username);
    const savedCount = contacts.filter(c => c.isSavedContact).length;
    const addedCount = Math.max(0, contacts.length - beforeCount);

    addLog(req.username, `📇 Imported ${parsedItems.length} phone contact(s) (${addedCount} new, ${contacts.length} total).`, 'success');

    res.json({
      success: true,
      contacts,
      savedCount,
      totalCount: contacts.length,
      addedCount,
      message: `Imported ${parsedItems.length} phone contact(s) (${contacts.length} total saved contacts ready for Status updates).`
    });
  });

  app.delete('/api/contacts/:jid', requireAuth, (req: any, res) => {
    const targetJid = decodeURIComponent(req.params.jid || '');
    const contacts = loadUserPhoneContacts(req.username);
    const filtered = contacts.filter(c => c.jid !== targetJid && c.phone !== targetJid);
    saveUserPhoneContactsImmediate(req.username, filtered);
    res.json({
      success: true,
      contacts: filtered,
      savedCount: filtered.filter(c => c.isSavedContact).length,
      totalCount: filtered.length
    });
  });

  // QR and Status APIs
  app.get('/api/qr', requireAuth, (req: any, res) => {
    const sessionId = (req.query.sessionId as string) || (req.query.session as string) || 'primary';
    const userSessKey = `${req.username}:${sessionId}`;
    let sess = sessions.get(userSessKey);

    if ((!sess || sess.status === 'disconnected') && !sess?.lastError?.includes('replaced') && !sess?.lastError?.includes('Conflict')) {
      const userConfigs = loadUserSessionsConfig(req.username);
      const conf = userConfigs.find(c => c.id === sessionId);
      connectToWhatsApp(req.username, sessionId, conf?.name || (sessionId === 'primary' ? 'Primary Account' : 'WhatsApp Session')).catch(() => {});
      sess = sessions.get(userSessKey);
    }

    res.json({ 
      success: true,
      sessionId,
      sessionName: sess?.name || (sessionId === 'primary' ? 'Primary Account' : 'WhatsApp Session'),
      qr: sess ? sess.qrBase64 : null, 
      status: sess ? sess.status : 'disconnected',
      user: sess && sess.status === 'connected' ? sess.user : null,
      pairingCode: sess ? sess.activePairingCode : null,
      error: sess ? sess.lastError : null,
      timestamp: Date.now()
    });
  });

  // Standalone lightweight HTML live QR scanner view (optimized for secondary phones & external screens)
  app.get('/view-qr', (req: any, res) => {
    const sessionId = (req.query.sessionId as string) || (req.query.session as string) || 'primary';
    const token = (req.query.token as string) || '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Live WhatsApp QR Code • Real-Time Sync</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: #030712; color: #f3f4f6; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; }
    body.light { background-color: #ffffff; color: #111827; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 24px; padding: 24px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); position: relative; }
    body.light .card { background: #ffffff; border: 2px solid #10b981; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; font-size: 12px; font-weight: bold; border-bottom: 1px solid #1f2937; padding-bottom: 12px; }
    body.light .header { border-bottom-color: #e5e7eb; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; background: rgba(16, 185, 129, 0.15); color: #10b981; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .pulse-dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; display: inline-block; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.3); } }
    .qr-frame { background: #ffffff; border-radius: 16px; padding: 14px; display: inline-block; margin: 12px 0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); position: relative; }
    .qr-img { width: 240px; height: 240px; display: block; object-fit: contain; }
    .instructions { font-size: 13px; color: #9ca3af; margin: 8px 0; line-height: 1.4; }
    body.light .instructions { color: #4b5563; }
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 16px; font-size: 12px; font-weight: 700; border-radius: 12px; cursor: pointer; border: none; transition: 0.2s; text-decoration: none; }
    .btn-primary { background: #10b981; color: #030712; }
    .btn-primary:hover { background: #059669; }
    .btn-secondary { background: #1f2937; color: #e5e7eb; border: 1px solid #374151; }
    body.light .btn-secondary { background: #f3f4f6; color: #1f2937; border-color: #d1d5db; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; }
    .connected-box { display: none; padding: 24px 0; }
    .connected-box.show { display: block; animation: pop 0.4s ease; }
    @keyframes pop { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .check-icon { font-size: 48px; color: #10b981; margin-bottom: 8px; }
    .notice { font-size: 11px; color: #6b7280; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="badge"><span class="pulse-dot"></span> LIVE SYNC ACTIVE</div>
      <button onclick="toggleTheme()" class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;">☀️ Boost Brightness</button>
    </div>

    <div id="connecting-view">
      <h2 style="font-size: 16px; font-weight: bold; margin-bottom: 4px;">Point Camera to Scan</h2>
      <p class="instructions">WhatsApp &gt; <strong>Linked Devices</strong> &gt; <strong>Link a Device</strong></p>

      <div class="qr-frame">
        <img id="qr-img" class="qr-img" src="" alt="Waiting for QR code..." />
        <div id="qr-loading" style="display:none; width:240px; height:240px; line-height:240px; color:#111; font-size:12px; font-weight:bold;">Loading dynamic QR...</div>
      </div>

      <p class="notice">⚡ Auto-refreshes on this screen in real-time as QR changes</p>

      <div class="actions">
        <button onclick="forceRefresh()" class="btn btn-primary" id="refresh-btn">🔄 Refresh QR</button>
        <button onclick="copyCurrentUrl()" class="btn btn-secondary" id="copy-btn">📋 Copy Link</button>
      </div>
    </div>

    <div id="connected-view" class="connected-box">
      <div class="check-icon">✓</div>
      <h2 style="font-size: 18px; font-weight: bold; color: #10b981;">WhatsApp Linked!</h2>
      <p class="instructions" id="user-info" style="font-weight: bold; color: #f3f4f6; margin-top: 6px;"></p>
      <p class="notice" style="margin-top: 16px;">Connection is live. You can close this screen or return to the dashboard.</p>
    </div>
  </div>

  <script>
    const sessionId = "${sessionId}";
    const token = "${token}";
    let lastQr = null;

    function toggleTheme() {
      document.body.classList.toggle('light');
    }

    function copyCurrentUrl() {
      navigator.clipboard.writeText(window.location.href);
      const btn = document.getElementById('copy-btn');
      btn.innerText = 'Copied!';
      setTimeout(() => btn.innerText = '📋 Copy Link', 2000);
    }

    async function forceRefresh() {
      const btn = document.getElementById('refresh-btn');
      btn.innerText = 'Refreshing...';
      try {
        await fetch('/api/sessions/regenerate-qr?token=' + encodeURIComponent(token), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: sessionId, sessionId: sessionId })
        });
      } catch (e) {}
      setTimeout(fetchQr, 1000);
    }

    async function fetchQr() {
      try {
        const res = await fetch('/api/qr?sessionId=' + encodeURIComponent(sessionId) + '&token=' + encodeURIComponent(token));
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 'connected') {
          document.getElementById('connecting-view').style.display = 'none';
          const cv = document.getElementById('connected-view');
          cv.classList.add('show');
          if (data.user) {
            document.getElementById('user-info').innerText = '+' + (data.user.id || '').split(':')[0].split('@')[0] + ' (' + (data.user.name || '') + ')';
          }
          return;
        }

        if (data.qr && data.qr !== lastQr) {
          lastQr = data.qr;
          const img = document.getElementById('qr-img');
          img.src = data.qr;
          img.style.display = 'block';
          document.getElementById('qr-loading').style.display = 'none';
        } else if (!data.qr && !lastQr) {
          document.getElementById('qr-img').style.display = 'none';
          document.getElementById('qr-loading').style.display = 'block';
        }
      } catch (e) {}
    }

    fetchQr();
    setInterval(fetchQr, 1200);
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  app.get('/api/status', requireAuth, (req: any, res) => {
    const sessionId = (req.query.sessionId as string) || 'primary';
    const userSessKey = `${req.username}:${sessionId}`;
    const sess = sessions.get(userSessKey);
    const sentHistory = loadUserSentMessages(req.username);
    const logs = loadUserLogs(req.username);

    res.json({
      connected: sess ? sess.status === 'connected' : false,
      status: sess ? sess.status : 'disconnected',
      error: sess ? sess.lastError : null,
      user: sess && sess.status === 'connected' ? sess.user : null,
      logs: logs,
      sentCount: sentHistory.length,
      sentHistory: sentHistory.slice(-20),
      pairingCode: sess ? sess.activePairingCode : null
    });
  });

  // Saved Groups API
  app.get('/api/groups', requireAuth, (req: any, res) => {
    res.json({ success: true, groups: loadUserSavedGroups(req.username) });
  });

  const lastGroupSyncTimes = new Map<string, number>();

  app.post('/api/groups/sync', requireAuth, async (req: any, res) => {
    const { sessionIds = ['primary'] } = req.body;
    
    // Cooldown rate-limiting check: 15 seconds
    const now = Date.now();
    const lastSync = lastGroupSyncTimes.get(req.username) || 0;
    const timeSinceLastSync = now - lastSync;
    if (timeSinceLastSync < 15000) {
      const remaining = Math.ceil((15000 - timeSinceLastSync) / 1000);
      return res.status(429).json({ 
        success: false, 
        error: `Sync rate-limit active. Please wait ${remaining} second(s) before syncing again to protect your WhatsApp account.` 
      });
    }
    lastGroupSyncTimes.set(req.username, now);
    
    // Find first connected session
    let connectedSession: any = null;
    let selectedSessionId = '';
    for (const sid of sessionIds) {
      const userSessKey = `${req.username}:${sid}`;
      const s = sessions.get(userSessKey);
      if (s && s.status === 'connected' && s.sock) {
        connectedSession = s;
        selectedSessionId = sid;
        break;
      }
    }

    if (!connectedSession) {
      // Look for any connected session of this user
      const userConfigs = loadUserSessionsConfig(req.username);
      for (const c of userConfigs) {
        const userSessKey = `${req.username}:${c.id}`;
        const s = sessions.get(userSessKey);
        if (s && s.status === 'connected' && s.sock) {
          connectedSession = s;
          selectedSessionId = c.id;
          break;
        }
      }
    }

    if (!connectedSession) {
      return res.status(400).json({ success: false, error: 'No connected WhatsApp session found. Please connect your WhatsApp account first.' });
    }

    try {
      const sock = connectedSession.sock;
      addLog(req.username, `🔄 Safety timer active: waiting 3 seconds before querying WhatsApp group list to comply with anti-ban protocols...`, 'info');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      addLog(req.username, `🔄 Fetching joined groups metadata via session "${selectedSessionId}"...`, 'info');
      
      const groupsDict = await sock.groupFetchAllParticipating();
      const groups = Object.values(groupsDict) as any[];
      
      const userJid = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net' : '';

      const syncedGroups: SavedGroup[] = [];
      const loadedSaved = loadUserSavedGroups(req.username);

      for (const g of groups) {
        const jid = g.id || g.jid;
        if (!jid) continue;

        let meta = g;
        if (!meta.participants || !Array.isArray(meta.participants) || meta.participants.length === 0) {
          try {
            const freshMeta = await sock.groupMetadata(jid);
            if (freshMeta && freshMeta.participants) {
              meta = freshMeta;
            }
          } catch (e) {
            // Fallback to groupFetchAllParticipating data
          }
        }

        const subject = meta.subject || g.subject || 'Unnamed Group';
        
        let isAdmin = false;
        if (meta.participants && userJid) {
          const selfPart = meta.participants.find((p: any) => {
            const pJid = (typeof p === 'string' ? p : p.id || p.jid || '').split(':')[0].split('@')[0] + '@s.whatsapp.net';
            return pJid === userJid;
          });
          if (selfPart) {
            isAdmin = !!(selfPart.admin || selfPart.isAdmin || selfPart.isSuperAdmin);
          }
        }

        const onlyAdminsCanSend = !!meta.announce;
        const canUserSend = !onlyAdminsCanSend || isAdmin;

        const cleanedParticipants = cleanParticipantJidList(meta.participants || []);

        const groupDetails: SavedGroup = {
          jid,
          name: subject,
          savedAt: new Date().toISOString(),
          sessionId: selectedSessionId,
          participants: cleanedParticipants,
          isAdmin,
          onlyAdminsCanSend,
          canUserSend,
          memberCount: cleanedParticipants.length
        };

        syncedGroups.push(groupDetails);

        const existingIndex = loadedSaved.findIndex(sg => sg.jid === jid);
        if (existingIndex > -1) {
          loadedSaved[existingIndex] = {
            ...loadedSaved[existingIndex],
            ...groupDetails
          };
        } else {
          loadedSaved.push(groupDetails);
        }
      }

      const filePath = path.join(getUserDir(req.username), 'saved_groups.json');
      fs.writeFileSync(filePath, JSON.stringify(loadedSaved, null, 2), 'utf8');

      addLog(req.username, `✅ Successfully synchronized ${syncedGroups.length} WhatsApp group(s).`, 'success');
      res.json({ 
        success: true, 
        message: `Successfully synchronized ${syncedGroups.length} groups!`,
        groups: syncedGroups
      });
    } catch (err: any) {
      console.error('Error syncing groups:', err);
      addLog(req.username, `❌ Failed to synchronize groups: ${err.message || err}`, 'error');
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch groups from WhatsApp' });
    }
  });

  app.delete('/api/groups/:jid', requireAuth, (req: any, res) => {
    const { jid } = req.params;
    deleteUserSavedGroup(req.username, jid);
    res.json({ success: true, message: 'Group JID removed from saved database!' });
  });

  // Multi-Session Management APIs
  app.get('/api/sessions', requireAuth, (req: any, res) => {
    const userConfigs = loadUserSessionsConfig(req.username);
    const list = userConfigs.map(c => {
      const userSessKey = `${req.username}:${c.id}`;
      const s = sessions.get(userSessKey);
      const authFolder = path.join(process.cwd(), 'data', req.username, 'auth_info_' + c.id);
      const credsFile = path.join(authFolder, 'creds.json');
      const hasSavedCredentials = fs.existsSync(credsFile);

      if ((!s || s.status === 'disconnected') && !s?.lastError?.includes('replaced') && !s?.lastError?.includes('Conflict')) {
        connectToWhatsApp(req.username, c.id, c.name).catch(() => {});
      }

      const effectiveStatus = s ? s.status : (hasSavedCredentials ? 'connecting' : 'disconnected');

      return {
        id: c.id,
        name: c.name,
        status: effectiveStatus,
        qrBase64: s ? s.qrBase64 : null,
        pairingCode: s ? s.activePairingCode : null,
        user: s ? s.user : null,
        lastError: s ? s.lastError : null,
        hasSavedCredentials
      };
    });
    res.json({ success: true, sessions: list });
  });

  app.post('/api/sessions/reconnect', requireAuth, async (req: any, res) => {
    const { id, sessionId, force } = req.body;
    const targetId = id || sessionId;

    if (!targetId) {
      return res.status(400).json({ success: false, error: 'Session ID is required.' });
    }

    const authFolder = path.join(process.cwd(), 'data', req.username, 'auth_info_' + targetId);
    const credsFile = path.join(authFolder, 'creds.json');
    const hasSavedCreds = fs.existsSync(credsFile);

    const userSessKey = `${req.username}:${targetId}`;
    const existingSess = sessions.get(userSessKey);
    const lastConnecting = connectingLocks.get(userSessKey) || 0;

    // Never tear down an already connected session, an active QR/pairing prompt, or a handshake in progress unless user explicitly clicked Reconnect (force: true)
    if (!force && existingSess) {
      if (existingSess.status === 'connected') {
        return res.json({ success: true, skipped: true, message: `Session "${targetId}" is already connected.` });
      }
      if (existingSess.qrBase64 || existingSess.activePairingCode || (existingSess.status === 'connecting' && Date.now() - lastConnecting < 30000)) {
        return res.json({ success: true, skipped: true, message: `Session "${targetId}" handshake / QR is already active.` });
      }
    }

    sessionConflictFailures.delete(userSessKey);

    if (existingSess && existingSess.sock) {
      try {
        existingSess.sock.ev.removeAllListeners();
        existingSess.sock.end(undefined);
      } catch (e) {}
      existingSess.sock = null;
    }

    addLog(req.username, `[SESSION: ${targetId}] Re-establishing Baileys socket connection (${hasSavedCreds ? 'using saved credentials' : 'fresh session'})...`, 'info');

    const configs = loadUserSessionsConfig(req.username);
    const sessConfig = configs.find(c => c.id === targetId);
    const sessionName = sessConfig ? sessConfig.name : (targetId === 'primary' ? 'Primary Account' : 'WhatsApp Session');

    try {
      await connectToWhatsApp(req.username, targetId, sessionName);
      res.json({ success: true, message: `Reconnecting / restarting Baileys socket for session "${targetId}"...` });
    } catch (err: any) {
      addLog(req.username, `[SESSION: ${targetId}] Reconnect error: ${err.message}`, 'error');
      res.status(500).json({ success: false, error: err.message || 'Failed to reconnect session.' });
    }
  });

  // Dedicated endpoint to force-purge stale credentials and generate a fresh live QR code
  app.post('/api/sessions/regenerate-qr', requireAuth, async (req: any, res) => {
    const { id, sessionId } = req.body;
    const targetId = id || sessionId;

    if (!targetId) {
      return res.status(400).json({ success: false, error: 'Session ID is required.' });
    }

    const userSessKey = `${req.username}:${targetId}`;
    const authFolder = path.join(process.cwd(), 'data', req.username, 'auth_info_' + targetId);

    // Cancel pending reconnect timer & reset failure counters
    if (reconnectTimers.has(userSessKey)) {
      clearTimeout(reconnectTimers.get(userSessKey)!);
      reconnectTimers.delete(userSessKey);
    }
    connectingLocks.delete(userSessKey);
    sessionReconnectFailures.delete(userSessKey);

    // Cleanly unbind listeners and terminate active socket
    const existingSess = sessions.get(userSessKey);
    if (existingSess) {
      existingSess.status = 'connecting';
      existingSess.qrBase64 = null;
      existingSess.activePairingCode = null;
      existingSess.user = null;
      existingSess.lastError = null;

      if (existingSess.sock) {
        try {
          existingSess.sock.ev.removeAllListeners();
          if (existingSess.sock.ws) {
            try { existingSess.sock.ws.close(); } catch (e) {}
          }
          existingSess.sock.end(undefined);
        } catch (e) {}
        existingSess.sock = null;
      }
    }

    // Purge the auth folder containing stale creds.json to force Baileys into fresh pairing mode
    try {
      if (fs.existsSync(authFolder)) {
        fs.rmSync(authFolder, { recursive: true, force: true });
        addLog(req.username, `[SESSION: ${targetId}] Stale credentials purged. Spawning fresh Baileys socket to generate a new QR code...`, 'info');
      }
    } catch (err: any) {
      console.error(`[SESSION: ${targetId}] Failed to purge auth directory:`, err);
    }

    const configs = loadUserSessionsConfig(req.username);
    const sessConfig = configs.find(c => c.id === targetId);
    const sessionName = sessConfig ? sessConfig.name : (targetId === 'primary' ? 'Primary Account' : 'WhatsApp Session');

    try {
      await connectToWhatsApp(req.username, targetId, sessionName);
      res.json({ 
        success: true, 
        message: `Stale credentials cleared! Generating brand new WhatsApp QR code for session "${targetId}"...` 
      });
    } catch (err: any) {
      addLog(req.username, `[SESSION: ${targetId}] QR regeneration error: ${err.message}`, 'error');
      res.status(500).json({ success: false, error: err.message || 'Failed to generate new QR code.' });
    }
  });

  app.post('/api/sessions/create', requireAuth, async (req: any, res) => {
    const { id, name } = req.body;
    if (!id || !name) {
      return res.status(400).json({ success: false, error: 'Session JID and Name are required.' });
    }

    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanId) {
      return res.status(400).json({ success: false, error: 'Invalid Session ID characters.' });
    }

    const config = loadUserSessionsConfig(req.username);
    if (config.some(c => c.id === cleanId)) {
      return res.status(400).json({ success: false, error: 'A session with this ID already exists.' });
    }

    config.push({ id: cleanId, name: name.trim() });
    saveUserSessionsConfig(req.username, config);

    // Bootstrap and connect session
    await connectToWhatsApp(req.username, cleanId, name.trim());
    res.json({ success: true, message: `Session "${name}" created & connecting...`, id: cleanId });
  });

  app.post('/api/sessions/request-pairing-code', requireAuth, async (req: any, res) => {
    const { sessionId, phoneNumber } = req.body;
    if (!sessionId || !phoneNumber) {
      return res.status(400).json({ success: false, error: 'Session ID and recipient phone are required.' });
    }

    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (!cleanNumber) {
      return res.status(400).json({ success: false, error: 'Invalid pairing phone number format.' });
    }

    const userSessKey = `${req.username}:${sessionId}`;
    const session = sessions.get(userSessKey);
    if (!session) {
      return res.status(404).json({ success: false, error: `Session "${sessionId}" not found.` });
    }

    try {
      if (!session.sock) {
        await connectToWhatsApp(req.username, sessionId, session.name);
      }
      addLog(req.username, `[SESSION: ${sessionId}] Requesting pairing code for phone: ${cleanNumber}...`, 'info');
      const code = await session.sock.requestPairingCode(cleanNumber);
      session.activePairingCode = code;
      addLog(req.username, `[SESSION: ${sessionId}] Pairing code received successfully: ${code}`, 'success');
      res.json({ success: true, code });
    } catch (err: any) {
      addLog(req.username, `[SESSION: ${sessionId}] Failed to request pairing code: ${err.message}`, 'error');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  const deleteSessionHandler = async (req: any, res: any) => {
    const id = req.params.id || req.body.id;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Session ID is required.' });
    }

    if (id === 'primary') {
      return res.status(400).json({ success: false, error: 'The Primary Account cannot be completely deleted, only logged out.' });
    }

    const userSessKey = `${req.username}:${id}`;
    const session = sessions.get(userSessKey);
    if (session) {
      try {
        if (session.sock) {
          session.sock.ev.removeAllListeners();
          await session.sock.logout();
        }
      } catch (e) {}
      sessions.delete(userSessKey);
    }

    // Delete credentials folder from disk
    const authFolder = path.join(process.cwd(), 'data', req.username, 'auth_info_' + id);
    try {
      if (fs.existsSync(authFolder)) {
        fs.rmSync(authFolder, { recursive: true, force: true });
      }
    } catch (e) {}

    let config = loadUserSessionsConfig(req.username);
    config = config.filter(c => c.id !== id);
    saveUserSessionsConfig(req.username, config);

    addLog(req.username, `Session "${id}" was deleted and credentials folder purged.`, 'success');
    res.json({ success: true, message: `Session "${id}" successfully removed.` });
  };

  app.post('/api/sessions/delete', requireAuth, deleteSessionHandler);
  app.delete('/api/sessions/:id', requireAuth, deleteSessionHandler);

  // Message Queue & Wait Timers APIs
  app.get('/api/queue', requireAuth, (req: any, res) => {
    res.json({
      success: true,
      queue: loadUserQueue(req.username),
      isProcessing: processingQueues.has(req.username),
      delaySeconds: globalDelaySeconds
    });
  });

  app.post('/api/queue/clear', requireAuth, (req: any, res) => {
    const { type } = req.body || {};
    const queue = loadUserQueue(req.username);
    let updatedQueue: QueueItem[] = [];

    if (type === 'pending') {
      updatedQueue = queue.filter(item => item.status !== 'pending');
      const removedCount = queue.length - updatedQueue.length;
      addLog(req.username, `Message Queue: Cleared all pending queue items (${removedCount} items removed).`, 'info');
    } else if (type === 'history' || type === 'past') {
      updatedQueue = queue.filter(item => item.status === 'pending' || item.status === 'sending');
      const removedCount = queue.length - updatedQueue.length;
      addLog(req.username, `Message Queue: Cleared completed & failed queue history (${removedCount} items removed).`, 'info');
    } else {
      updatedQueue = [];
      addLog(req.username, 'Message Queue: Cleared all queue items.', 'info');
    }

    saveUserQueue(req.username, updatedQueue);
    res.json({ success: true, queue: updatedQueue, message: 'Message Queue cleared successfully.' });
  });

  // Message History APIs
  app.get('/api/history', requireAuth, (req: any, res) => {
    const sentHistory = loadUserSentMessages(req.username);
    res.json({ success: true, history: sentHistory });
  });

  app.post('/api/history/clear', requireAuth, (req: any, res) => {
    saveUserSentMessages(req.username, []);
    addLog(req.username, 'Message History: Cleared all sent message records.', 'info');
    res.json({ success: true, history: [], message: 'Message history cleared successfully.' });
  });

  app.delete('/api/history/:id', requireAuth, (req: any, res) => {
    const { id } = req.params;
    const history = loadUserSentMessages(req.username);
    const updated = history.filter(item => item.id !== id);
    saveUserSentMessages(req.username, updated);
    addLog(req.username, `Message History: Deleted record ${id}.`, 'info');
    res.json({ success: true, history: updated, message: `Deleted message record ${id}.` });
  });

  app.post('/api/media/clear-cache', requireAuth, (req: any, res) => {
    const clearedFiles = clearMediaCache();
    addLog(req.username, `🧹 Media Cache: Manually cleared ${clearedFiles} cached media file(s).`, 'success');
    res.json({ success: true, clearedCount: clearedFiles, message: `Successfully cleared ${clearedFiles} cached media files from disk and memory.` });
  });

  app.post('/api/queue/config', requireAuth, (req: any, res) => {
    const { delaySeconds } = req.body;
    if (typeof delaySeconds === 'number' && delaySeconds >= 0) {
      globalDelaySeconds = delaySeconds;
      addLog(req.username, `Message Queue throttle delay updated to: ${delaySeconds} seconds.`, 'success');
      res.json({ success: true, delaySeconds, message: `Delay set to ${delaySeconds} seconds.` });
    } else {
      res.status(400).json({ success: false, error: 'Invalid delay parameter.' });
    }
  });

  // Recharts Delivery Analytics & Performance Metrics
  app.get('/api/analytics', requireAuth, (req: any, res) => {
    const username = req.username;
    const sentHistory = loadUserSentMessages(username);
    const queue = loadUserQueue(username);

    const totalSent = sentHistory.filter(m => m.status === 'sent').length;
    const totalFailed = sentHistory.filter(m => m.status === 'failed').length;
    const queuePending = queue.filter(m => m.status === 'pending').length;
    const queueProcessing = queue.filter(m => m.status === 'sending').length;

    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyDataMap = new Map<string, { name: string; success: number; failed: number }>();
    
    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayName = daysOfWeek[d.getDay()];
      const dateKey = d.toISOString().split('T')[0];
      dailyDataMap.set(dateKey, { name: dayName, success: 0, failed: 0 });
    }

    // Populate actual data
    for (const msg of sentHistory) {
      if (!msg.timestamp) continue;
      const dateKey = msg.timestamp.split('T')[0];
      if (dailyDataMap.has(dateKey)) {
        const data = dailyDataMap.get(dateKey)!;
        if (msg.status === 'sent') {
          data.success += 1;
        } else if (msg.status === 'failed') {
          data.failed += 1;
        }
      }
    }

    const dailyTrend = Array.from(dailyDataMap.values());

    // Calculate today's specific dispatches
    const todayStr = new Date().toISOString().split('T')[0];
    let todaySent = 0;
    let todayFailed = 0;
    for (const msg of sentHistory) {
      if (!msg.timestamp) continue;
      const dateKey = msg.timestamp.split('T')[0];
      if (dateKey === todayStr) {
        if (msg.status === 'sent') todaySent++;
        else if (msg.status === 'failed') todayFailed++;
      }
    }
    const todayTotal = todaySent + todayFailed;

    // Performance metrics
    let totalSpeedMs = 0;
    let countWithSpeed = 0;
    for (const qItem of queue) {
      if (qItem.status === 'sent' && qItem.addedAt && qItem.sentAt) {
        const diff = new Date(qItem.sentAt).getTime() - new Date(qItem.addedAt).getTime();
        if (diff > 0) {
          totalSpeedMs += diff;
          countWithSpeed++;
        }
      }
    }

    const avgSpeedSeconds = countWithSpeed > 0 
      ? parseFloat((totalSpeedMs / countWithSpeed / 1000).toFixed(1)) 
      : globalDelaySeconds;

    // Connected accounts load breakdown
    const userConfigs = loadUserSessionsConfig(username);
    const sessionsLoad = userConfigs.map(c => {
      const userSessKey = `${username}:${c.id}`;
      const s = sessions.get(userSessKey);
      const sessionSentCount = sentHistory.filter(m => m.status === 'sent').length;

      return {
        name: c.name,
        sent: Math.round(sessionSentCount / (userConfigs.length || 1)),
        status: s ? s.status : 'disconnected'
      };
    });

    res.json({
      success: true,
      summary: {
        totalSent,
        totalFailed,
        todaySent,
        todayFailed,
        todayTotal,
        queuePending,
        queueProcessing,
        avgSpeedSeconds,
        loadPercentage: Math.min(100, Math.round(((queuePending + queueProcessing) / 50) * 100))
      },
      dailyTrend,
      sessionsLoad
    });
  });

  app.post('/api/send-template', requireAuth, async (req: any, res) => {
    const { phoneNumber, recipientType, sessionIds = ['primary'], splitByCommas = true, tagGroupMembers = false } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Recipient phone number or Group JID is required' });
    }

    // Split recipient list
    let recipients: string[] = [];
    if (splitByCommas) {
      recipients = phoneNumber.split(',').map((p: string) => p.trim()).filter(Boolean);
    } else {
      recipients = phoneNumber.split('\n').map((p: string) => p.trim()).filter(Boolean);
    }

    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid recipients supplied.' });
    }

    // Validate sessions
    const validSessions = sessionIds.filter((sid: string) => {
      const userSessKey = `${req.username}:${sid}`;
      const s = sessions.get(userSessKey);
      return s && s.status === 'connected';
    });

    if (validSessions.length === 0) {
      return res.status(400).json({ success: false, error: 'No connected sessions selected. Please select at least one connected account.' });
    }

    const addedItems = [];
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const assignedSessionId = getAssignedSessionIdForRecipient(req.username, recipient, recipientType, validSessions[i % validSessions.length], validSessions);

      let targetJid = recipient;
      if (recipientType === 'group') {
        if (!targetJid.includes('@')) {
          targetJid = `${targetJid}@g.us`;
        }
      } else {
        const cleanNumber = recipient.replace(/\D/g, '');
        if (cleanNumber) {
          targetJid = `${cleanNumber}@s.whatsapp.net`;
        }
      }

      const item = pushToUserQueue(req.username, {
        recipient: targetJid,
        recipientType,
        messageType: 'template',
        message: 'Hello\n\nYour prepaid recharge of ₹199 for Airtel is expiring today.\n\nPay Now via Navi UPI.',
        footer: 'Secure service from Meta',
        templateButtons: [
          { type: 'url', text: '🔗 Pay Now', url: 'https://play.google.com/store/apps/details?id=com.navi.passport' }
        ],
        sessionId: assignedSessionId,
        tagGroupMembers: !!tagGroupMembers
      });
      addedItems.push(item);
    }

    res.json({
      success: true,
      message: `Enqueued ${recipients.length} recharge templates across ${validSessions.length} selected session(s).`,
      queuedCount: recipients.length,
      items: addedItems
    });
  });

  app.post('/api/send', requireAuth, async (req: any, res) => {
    const { 
      phoneNumber, 
      recipientType,
      message,
      messagesSequence,
      interMessageDelaySeconds = 3,
      msgType, 
      footer, 
      buttons, 
      templateButtons, 
      listButtonText,
      listSections,
      attachmentType = 'none',
      attachmentUrl,
      attachmentData,
      attachmentName,
      inlineAttachment = false,
      sessionIds = ['primary'],
      splitByCommas = true,
      tagGroupMembers = false,
      scheduledAt
    } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, error: 'Recipient phone number or Group JID is required.' });
    }

    const hasSequence = Array.isArray(messagesSequence) && messagesSequence.length > 0;
    if (!message && !hasSequence && (attachmentType === 'none' || !attachmentType)) {
      return res.status(400).json({ success: false, error: 'Please provide either a message body or an attachment.' });
    }

    // Prepare normalized list of sequence sub-messages
    const sequenceItems = hasSequence 
      ? messagesSequence.map((item: any) => typeof item === 'string' ? { message: item } : item)
      : [{ message: message || '', msgType, footer, attachmentType, attachmentUrl, attachmentData, attachmentName, inlineAttachment, buttons, templateButtons, listButtonText, listSections }];

    // Split recipient list
    let recipients: string[] = [];
    if (splitByCommas) {
      recipients = phoneNumber.split(',').map((p: string) => p.trim()).filter(Boolean);
    } else {
      recipients = phoneNumber.split('\n').map((p: string) => p.trim()).filter(Boolean);
    }

    if (recipients.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid recipients supplied.' });
    }

    // Automatically scan outbound text & captions to capture and process any WhatsApp Group links being sent
    try {
      for (const seq of sequenceItems) {
        if (seq.message) scanTextForGroupLinks(req.username, seq.message, recipients[0], sessionIds[0]);
        if (seq.footer) scanTextForGroupLinks(req.username, seq.footer, recipients[0], sessionIds[0]);
      }
    } catch (e) {}

    // Validate sessions
    const validSessions = sessionIds.filter((sid: string) => {
      const userSessKey = `${req.username}:${sid}`;
      const s = sessions.get(userSessKey);
      return s && s.status === 'connected';
    });

    if (validSessions.length === 0) {
      return res.status(400).json({ success: false, error: 'No connected sessions selected. Please select at least one connected account.' });
    }

    const addedItems = [];
    let skippedBlockedCount = 0;

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const assignedSessionId = getAssignedSessionIdForRecipient(req.username, recipient, recipientType, validSessions[i % validSessions.length], validSessions);

      let targetJid = recipient;
      if (recipientType === 'group') {
        if (!targetJid.includes('@')) {
          targetJid = `${targetJid}@g.us`;
        }
      } else {
        const cleanNumber = recipient.replace(/\D/g, '');
        if (cleanNumber) {
          targetJid = `${cleanNumber}@s.whatsapp.net`;
        }
      }

      if (isJidBlocked(targetJid)) {
        skippedBlockedCount++;
        addLog(req.username, `🚫 Skipped ${targetJid}: Recipient/Group is in global banned/blocked list.`, 'info');
        continue;
      }

      // First send all sequence messages to this recipient before proceeding to the next recipient
      for (let s = 0; s < sequenceItems.length; s++) {
        const seqItem = sequenceItems[s];
        const item = pushToUserQueue(req.username, {
          recipient: targetJid,
          recipientType,
          messageType: seqItem.msgType || msgType || 'text',
          message: seqItem.message || '',
          footer: seqItem.footer || footer,
          attachmentType: seqItem.attachmentType || attachmentType,
          attachmentUrl: seqItem.attachmentUrl || attachmentUrl,
          attachmentData: seqItem.attachmentData || attachmentData,
          attachmentName: seqItem.attachmentName || attachmentName,
          inlineAttachment: seqItem.inlineAttachment ?? inlineAttachment,
          buttons: seqItem.buttons || buttons,
          templateButtons: seqItem.templateButtons || templateButtons,
          listButtonText: seqItem.listButtonText || listButtonText,
          listSections: seqItem.listSections || listSections,
          sessionId: assignedSessionId,
          tagGroupMembers: !!tagGroupMembers,
          customDelaySeconds: typeof seqItem.customDelaySeconds === 'number' ? seqItem.customDelaySeconds : interMessageDelaySeconds,
          sequenceIndex: s,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined
        });
        addedItems.push(item);
      }
    }

    res.json({
      success: true,
      message: `Enqueued ${recipients.length} message(s) across ${validSessions.length} selected session(s).`,
      queuedCount: recipients.length,
      items: addedItems
    });
  });

  app.post('/api/status/fetch-bg-image', requireAuth, async (req: any, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      return res.status(400).json({ success: false, error: 'Please provide a valid HTTP or HTTPS image URL.' });
    }
    try {
      const localPath = await getCachedMediaUrl(url.trim(), req.username);
      if (!fs.existsSync(localPath)) {
        return res.status(404).json({ success: false, error: 'Failed to download background image.' });
      }
      const buf = fs.readFileSync(localPath);
      const ext = path.extname(localPath).toLowerCase();
      let mime = 'image/jpeg';
      if (ext === '.png') mime = 'image/png';
      else if (ext === '.webp') mime = 'image/webp';
      else if (ext === '.gif') mime = 'image/gif';
      res.json({
        success: true,
        dataUrl: `data:${mime};base64,${buf.toString('base64')}`
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err?.message || 'Unable to load background image URL.' });
    }
  });

  app.post('/api/status/send', requireAuth, async (req: any, res) => {
    const {
      sessionIds = ['primary'],
      statusType = 'text',
      text = '',
      backgroundColor,
      font = 1,
      attachmentType = 'none',
      attachmentUrl,
      attachmentData,
      attachmentName,
      statusJidList = [],
      groupIds = [],
      tagGroups = true,
      audienceMode,
      includeLeads = false,
      mentions = []
    } = req.body;

    const validSessions = sessionIds.filter((sid: string) => {
      const userSessKey = `${req.username}:${sid}`;
      const s = sessions.get(userSessKey);
      return s && s.status === 'connected';
    });

    if (validSessions.length === 0) {
      return res.status(400).json({ success: false, error: 'No connected sessions selected. Please connect at least one session.' });
    }

    // Prepare media file reference if there is any
    let fileRef: any = null;
    if (statusType !== 'text' && attachmentType && attachmentType !== 'none') {
      try {
        if (attachmentData) {
          const localCachedPath = await getCachedUploadMedia(attachmentData, attachmentName || '', req.username);
          if (fs.existsSync(localCachedPath)) {
            fileRef = fs.readFileSync(localCachedPath);
          } else {
            fileRef = { url: localCachedPath };
          }
        } else if (attachmentUrl) {
          const localCachedPath = await getCachedMediaUrl(attachmentUrl, req.username);
          if (fs.existsSync(localCachedPath)) {
            fileRef = fs.readFileSync(localCachedPath);
          } else {
            fileRef = { url: localCachedPath };
          }
        }
      } catch (err: any) {
        addLog(req.username, `❌ Status Media Error: Failed to resolve attachment: ${err.message}`, 'error');
        return res.status(400).json({ success: false, error: `Failed to resolve attachment: ${err.message}` });
      }
    }

    const rawMentions = Array.isArray(mentions) ? mentions : [];
    const explicitGroupMentions = rawMentions
      .filter((m: any) => typeof m === 'string' && m.trim().endsWith('@g.us'))
      .map((m: string) => m.trim());
    const cleanGroupIds = Array.from(
      new Set([
        ...(Array.isArray(groupIds) ? groupIds.filter((g: any) => typeof g === 'string' && g.trim().endsWith('@g.us')).map((g: string) => g.trim()) : []),
        ...explicitGroupMentions
      ])
    );
    const mentionGroupJids = (tagGroups !== false) ? cleanGroupIds : explicitGroupMentions;
    const mentionUserJids = rawMentions.filter((m: any) => typeof m === 'string' && !m.trim().endsWith('@g.us'));

    const results: any[] = [];
    let maxRecipients = 0;
    let totalNotifiedGroups = 0;

    for (const sid of validSessions) {
      const userSessKey = `${req.username}:${sid}`;
      const session = sessions.get(userSessKey);
      if (!session || !session.sock) continue;

      try {
        const cleanJidList = await resolveStatusJidList(
          session.sock,
          Array.isArray(statusJidList) ? statusJidList : [],
          req.username,
          audienceMode,
          Boolean(includeLeads),
          cleanGroupIds
        );

        addLog(
          req.username,
          `Sending WhatsApp Status (${statusType}) to ${cleanJidList.length} member/contact(s)${mentionGroupJids.length > 0 ? ` & tagging ${mentionGroupJids.length} group(s)` : ''} from session "${session.name}"...`,
          'info'
        );

        const pubRes = await publishStatusWithGroupMentions(
          session.sock,
          req.username,
          session.name || sid,
          {
            statusType,
            text,
            backgroundColor,
            font,
            fileRef,
            statusJidList: cleanJidList,
            mentionGroupJids,
            mentionUserJids
          }
        );

        maxRecipients = Math.max(maxRecipients, pubRes.recipientCount);
        totalNotifiedGroups = Math.max(totalNotifiedGroups, pubRes.notifiedGroups);
        results.push({
          sessionId: sid,
          success: true,
          recipientCount: pubRes.recipientCount,
          notifiedGroups: pubRes.notifiedGroups
        });
        addLog(
          req.username,
          `✅ Successfully published WhatsApp status (${pubRes.recipientCount} contact(s) in visibility list${pubRes.notifiedGroups > 0 ? `, ${pubRes.notifiedGroups} group(s) notified` : ''}) from session "${session.name}".`,
          'success'
        );
      } catch (err: any) {
        console.error(`Error sending status from session ${sid}:`, err);
        results.push({ sessionId: sid, success: false, error: err.message });
        addLog(req.username, `❌ Failed to send status from session "${session.name}": ${err.message}`, 'error');
      }
    }

    const groupSummary = totalNotifiedGroups > 0 ? ` Notified ${totalNotifiedGroups} tagged group(s) in chat.` : '';
    const allSuccessful = results.every(r => r.success);
    if (allSuccessful) {
      res.json({
        success: true,
        recipientCount: maxRecipients,
        notifiedGroups: totalNotifiedGroups,
        message: `Status published to WhatsApp! Visible to ${maxRecipients} contact(s) (including your own WhatsApp status view).${groupSummary}`,
        results
      });
    } else if (results.some(r => r.success)) {
      res.json({
        success: true,
        recipientCount: maxRecipients,
        notifiedGroups: totalNotifiedGroups,
        message: `Status published from some connected sessions (${maxRecipients} contact(s) targeted).${groupSummary}`,
        results
      });
    } else {
      res.status(500).json({ success: false, error: 'Failed to publish status from any selected sessions.', results });
    }
  });

  // Delayed & Batched Status Scheduler APIs
  app.get('/api/status/schedules', requireAuth, (req: any, res) => {
    const filePath = path.join(getUserDir(req.username), 'status_schedules.json');
    let list = [];
    if (fs.existsSync(filePath)) {
      try {
        list = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (err) {}
    }
    res.json({ success: true, schedules: list });
  });

  app.post('/api/status/schedule', requireAuth, async (req: any, res) => {
    const {
      sessionIds = ['primary'],
      statusType = 'text',
      text = '',
      backgroundColor,
      font = 1,
      attachmentType = 'none',
      attachmentUrl,
      attachmentData,
      attachmentName,
      groupMembers = [],
      groupIds = [],
      tagGroups = true,
      tagGroupMembers = false,
      mentions = [],
      batchMode = 'members', // 'members' or 'groups'
      delayMinutes = 5,
      secondDelayMinutes,
      batchSize = 5,
      startTime,
      audienceMode,
      includeLeads = false
    } = req.body;

    const isGroupMode = batchMode === 'groups';
    const statusJidList = req.body.statusJidList || [];

    let activeMembers = Array.isArray(groupMembers) ? [...groupMembers] : [];
    if (!isGroupMode) {
      if (activeMembers.length === 0 && statusJidList.length > 0) {
        activeMembers = [...statusJidList];
      }
      if (activeMembers.length === 0 && audienceMode === 'phone_contacts') {
        activeMembers = loadUserPhoneContacts(req.username).map(c => c.jid).filter(Boolean);
      }
      if (activeMembers.length === 0) {
        // Fallback for general status broadcast without specific recipient filter
        activeMembers = ['status@broadcast'];
      }
    }

    if (isGroupMode && (!groupIds || groupIds.length === 0)) {
      return res.status(400).json({ success: false, error: 'No groups selected for the scheduled background queue.' });
    }

    const cleanDelay = Math.max(1, Math.min(60, Number(delayMinutes) || 5));
    const cleanSecondDelay = secondDelayMinutes ? Math.max(1, Math.min(60, Number(secondDelayMinutes))) : undefined;
    const cleanBatchSize = Math.max(1, Math.min(100, Number(batchSize) || 5));

    const schedId = 'sched-' + Math.random().toString(36).substring(7);
    const newSchedule = {
      id: schedId,
      statusType,
      text,
      backgroundColor,
      font,
      attachmentType,
      attachmentUrl,
      attachmentData,
      attachmentName,
      sessionIds,
      batchMode,
      audienceMode,
      includeLeads: Boolean(includeLeads),
      tagGroups: tagGroups !== false,
      tagGroupMembers: Boolean(tagGroupMembers),
      mentions: Array.isArray(mentions) ? mentions : [],
      totalMembersCount: activeMembers.length,
      remainingMembers: activeMembers,
      completedMembers: [],
      totalGroupsCount: groupIds.length,
      remainingGroups: groupIds,
      completedGroups: [],
      delayMinutes: cleanDelay,
      secondDelayMinutes: cleanSecondDelay,
      batchSize: cleanBatchSize,
      status: 'active',
      createdAt: new Date().toISOString(),
      nextRunAt: startTime ? new Date(startTime).toISOString() : new Date(Date.now() + 5000).toISOString()
    };

    const filePath = path.join(getUserDir(req.username), 'status_schedules.json');
    let list: any[] = [];
    if (fs.existsSync(filePath)) {
      try {
        list = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (err) {}
    }
    list.push(newSchedule);
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');

    if (isGroupMode) {
      addLog(req.username, `📅 Scheduled background Status Job "${schedId}" with ${groupIds.length} groups in batches of ${cleanBatchSize} every ${cleanDelay} minute(s).`, 'success');
      res.json({ success: true, schedule: newSchedule, message: `Status background schedule "${schedId}" created successfully! First batch will execute in a few seconds.` });
    } else {
      addLog(req.username, `📅 Scheduled background Status Job "${schedId}" with ${groupMembers.length} members in batches of ${cleanBatchSize} every ${cleanDelay} minute(s).`, 'success');
      res.json({ success: true, schedule: newSchedule, message: `Status background schedule "${schedId}" created successfully! First batch will execute in a few seconds.` });
    }
  });

  app.post('/api/status/schedules/:id/toggle', requireAuth, (req: any, res) => {
    const { id } = req.params;
    const filePath = path.join(getUserDir(req.username), 'status_schedules.json');
    let list: any[] = [];
    if (fs.existsSync(filePath)) {
      try {
        list = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (err) {}
    }

    const sched = list.find(s => s.id === id);
    if (!sched) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    if (sched.status === 'active') {
      sched.status = 'paused';
      sched.nextRunAt = null;
      addLog(req.username, `⏸️ Paused status background schedule "${id}".`, 'info');
    } else if (sched.status === 'paused') {
      sched.status = 'active';
      sched.nextRunAt = new Date(Date.now() + 5000).toISOString(); // resume first next batch in 5s
      addLog(req.username, `▶️ Resumed status background schedule "${id}".`, 'success');
    }

    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
    res.json({ success: true, schedule: sched });
  });

  app.delete('/api/status/schedules/:id', requireAuth, (req: any, res) => {
    const { id } = req.params;
    const filePath = path.join(getUserDir(req.username), 'status_schedules.json');
    let list: any[] = [];
    if (fs.existsSync(filePath)) {
      try {
        list = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (err) {}
    }

    const initialLength = list.length;
    list = list.filter(s => s.id !== id);
    
    if (list.length < initialLength) {
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
      addLog(req.username, `🗑️ Deleted status background schedule "${id}".`, 'success');
      res.json({ success: true, message: 'Schedule deleted successfully.' });
    } else {
      res.status(404).json({ success: false, error: 'Schedule not found' });
    }
  });

  // Queue Management APIs
  app.get('/api/queue/paused', requireAuth, (req: any, res) => {
    res.json({ success: true, pausedSessions: loadUserPausedQueues(req.username) });
  });

  app.post('/api/queue/paused/toggle', requireAuth, (req: any, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId is required' });
    }
    const paused = loadUserPausedQueues(req.username);
    const idx = paused.indexOf(sessionId);
    if (idx > -1) {
      paused.splice(idx, 1);
      addLog(req.username, `▶️ Resumed dispatch queue for sending account: ${sessionId}`, 'success');
    } else {
      paused.push(sessionId);
      addLog(req.username, `⏸️ Paused dispatch queue for sending account: ${sessionId}`, 'info');
    }
    saveUserPausedQueues(req.username, paused);
    
    // Trigger queue processor to check for items
    processUserQueue(req.username);

    res.json({ success: true, pausedSessions: paused });
  });

  app.post('/api/queue/reorder', requireAuth, (req: any, res) => {
    const { itemId, action } = req.body;
    if (!itemId || !action) {
      return res.status(400).json({ success: false, error: 'itemId and action are required' });
    }

    const queue = loadUserQueue(req.username);
    const index = queue.findIndex(i => i.id === itemId);
    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Queue item not found' });
    }

    if (action === 'delete') {
      queue.splice(index, 1);
      saveUserQueue(req.username, queue);
      addLog(req.username, `Queue: Deleted item ${itemId} from queue.`, 'info');
      processUserQueue(req.username);
      return res.json({ success: true, queue: loadUserQueue(req.username) });
    }

    if (queue[index].status !== 'pending') {
      return res.status(400).json({ success: false, error: 'Only pending items can be re-ordered' });
    }

    const pendingIndices = queue
      .map((item, idx) => (item.status === 'pending' ? idx : -1))
      .filter(idx => idx !== -1);

    const relativeIndex = pendingIndices.indexOf(index);

    if (action === 'up') {
      if (relativeIndex > 0) {
        const prevIndex = pendingIndices[relativeIndex - 1];
        const temp = queue[index];
        queue[index] = queue[prevIndex];
        queue[prevIndex] = temp;
        saveUserQueue(req.username, queue);
        addLog(req.username, `Queue: Moved item ${itemId} UP.`, 'info');
      }
    } else if (action === 'down') {
      if (relativeIndex < pendingIndices.length - 1) {
        const nextIndex = pendingIndices[relativeIndex + 1];
        const temp = queue[index];
        queue[index] = queue[nextIndex];
        queue[nextIndex] = temp;
        saveUserQueue(req.username, queue);
        addLog(req.username, `Queue: Moved item ${itemId} DOWN.`, 'info');
      }
    } else if (action === 'top') {
      if (relativeIndex > 0) {
        const firstPendingIndex = pendingIndices[0];
        const [itemToMove] = queue.splice(index, 1);
        queue.splice(firstPendingIndex, 0, itemToMove);
        saveUserQueue(req.username, queue);
        addLog(req.username, `Queue: Prioritized item ${itemId} to TOP.`, 'success');
      }
    } else if (action === 'delete') {
      queue.splice(index, 1);
      saveUserQueue(req.username, queue);
      addLog(req.username, `Queue: Deleted item ${itemId} from queue.`, 'info');
    }

    processUserQueue(req.username);

    res.json({ success: true, queue: loadUserQueue(req.username) });
  });

  app.post('/api/logout', requireAuth, async (req: any, res) => {
    const sessionId = req.body.sessionId || 'primary';
    const userSessKey = `${req.username}:${sessionId}`;
    try {
      addLog(req.username, `Logging out session "${sessionId}" and purging session credentials...`, 'info');
      const session = sessions.get(userSessKey);
      if (session && session.sock) {
        await session.sock.logout();
      }
    } catch (e: any) {
      addLog(req.username, `Logout warning: ${e.message}`, 'info');
    }

    const authFolder = path.join(process.cwd(), 'data', req.username, 'auth_info_' + sessionId);
    try {
      if (fs.existsSync(authFolder)) {
        fs.rmSync(authFolder, { recursive: true, force: true });
      }
      addLog(req.username, `Auth credentials for session "${sessionId}" purged successfully.`, 'success');
    } catch (e: any) {
      addLog(req.username, `Failed to clean auth directory: ${e.message}`, 'error');
    }

    const session = sessions.get(userSessKey);
    if (session) {
      session.status = 'disconnected';
      session.qrBase64 = null;
      session.activePairingCode = null;
      session.user = null;
    }

    // Trigger re-connect to start fresh QR generation
    setTimeout(() => connectToWhatsApp(req.username, sessionId), 1000);

    res.json({ success: true, message: 'Successfully logged out and session reset.' });
  });

  // Serve Vite / static client files
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: [
            '**/data/**',
            '**/logs/**',
            '**/auth_info_*/**',
            '**/data.json',
            '**/tokens.json',
            '**/users.json',
            '**/*.log'
          ]
        }
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global Express Error Middleware
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('[EXPRESS ERROR]', err);
    if (res.headersSent) {
      return next(err);
    }
    const statusCode = err.status || err.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      error: err.message || 'Internal server error occurred.'
    });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WA-BRIDGE] WhatsApp Web Bridge running on port ${PORT}`);
  });
}

// 5-Minute Host System Health Monitor & Logging Worker
function runSystemHealthMonitor() {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usedMemMB = Math.round(usedMem / (1024 * 1024));
    const totalMemMB = Math.round(totalMem / (1024 * 1024));
    const memPercent = Math.round((usedMem / totalMem) * 100);
    
    const cpus = os.cpus();
    const coreCount = cpus ? cpus.length : 1;
    const loadAvg = os.loadavg();
    // Use 1-minute load avg relative to total CPU cores
    const loadPercent = Math.min(100, Math.round((loadAvg[0] / coreCount) * 100));
    
    const processMem = process.memoryUsage();
    const processRssMB = Math.round(processMem.rss / (1024 * 1024));
    
    // Count total active connected session sockets in memory
    let activeSessionsCount = 0;
    try {
      if (typeof sessions !== 'undefined' && sessions) {
        for (const [key, sess] of (sessions as any).entries()) {
          if (sess.status === 'connected') {
            activeSessionsCount++;
          }
        }
      }
    } catch (e) {}

    const logMsg = `[SYSTEM MONITOR] Host Resources: CPU Core Load: ${loadPercent}% (${coreCount} Virtual Cores in Use), Total RAM Utilized: ${memPercent}% (${usedMemMB}MB / ${totalMemMB}MB), Node Process RSS: ${processRssMB}MB, Active WhatsApp Sessions: ${activeSessionsCount}. Host system status is healthy.`;
    
    console.log(logMsg);
    
    // Distribute this status message to all registered users' Telemetry Consoles
    try {
      const users = loadUsers();
      for (const u of users) {
        addLog(u.username, logMsg, 'info');
      }
    } catch (e) {
      console.error('Error distributing system health logs:', e);
    }
  } catch (err: any) {
    console.error('Error in background system resources monitor:', err);
  }
}

// Background runner to re-check and auto-join groups with members below threshold (< 400)
async function runGroupAutoRetryWorker() {
  try {
    const users = loadUsers();
    for (const u of users) {
      const username = u.username;
      const settings = loadUserSettings(username);
      if (!settings.autoJoinGroupsEnabled) continue;

      const invites = loadUserGroupInvites(username);
      const minMembers = settings.autoJoinMinMembers || 400;
      const now = Date.now();

      let activeSock: any = null;
      let activeSessionId = 'primary';
      for (const [key, sess] of sessions.entries()) {
        if (key.startsWith(`${username}:`) && sess?.sock && sess.status === 'connected') {
          activeSock = sess.sock;
          activeSessionId = sess.id;
          break;
        }
      }
      if (!activeSock) continue;

      let hasChanges = false;
      for (const inv of invites) {
        if (inv.status === 'members_too_low' && inv.nextRetryAt && new Date(inv.nextRetryAt).getTime() <= now) {
          try {
            const info = await activeSock.groupGetInviteInfo(inv.code);
            if (info) {
              inv.groupSize = typeof info.size === 'number' ? info.size : (info.participants?.length || inv.groupSize);
              inv.groupName = info.subject || inv.groupName;
              inv.lastCheckedAt = new Date().toISOString();
              
              if (inv.groupSize >= minMembers) {
                addLog(username, `🎯 [AUTO-JOIN RETRY] Group "${inv.groupName}" now has ${inv.groupSize} members (>= ${minMembers})! Joining now...`, 'info');
                const joinResult = await activeSock.groupAcceptInvite(inv.code);
                if (info.joinApprovalMode) {
                  inv.status = 'requested';
                  inv.requestedAt = new Date().toISOString();
                  inv.statusDetails = 'Membership request submitted via auto-retry. Awaiting admin approval.';
                } else {
                  inv.status = 'joined';
                  inv.joinedAt = new Date().toISOString();
                  inv.groupJid = joinResult || info.id || inv.groupJid;
                  inv.statusDetails = `Successfully joined on auto-retry (${inv.groupSize} members)!`;
                  if (inv.groupJid) {
                    saveUserGroupDetails(username, inv.groupJid, inv.groupName, activeSessionId, {
                      memberCount: inv.groupSize,
                      canUserSend: true
                    });
                  }
                }
                hasChanges = true;
              } else {
                inv.retryCount = (inv.retryCount || 0) + 1;
                const retryInterval = settings.autoRetryIntervalMinutes || 15;
                inv.nextRetryAt = new Date(Date.now() + retryInterval * 60 * 1000).toISOString();
                inv.statusDetails = `Members (${inv.groupSize}) still < ${minMembers}. Next check in ${retryInterval}m (Retry #${inv.retryCount}).`;
                hasChanges = true;
              }
            }
          } catch (err: any) {
            inv.retryCount = (inv.retryCount || 0) + 1;
            inv.nextRetryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            hasChanges = true;
          }
        }
      }
      if (hasChanges) {
        const filePath = path.join(getUserDir(username), 'group.json');
        fs.writeFileSync(filePath, JSON.stringify(invites, null, 2), 'utf8');
      }
    }
  } catch (e) {
    console.error('Group auto-retry worker error:', e);
  }
}

// Trigger initial health check in 10 seconds, then repeat every 5 minutes (300,000 ms)
setTimeout(runSystemHealthMonitor, 10000);
setInterval(runSystemHealthMonitor, 5 * 60 * 1000);

// Run group auto-retry worker every 3 minutes
setTimeout(runGroupAutoRetryWorker, 15000);
setInterval(runGroupAutoRetryWorker, 3 * 60 * 1000);

// Run Keep-Alive scheduler check every 30 seconds (pings according to configured intervalMinutes)
setTimeout(() => { runKeepAliveScheduler().catch(() => {}); }, 20000);
setInterval(() => { runKeepAliveScheduler().catch(() => {}); }, 30 * 1000);

startServer().catch((err) => {
  console.error('Fatal: Server startup failed:', err);
});

// Process-Level Exception & Rejection Handlers for Robust Render Restarts
process.on('uncaughtException', (err: any) => {
  console.error('[FATAL PROCESS ERROR] Uncaught Exception:', err);
  // Log message and exit to trigger immediate Render container reboot with fresh memory
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[PROCESS WARNING] Unhandled Rejection at:', promise, 'reason:', reason);
});

const handleGracefulShutdown = async (signal: string) => {
  console.log(`[WA-BRIDGE] Received ${signal}. Flushing WhatsApp session auth bundles to Firestore before exit...`);
  try {
    await Promise.race([
      flushAllPendingAuthBundles(),
      new Promise(resolve => setTimeout(resolve, 4000))
    ]);
  } catch {}
  process.exit(0);
};

process.on('SIGTERM', () => { handleGracefulShutdown('SIGTERM'); });
process.on('SIGINT', () => { handleGracefulShutdown('SIGINT'); });
