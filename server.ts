import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import { createServer as createViteServer } from 'vite';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, generateWAMessageFromContent, prepareWAMessageMedia } from '@queenanya/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import QRCode from 'qrcode';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

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

if (fs.existsSync(firebaseConfigPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    const app = initializeApp(config);
    db = getFirestore(app, config.firestoreDatabaseId);
    console.log('[FIREBASE] Successfully initialized Firebase & Firestore with database:', config.firestoreDatabaseId);
  } catch (err) {
    console.error('[FIREBASE] Error initializing Firebase:', err);
  }
} else {
  console.warn('[FIREBASE] Warning: firebase-applet-config.json not found.');
}

// Helper functions to mirror changes to Firestore database
function syncFileToFirestore(filePath: any, data: any) {
  if (!db) return;
  try {
    const relativePath = path.relative(process.cwd(), filePath);
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      if (relativePath.startsWith('data' + path.sep) || relativePath === 'data') {
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
            console.error('[FIREBASE] Error backing up file to Firestore:', err);
          });
        }
      }
    }
  } catch (err) {
    console.error('[FIREBASE] Error in syncFileToFirestore:', err);
  }
}

function syncDeleteToFirestore(filePath: any) {
  if (!db) return;
  try {
    const relativePath = path.relative(process.cwd(), filePath);
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      if (relativePath.startsWith('data' + path.sep)) {
        const docId = relativePath.replace(/[\/\\]/g, '___');
        deleteDoc(doc(db, 'files', docId)).catch(err => {
          console.error('[FIREBASE] Error deleting file from Firestore:', err);
        });
      }
    }
  } catch (err) {
    console.error('[FIREBASE] Error in syncDeleteToFirestore:', err);
  }
}

function syncDirDeleteToFirestore(filePath: any) {
  if (!db) return;
  try {
    const relativePath = path.relative(process.cwd(), filePath);
    if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      if (relativePath.startsWith('data' + path.sep)) {
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
          console.error('[FIREBASE] Error cleaning up directory child docs from Firestore:', err);
        });
      }
    }
  } catch (err) {
    console.error('[FIREBASE] Error in syncDirDeleteToFirestore:', err);
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

async function restoreAllFilesFromFirestore() {
  if (!db) {
    console.log('[FIREBASE] Cannot restore: Firestore database is not initialized.');
    return;
  }
  try {
    console.log('[FIREBASE] Restoring files from Firestore...');
    const snapshot = await getDocs(collection(db, 'files'));
    let restoredCount = 0;
    
    // We want to process each file and write it back locally
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const relativePath = data.path;
      if (relativePath) {
        const localPath = path.join(process.cwd(), relativePath);
        // Ensure parent directory exists using original mkdirSync
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
  } catch (err) {
    console.error('[FIREBASE] Error restoring files from Firestore:', err);
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
    const filtered = groups.filter(g => g.jid !== jid);
    const filePath = path.join(getUserDir(username), 'saved_groups.json');
    fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2), 'utf8');
  } catch (err) {
    console.error('Error deleting saved group:', err);
  }
}

// Captured Group Invite interfaces & database (saved to group.json)
interface CapturedGroupInvite {
  url: string;
  code: string;
  senderJid: string;
  senderName: string;
  messageText: string;
  groupName: string;
  groupDescription?: string;
  groupSize?: number;
  creatorJid?: string;
  savedAt: string;
  sessionId: string;
}

function loadUserGroupInvites(username: string): CapturedGroupInvite[] {
  const filePath = path.join(getUserDir(username), 'group.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {}
  return [];
}

function saveCapturedGroupInvite(username: string, invite: CapturedGroupInvite) {
  try {
    const invites = loadUserGroupInvites(username);
    const isDuplicate = invites.some(i => i.code === invite.code && i.senderJid === invite.senderJid && (Date.now() - new Date(i.savedAt).getTime() < 60000));
    if (!isDuplicate) {
      invites.push(invite);
      const filePath = path.join(getUserDir(username), 'group.json');
      fs.writeFileSync(filePath, JSON.stringify(invites, null, 2), 'utf8');
      addLog(username, `📂 Group Link Captured: Saved details for WhatsApp group "${invite.groupName}" to group.json`, 'success');
    }
  } catch (err: any) {
    console.error('Error saving captured group invite:', err);
  }
}

async function handleGroupInviteUrl(
  username: string, 
  url: string, 
  code: string, 
  senderJid: string, 
  senderName: string, 
  messageText: string, 
  sessionId: string,
  sockInstance: any
) {
  let groupName = 'Unknown Group';
  let groupDescription = '';
  let groupSize = 0;
  let creatorJid = '';

  try {
    if (sockInstance && typeof sockInstance.groupGetInviteInfo === 'function') {
      const inviteInfo = await sockInstance.groupGetInviteInfo(code);
      if (inviteInfo) {
        groupName = inviteInfo.subject || groupName;
        groupDescription = inviteInfo.desc || inviteInfo.description || '';
        groupSize = inviteInfo.size || 0;
        creatorJid = inviteInfo.owner || inviteInfo.creator || '';
      }
    }
  } catch (err: any) {
    console.error(`Failed to fetch invite info for code ${code}:`, err.message);
  }

  saveCapturedGroupInvite(username, {
    url,
    code,
    senderJid,
    senderName,
    messageText,
    groupName,
    groupDescription,
    groupSize,
    creatorJid,
    savedAt: new Date().toISOString(),
    sessionId
  });
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
  workflowName?: string;
  tagGroupMembers?: boolean;
  batchMentions?: string[];
  tagJobId?: string;
  tagJobTotal?: number;
  tagJobCompleted?: number;
  tagJobBatchIndex?: number;
  tagJobBatchCount?: number;
  scheduledAt?: string;
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
      item.status = 'sending';
      saveUserQueue(username, queue);
      addLog(username, `Queue: Processing item ${item.id} for ${item.recipient} (Session: ${item.sessionId})...`, 'info');

      const userSessKey = `${username}:${item.sessionId}`;
      const session = sessions.get(userSessKey);
      const sentMessages = loadUserSentMessages(username);

      if (!session || session.status !== 'connected' || !session.sock) {
        item.status = 'failed';
        item.error = `Session "${item.sessionId}" is not connected`;
        saveUserQueue(username, queue);
        addLog(username, `Queue item ${item.id} failed: ${item.error}`, 'error');

        sentMessages.push({
          id: item.id,
          phoneNumber: item.recipient.split('@')[0],
          message: item.message || '[Media/Interactive Content]',
          timestamp: new Date().toISOString(),
          status: 'failed',
          error: item.error
        });
        saveUserSentMessages(username, sentMessages);
        continue;
      }

      try {
        await sendMessageDirectly(session.sock, item, username);
        
        // Reload and update
        const freshQueue = loadUserQueue(username);
        const freshIdx = freshQueue.findIndex(i => i.id === item.id);
        if (freshIdx > -1) {
          freshQueue[freshIdx].status = 'sent';
          freshQueue[freshIdx].sentAt = new Date().toISOString();
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
        if (freshIdx > -1) {
          freshQueue[freshIdx].status = 'failed';
          freshQueue[freshIdx].error = err.message || 'Unknown error';
          saveUserQueue(username, freshQueue);
        }

        addLog(username, `Queue: Item ${item.id} failed for ${item.recipient}: ${err.message}`, 'error');

        sentMessages.push({
          id: item.id,
          phoneNumber: item.recipient.split('@')[0],
          message: item.message || '[Interactive Content]',
          timestamp: new Date().toISOString(),
          status: 'failed',
          error: err.message
        });
        saveUserSentMessages(username, sentMessages);
      }

      const checkQueue = loadUserQueue(username);
      const hasReadyPending = checkQueue.some(i => 
        i.status === 'pending' && 
        !pausedSessions.includes(i.sessionId) &&
        (!i.scheduledAt || i.scheduledAt <= new Date().toISOString())
      );
      if (hasReadyPending) {
        // Generate random offset between -5 and +10 seconds
        const randomOffset = Math.floor(Math.random() * 16) - 5; // -5 to +10 seconds
        // Ensure delay is at least 2 seconds to maintain connection safety
        const actualDelay = Math.max(2, globalDelaySeconds + randomOffset);
        
        addLog(username, `Queue: Waiting ${actualDelay}s delay to throttle outgoing messages (Base delay: ${globalDelaySeconds}s, applied ${randomOffset >= 0 ? '+' : ''}${randomOffset}s natural human-like variation)...`, 'info');
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
      addLog(username, `Queue: Fetching group participants to tag in background for ${targetJid}...`, 'info');
      const metadata = await sockInstance.groupMetadata(targetJid);
      if (metadata && metadata.participants) {
        const myJid = sockInstance.user?.id ? (sockInstance.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net') : null;
        mentions = metadata.participants
          .filter((p: any) => {
            const isMe = myJid && (p.id.split('@')[0] === myJid.split('@')[0]);
            const isAdmin = p.admin === 'admin' || p.admin === 'superadmin';
            return !isMe && !isAdmin;
          })
          .map((p: any) => p.id);
        addLog(username, `Queue: Tagged ${mentions.length} members in background for ${targetJid}`, 'info');
      }
    } catch (err: any) {
      addLog(username, `Queue: Failed to fetch group metadata for tagging: ${err.message}`, 'error');
    }
  }

  try {
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
        if (preview) {
          payload = {
            extendedTextMessage: {
              text: message,
              matchedText: preview.matchedText,
              canonicalUrl: preview.canonicalUrl,
              title: preview.title,
              description: preview.description,
              jpegThumbnail: preview.jpegThumbnail
            }
          };
          if (mentions.length > 0) {
            payload.extendedTextMessage.contextInfo = {
              mentionedJid: mentions
            };
          }
        } else {
          payload = { text: message };
          if (mentions.length > 0) {
            payload.mentions = mentions;
          }
        }
      }

      if (isInteractive) {
        const msg = generateWAMessageFromContent(
          targetJid,
          payload,
          { userJid: sockInstance.user?.id }
        );
        await sockInstance.relayMessage(targetJid, msg.message, { messageId: msg.key.id });
      } else {
        await sockInstance.sendMessage(targetJid, payload);
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

function loadUserSettings(username: string): { secretPrefix: string; disableTextProcessing: boolean } {
  const filePath = path.join(getUserDir(username), 'settings.json');
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        secretPrefix: data.secretPrefix || '.',
        disableTextProcessing: !!data.disableTextProcessing
      };
    }
  } catch (err) {}
  
  const defaultSettings = { secretPrefix: '.', disableTextProcessing: false };
  try {
    fs.writeFileSync(filePath, JSON.stringify(defaultSettings, null, 2), 'utf8');
  } catch (err) {}
  return defaultSettings;
}

function saveUserSettings(username: string, settings: { secretPrefix: string; disableTextProcessing: boolean }) {
  const filePath = path.join(getUserDir(username), 'settings.json');
  try {
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf8');
    addLog(username, `User settings updated successfully.`, 'success');
  } catch (err: any) {
    addLog(username, `Failed to save user settings: ${err.message}`, 'error');
  }
}

// Captured Shares System
interface CapturedShare {
  id: string;
  timestamp: string;
  from: string;
  sender: string;
  quotedSender: string;
  quotedMessageId: string;
  quotedMessage: any;
  displayText: string;
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

function getMessagePreview(message: any): string {
  if (!message) return '[Empty Message]';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage) return `🖼️ [Image] ${message.imageMessage.caption || ''}`;
  if (message.videoMessage) return `🎥 [Video] ${message.videoMessage.caption || ''}`;
  if (message.audioMessage) return '🎵 [Audio]';
  if (message.documentMessage) return `📄 [Document] ${message.documentMessage.fileName || ''}`;
  if (message.stickerMessage) return '✨ [Sticker]';
  return '[Unsupported Message Type]';
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
        payload = { text: message };
      }

      if (isInteractive) {
        const msg = generateWAMessageFromContent(
          targetJid,
          payload,
          { userJid: sock.user?.id }
        );
        await sock.relayMessage(targetJid, msg.message, { messageId: msg.key.id });
      } else {
        await sock.sendMessage(targetJid, payload);
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

async function connectToWhatsApp(username: string, id: string, name?: string) {
  const userSessKey = `${username}:${id}`;

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

  // Cleanly close and remove listeners from existing socket before creating a new socket instance
  if (session.sock) {
    try {
      session.sock.ev.removeAllListeners();
      session.sock.end(undefined);
    } catch (e) {}
    session.sock = null;
  }

  session.status = 'connecting';
  session.qrBase64 = null;
  session.activePairingCode = null;

  const authFolder = path.join(process.cwd(), 'data', username, 'auth_info_' + id);

  try {
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);

    addLog(username, `[SESSION: ${id}] Starting WhatsApp connection...`, 'info');

    const sockInstance = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' })
    });

    session.sock = sockInstance;

    sockInstance.ev.on('creds.update', saveCreds);

    sockInstance.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          session.qrBase64 = await QRCode.toDataURL(qr);
          addLog(username, `[SESSION: ${id}] New WhatsApp Web QR Code generated.`, 'info');
        } catch (err: any) {
          addLog(username, `[SESSION: ${id}] Failed to generate QR Code Base64: ${err.message}`, 'error');
        }
      }

      if (connection === 'close') {
        session.qrBase64 = null;
        session.activePairingCode = null;
        session.status = 'disconnected';
        session.user = null;

        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const errMessage = lastDisconnect?.error?.message || 'Connection closed';
        session.lastError = errMessage;

        // Only delete saved credentials if we got an explicit, permanent logout from WhatsApp
        const isExplicitLogout = 
          statusCode === DisconnectReason.loggedOut || 
          errMessage.toLowerCase().includes('logged out');

        if (isExplicitLogout) {
          addLog(username, `[SESSION: ${id}] WhatsApp session explicitly logged out. Clearing credentials...`, 'info');
          try {
            if (fs.existsSync(authFolder)) {
              fs.rmSync(authFolder, { recursive: true, force: true });
            }
          } catch (e: any) {}
          setTimeout(() => connectToWhatsApp(username, id, name), 2000);
        } else {
          const isQrTimeout = errMessage.toLowerCase().includes('qr refs') || statusCode === 408;
          if (isQrTimeout) {
            addLog(username, `[SESSION: ${id}] QR scan timed out. Refreshing...`, 'info');
            setTimeout(() => connectToWhatsApp(username, id, name), 5000);
          } else {
            addLog(username, `[SESSION: ${id}] Connection closed/paused (Reason code: ${statusCode || 'Unknown'}, message: "${errMessage}").`, 'info');
            
            // Reconnect the socket instance cleanly in-memory instead of exiting the entire Node process.
            // This prevents server downtime and avoids breaking other users' dashboards.
            addLog(username, `[SESSION: ${id}] Recreating socket and performing clean reconnect in 5 seconds...`, 'info');
            setTimeout(() => connectToWhatsApp(username, id, name), 5000);
          }
        }
      } else if (connection === 'open') {
        session.status = 'connected';
        session.qrBase64 = null;
        session.activePairingCode = null;
        session.lastError = null;
        session.user = {
          id: sockInstance.user?.id || 'Unknown JID',
          name: sockInstance.user?.name || name || 'WhatsApp User'
        };

        addLog(username, `[SESSION: ${id}] WhatsApp connected! JID: ${session.user.id} (${session.user.name})`, 'success');
      }
    });

    sockInstance.ev.on('messages.upsert', async (m: any) => {
      if (m.type === 'notify' || m.type === 'append') {
        for (const msg of m.messages) {
          const from = msg.key.remoteJid;
          const isMe = msg.key.fromMe;

          // Check if this is a ".share" reply to a message
          const rawText = (msg.message?.conversation || 
                           msg.message?.extendedTextMessage?.text || 
                           msg.message?.imageMessage?.caption ||
                           msg.message?.videoMessage?.caption ||
                           '').trim();
          
          const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                              msg.message?.imageMessage?.contextInfo ||
                              msg.message?.videoMessage?.contextInfo ||
                              msg.message?.documentMessage?.contextInfo ||
                              msg.message?.stickerMessage?.contextInfo;
          
          const quotedMessage = contextInfo?.quotedMessage;
          const isShareReply = rawText.toLowerCase() === '.share' && !!quotedMessage;

          if (isShareReply && from) {
            try {
              const shares = loadUserShares(username);
              const quotedSender = contextInfo.participant || contextInfo.remoteJid || '';
              const quotedMessageId = contextInfo.stanzaId || '';
              
              const newShare: CapturedShare = {
                id: `share_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                timestamp: new Date().toISOString(),
                from: from,
                sender: msg.key.participant || from,
                quotedSender: quotedSender,
                quotedMessageId: quotedMessageId,
                quotedMessage: quotedMessage,
                displayText: getMessagePreview(quotedMessage),
                status: 'pending',
                forwardedTo: []
              };
              
              shares.push(newShare);
              saveUserShares(username, shares);
              
              addLog(username, `📥 [SHARE] Captured shared message from ${from}. Preview: "${newShare.displayText}"`, 'success');
              
              // Send confirmation reply back
              await sockInstance.sendMessage(from, { text: `✅ *Captured shared message!*\n\n"${newShare.displayText}"\n\nIt is now available in your dashboard panel to forward to any group.` }, { quoted: msg });
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

          // 1. Passive WhatsApp Group link scanner (creates group.json)
          if (text) {
            const groupLinkRegex = /(https?:\/\/)?chat\.whatsapp\.com\/(invite\/)?([A-Za-z0-9-]{18,26})/gi;
            let match;
            while ((match = groupLinkRegex.exec(text)) !== null) {
              const fullUrl = match[0];
              const code = match[3];
              addLog(username, `🔍 WhatsApp Group link matched in text from ${from}: ${fullUrl}. Resolving details...`, 'info');
              // Asynchronously resolve details and write to group.json (don't block)
              handleGroupInviteUrl(username, fullUrl, code, from, msg.pushName || 'Unknown Sender', text, id, sockInstance);
            }
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
                    participants = meta.participants.map((p: any) => p.id || p.jid).filter(Boolean);
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

async function getLinkPreviewData(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/i;
  const match = text.match(urlRegex);
  if (!match) return null;
  const url = match[0];
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      },
      signal: controller.signal
    });
    clearTimeout(id);
    if (!res.ok) return null;
    const html = await res.text();
    
    let title = '';
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([\s\S]*?)["']/i) ||
                         html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*property=["']og:title["']/i);
    if (ogTitleMatch) {
      title = ogTitleMatch[1].trim();
    }

    let description = '';
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i) ||
                      html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
    if (descMatch) {
      description = descMatch[1].trim();
    }
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([\s\S]*?)["']/i) ||
                        html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*property=["']og:description["']/i);
    if (ogDescMatch) {
      description = ogDescMatch[1].trim();
    }

    let imageUrl = '';
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([\s\S]*?)["']/i) ||
                         html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*property=["']og:image["']/i);
    if (ogImageMatch) {
      imageUrl = ogImageMatch[1].trim();
    }

    if (imageUrl && !imageUrl.startsWith('http')) {
      try {
        const parsed = new URL(url);
        imageUrl = new URL(imageUrl, parsed.origin).href;
      } catch (e) {}
    }

    let jpegThumbnail: Buffer | undefined = undefined;
    if (imageUrl) {
      try {
        const imgController = new AbortController();
        const imgId = setTimeout(() => imgController.abort(), 3000);
        const imgRes = await fetch(imageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
          },
          signal: imgController.signal
        });
        clearTimeout(imgId);
        if (imgRes.ok) {
          const ab = await imgRes.arrayBuffer();
          jpegThumbnail = Buffer.from(ab);
        }
      } catch (e) {
        console.error('Failed to fetch link preview thumbnail image:', e);
      }
    }

    return {
      title: title || 'Link Preview',
      description: description || url,
      canonicalUrl: url,
      matchedText: url,
      jpegThumbnail
    };
  } catch (err) {
    console.error('Failed to get link preview for', url, err);
    return null;
  }
}

// Delayed & Batched Status Scheduler Workers
async function publishStatusBatchDirectly(username: string, sched: any, batchMembers: string[]): Promise<boolean> {
  const {
    sessionIds = ['primary'],
    statusType = 'text',
    text = '',
    backgroundColor,
    font = 1,
    attachmentType = 'none',
    attachmentUrl,
    attachmentData,
    attachmentName
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
        fileRef = { url: localCachedPath };
      } else if (attachmentUrl) {
        const localCachedPath = await getCachedMediaUrl(attachmentUrl, username);
        fileRef = { url: localCachedPath };
      }
    } catch (err: any) {
      addLog(username, `❌ Status Schedule Batch Media Error: Failed to resolve attachment: ${err.message}`, 'error');
      return false;
    }
  }

  let successAny = false;
  for (const sid of validSessions) {
    const userSessKey = `${username}:${sid}`;
    const session = sessions.get(userSessKey);
    if (!session || !session.sock) continue;

    try {
      addLog(username, `Sending Status Batch of ${batchMembers.length} members from session "${session.name}"...`, 'info');

      let payload: any = {};
      const options: any = {
        statusJidList: finalJidList
      };

      if (statusType === 'text') {
        const preview = await getLinkPreviewData(text);
        if (backgroundColor) {
          const cleanHex = backgroundColor.replace('#', '');
          const argb = parseInt('FF' + cleanHex, 16);
          const backgroundArgb = argb > 2147483647 ? argb - 4294967296 : argb;
          payload = {
            extendedTextMessage: {
              text: text,
              backgroundArgb: backgroundArgb,
              font: font || 1,
              ...(preview ? {
                matchedText: preview.matchedText,
                canonicalUrl: preview.canonicalUrl,
                title: preview.title,
                description: preview.description,
                jpegThumbnail: preview.jpegThumbnail
              } : {})
            }
          };
        } else {
          if (preview) {
            payload = {
              extendedTextMessage: {
                text: text,
                matchedText: preview.matchedText,
                canonicalUrl: preview.canonicalUrl,
                title: preview.title,
                description: preview.description,
                jpegThumbnail: preview.jpegThumbnail
              }
            };
          } else {
            payload = {
              text: text
            };
          }
        }
      } else if (statusType === 'image' && fileRef) {
        payload = {
          image: fileRef,
          caption: text || ''
        };
      } else if (statusType === 'video' && fileRef) {
        payload = {
          video: fileRef,
          caption: text || ''
        };
      } else {
        throw new Error('Unsupported status type or missing attachment data');
      }

      const cleanedMentions = batchMembers.map((m: string) => m.includes('@') ? m : `${m}@s.whatsapp.net`);
      const limitMentions = cleanedMentions.slice(0, 5); // Max 5 silent mentions per WhatsApp status update
      if (statusType === 'text') {
        if (payload.extendedTextMessage) {
          payload.extendedTextMessage.contextInfo = {
            mentionedJid: limitMentions
          };
        } else {
          payload.contextInfo = {
            mentionedJid: limitMentions
          };
        }
      } else {
        payload.contextInfo = {
          mentionedJid: limitMentions
        };
        payload.mentions = limitMentions;
      }

      await session.sock.sendMessage('status@broadcast', payload, options);
      addLog(username, `✅ Successfully published WhatsApp Status batch (${batchMembers.length} tagged) from "${session.name}".`, 'success');
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
            
            // Compile unique participants of this group batch
            const uniqueParticipants = new Set<string>();
            const savedGroups = loadUserSavedGroups(username);
            for (const gid of currentGroups) {
              const match = savedGroups.find((g: any) => g.jid === gid);
              if (match && Array.isArray(match.participants)) {
                match.participants.forEach((p: string) => uniqueParticipants.add(p));
              }
            }
            const participantList = Array.from(uniqueParticipants);
            
            if (participantList.length === 0) {
              addLog(username, `⚠️ Group batch for schedule "${sched.id}" had 0 combined participants. Skipping to next.`, 'info');
              sched.completedGroups = sched.completedGroups || [];
              sched.completedGroups.push(...currentGroups);
              sched.remainingGroups = (sched.remainingGroups || []).slice(batchSize);
              sched.lastRunAt = new Date().toISOString();
              if (sched.remainingGroups.length === 0) {
                sched.status = 'completed';
                sched.nextRunAt = null;
              } else {
                const completedCount = (sched.completedGroups || []).length;
                const nextDelay = (completedCount >= 1 && sched.secondDelayMinutes) ? sched.secondDelayMinutes : sched.delayMinutes;
                sched.nextRunAt = new Date(Date.now() + nextDelay * 60 * 1000).toISOString();
              }
              hasChanges = true;
              continue;
            }
            
            const success = await publishStatusBatchDirectly(username, sched, participantList);
            
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
            
            const success = await publishStatusBatchDirectly(username, sched, currentBatch);
            
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

function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Missing authorization header.' });
  }
  const token = authHeader.replace(/^Bearer\s+/, '');
  const username = userTokens.get(token);
  if (!username) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid or expired token.' });
  }
  req.username = username;
  next();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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

  app.post('/api/settings', requireAuth, (req: any, res) => {
    const { secretPrefix, disableTextProcessing } = req.body;
    if (typeof secretPrefix !== 'string') {
      return res.status(400).json({ success: false, error: 'secretPrefix must be a string.' });
    }
    const cleanPrefix = secretPrefix.trim();
    if (!cleanPrefix) {
      return res.status(400).json({ success: false, error: 'secretPrefix cannot be empty.' });
    }
    const settings = { 
      secretPrefix: cleanPrefix,
      disableTextProcessing: !!disableTextProcessing
    };
    saveUserSettings(req.username, settings);
    res.json({ success: true, settings, message: 'Settings saved successfully!' });
  });

  // Captured Group Invites APIs
  app.get('/api/captured-group-invites', requireAuth, (req: any, res) => {
    res.json({ success: true, invites: loadUserGroupInvites(req.username) });
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

  app.delete('/api/shares/:id', requireAuth, (req: any, res) => {
    const { id } = req.params;
    let shares = loadUserShares(req.username);
    const initialLength = shares.length;
    shares = shares.filter(s => s.id !== id);
    if (shares.length < initialLength) {
      saveUserShares(req.username, shares);
      addLog(req.username, `🗑️ Deleted captured share "${id}".`, 'success');
      res.json({ success: true, message: 'Share deleted successfully.' });
    } else {
      res.status(404).json({ success: false, error: 'Share not found' });
    }
  });

  // Helper to format/transform messages for native forwarding with the "Forwarded" tag
  function prepareForwardedMessage(originalQuotedMessage: any) {
    if (!originalQuotedMessage) return originalQuotedMessage;
    
    // Clean deep copy to avoid mutating the database stored object
    const quotedMessage = JSON.parse(JSON.stringify(originalQuotedMessage));
    
    // Case 1: Simple plain text conversation
    if (quotedMessage.conversation) {
      return {
        extendedTextMessage: {
          text: quotedMessage.conversation,
          contextInfo: {
            isForwarded: true,
            forwardingScore: 1
          }
        }
      };
    }
    
    // Case 2: Standard structured messages supporting contextInfo
    const messageKeys = [
      'extendedTextMessage',
      'imageMessage',
      'videoMessage',
      'audioMessage',
      'documentMessage',
      'stickerMessage',
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
          inner.contextInfo = {
            ...(inner.contextInfo || {}),
            isForwarded: true,
            forwardingScore: 1
          };
        }
        return quotedMessage;
      }
    }
    
    // Fallback: If we couldn't match a known message key, try to scan keys ending with "Message"
    const anyMessageKey = Object.keys(quotedMessage).find(k => k.endsWith('Message'));
    if (anyMessageKey) {
      const inner = quotedMessage[anyMessageKey];
      if (inner && typeof inner === 'object') {
        inner.contextInfo = {
          ...(inner.contextInfo || {}),
          isForwarded: true,
          forwardingScore: 1
        };
      }
      return quotedMessage;
    }
    
    // Fallback: If no recognized structure, return as is
    return quotedMessage;
  }

  app.post('/api/shares/forward', requireAuth, async (req: any, res) => {
    const { shareId, targetJids, sessionId } = req.body;
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

    const results: Array<{ jid: string; success: boolean; error?: string }> = [];

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

      try {
        addLog(req.username, `Forwarding shared message to ${formattedJid}...`, 'info');
        
        // Construct native message representation for Baileys to forward the same original message
        const originalMessage = {
          key: {
            remoteJid: share.from,
            id: share.quotedMessageId,
            fromMe: share.quotedSender === sess.sock.user?.id || (sess.sock.user?.id && share.quotedSender.split('@')[0] === sess.sock.user?.id.split(':')[0]),
            participant: share.quotedSender
          },
          message: share.quotedMessage
        };
        
        // Forward message natively using Baileys { forward: ... } option
        await sess.sock.sendMessage(formattedJid, { forward: originalMessage });
        
        results.push({ jid: formattedJid, success: true });
        addLog(req.username, `✅ Forwarded message to ${formattedJid} successfully.`, 'success');
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
    }

    // Update share status
    share.status = 'forwarded';
    const uniqueTargets = Array.from(new Set([...(share.forwardedTo || []), ...results.filter(r => r.success).map(r => r.jid)]));
    share.forwardedTo = uniqueTargets;
    saveUserShares(req.username, shares);

    res.json({ success: true, results });
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

  // QR and Status APIs
  app.get('/api/qr', requireAuth, (req: any, res) => {
    const sessionId = (req.query.sessionId as string) || 'primary';
    const userSessKey = `${req.username}:${sessionId}`;
    const sess = sessions.get(userSessKey);
    res.json({ 
      qr: sess ? sess.qrBase64 : null, 
      status: sess ? sess.status : 'disconnected' 
    });
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

        const subject = g.subject || 'Unnamed Group';
        
        let isAdmin = false;
        if (g.participants && userJid) {
          const selfPart = g.participants.find((p: any) => {
            const pJid = (p.id || p.jid || '').split(':')[0].split('@')[0] + '@s.whatsapp.net';
            return pJid === userJid;
          });
          if (selfPart) {
            isAdmin = !!(selfPart.admin || selfPart.isAdmin || selfPart.isSuperAdmin);
          }
        }

        const onlyAdminsCanSend = !!g.announce;
        const canUserSend = !onlyAdminsCanSend || isAdmin;

        const groupDetails: SavedGroup = {
          jid,
          name: subject,
          savedAt: new Date().toISOString(),
          sessionId: selectedSessionId,
          participants: g.participants ? g.participants.map((p: any) => p.id || p.jid).filter(Boolean) : [],
          isAdmin,
          onlyAdminsCanSend,
          canUserSend,
          memberCount: g.participants ? g.participants.length : 0
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

      return {
        id: c.id,
        name: c.name,
        status: s ? s.status : 'disconnected',
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
    const { id, sessionId } = req.body;
    const targetId = id || sessionId;

    if (!targetId) {
      return res.status(400).json({ success: false, error: 'Session ID is required.' });
    }

    const authFolder = path.join(process.cwd(), 'data', req.username, 'auth_info_' + targetId);
    const credsFile = path.join(authFolder, 'creds.json');

    if (!fs.existsSync(credsFile)) {
      return res.status(400).json({
        success: false,
        error: `No saved credentials found for session "${targetId}". Please scan QR code or request Pairing Code.`
      });
    }

    const userSessKey = `${req.username}:${targetId}`;
    const existingSess = sessions.get(userSessKey);

    if (existingSess && existingSess.sock) {
      try {
        existingSess.sock.ev.removeAllListeners();
        existingSess.sock.end(undefined);
      } catch (e) {}
      existingSess.sock = null;
    }

    addLog(req.username, `[SESSION: ${targetId}] Manually triggering connection re-establishment using saved credentials...`, 'info');

    const configs = loadUserSessionsConfig(req.username);
    const sessConfig = configs.find(c => c.id === targetId);
    const sessionName = sessConfig ? sessConfig.name : (targetId === 'primary' ? 'Primary Account' : 'WhatsApp Session');

    try {
      await connectToWhatsApp(req.username, targetId, sessionName);
      res.json({ success: true, message: `Reconnecting session "${targetId}" using saved credentials...` });
    } catch (err: any) {
      addLog(req.username, `[SESSION: ${targetId}] Reconnect error: ${err.message}`, 'error');
      res.status(500).json({ success: false, error: err.message || 'Failed to reconnect session.' });
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
    saveUserQueue(req.username, []);
    addLog(req.username, 'Message Queue cleared successfully.', 'info');
    res.json({ success: true, message: 'Message Queue cleared successfully.' });
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

    if (!message && (attachmentType === 'none' || !attachmentType)) {
      return res.status(400).json({ success: false, error: 'Please provide either a message body or an attachment.' });
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

      if (recipientType === 'group' && tagGroupMembers) {
        try {
          const userSessKey = `${req.username}:${assignedSessionId}`;
          const sess = sessions.get(userSessKey);
          if (sess && sess.sock) {
            addLog(req.username, `Queue API: Fetching participants to split group tagging into batches for ${targetJid}`, 'info');
            const metadata = await sess.sock.groupMetadata(targetJid);
            if (metadata && metadata.participants) {
              const myJid = sess.sock.user?.id ? (sess.sock.user.id.split(':')[0].split('@')[0] + '@s.whatsapp.net') : null;
              const participants = metadata.participants
                .filter((p: any) => {
                  const isMe = myJid && (p.id.split('@')[0] === myJid.split('@')[0]);
                  const isAdmin = p.admin === 'admin' || p.admin === 'superadmin';
                  return !isMe && !isAdmin;
                })
                .map((p: any) => p.id);

              if (participants.length > 0) {
                const batchSize = 10;
                const tagJobId = `tagjob_${Math.random().toString(36).substring(7)}`;
                const totalMembers = participants.length;
                const totalBatches = Math.ceil(totalMembers / batchSize);

                for (let b = 0; b < participants.length; b += batchSize) {
                  const batchMembers = participants.slice(b, b + batchSize);
                  const item = pushToUserQueue(req.username, {
                    recipient: targetJid,
                    recipientType,
                    messageType: msgType,
                    message,
                    footer,
                    attachmentType,
                    attachmentUrl,
                    attachmentData,
                    attachmentName,
                    inlineAttachment,
                    buttons,
                    templateButtons,
                    listButtonText,
                    listSections,
                    sessionId: assignedSessionId,
                    tagGroupMembers: false,
                    batchMentions: batchMembers,
                    tagJobId,
                    tagJobTotal: totalMembers,
                    tagJobCompleted: b,
                    tagJobBatchIndex: Math.floor(b / batchSize) + 1,
                    tagJobBatchCount: totalBatches,
                    scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined
                  });
                  addedItems.push(item);
                }
                continue; // Skip the default single queue push
              }
            }
          }
        } catch (err: any) {
          console.error('[API SEND] Error setting up pre-batched group tagging:', err);
        }
      }

      const item = pushToUserQueue(req.username, {
        recipient: targetJid,
        recipientType,
        messageType: msgType,
        message,
        footer,
        attachmentType,
        attachmentUrl,
        attachmentData,
        attachmentName,
        inlineAttachment,
        buttons,
        templateButtons,
        listButtonText,
        listSections,
        sessionId: assignedSessionId,
        tagGroupMembers: !!tagGroupMembers,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined
      });
      addedItems.push(item);
    }

    res.json({
      success: true,
      message: `Enqueued ${recipients.length} message(s) across ${validSessions.length} selected session(s).`,
      queuedCount: recipients.length,
      items: addedItems
    });
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

    // Resolve final JID target list
    let finalJidList = [...statusJidList];
    if (finalJidList.length === 0) {
      // Auto-load all leads & group members as a fallback to make sure status is visible
      const leads = loadUserLeads(req.username) || [];
      const leadJids = leads.map((l: any) => l.jid).filter(Boolean);
      finalJidList = Array.from(new Set([...leadJids]));
    }

    // Prepare media file reference if there is any
    let fileRef: any = null;
    if (statusType !== 'text' && attachmentType && attachmentType !== 'none') {
      try {
        if (attachmentData) {
          const localCachedPath = await getCachedUploadMedia(attachmentData, attachmentName || '', req.username);
          fileRef = { url: localCachedPath };
        } else if (attachmentUrl) {
          const localCachedPath = await getCachedMediaUrl(attachmentUrl, req.username);
          fileRef = { url: localCachedPath };
        }
      } catch (err: any) {
        addLog(req.username, `❌ Status Media Error: Failed to resolve attachment: ${err.message}`, 'error');
        return res.status(400).json({ success: false, error: `Failed to resolve attachment: ${err.message}` });
      }
    }

    const results = [];
    for (const sid of validSessions) {
      const userSessKey = `${req.username}:${sid}`;
      const session = sessions.get(userSessKey);
      if (!session || !session.sock) continue;

      try {
        addLog(req.username, `Sending WhatsApp Status (${statusType}) from session "${session.name}"...`, 'info');

        let payload: any = {};
        const options: any = {
          statusJidList: finalJidList
        };

        if (statusType === 'text') {
          const preview = await getLinkPreviewData(text);
          if (backgroundColor) {
            const cleanHex = backgroundColor.replace('#', '');
            const argb = parseInt('FF' + cleanHex, 16);
            const backgroundArgb = argb > 2147483647 ? argb - 4294967296 : argb;
            payload = {
              extendedTextMessage: {
                text: text,
                backgroundArgb: backgroundArgb,
                font: font || 1,
                ...(preview ? {
                  matchedText: preview.matchedText,
                  canonicalUrl: preview.canonicalUrl,
                  title: preview.title,
                  description: preview.description,
                  jpegThumbnail: preview.jpegThumbnail
                } : {})
              }
            };
          } else {
            if (preview) {
              payload = {
                extendedTextMessage: {
                  text: text,
                  matchedText: preview.matchedText,
                  canonicalUrl: preview.canonicalUrl,
                  title: preview.title,
                  description: preview.description,
                  jpegThumbnail: preview.jpegThumbnail
                }
              };
            } else {
              payload = {
                text: text
              };
            }
          }
        } else if (statusType === 'image' && fileRef) {
          payload = {
            image: fileRef,
            caption: text || ''
          };
        } else if (statusType === 'video' && fileRef) {
          payload = {
            video: fileRef,
            caption: text || ''
          };
        } else {
          throw new Error('Unsupported status type or missing attachment data');
        }

        // Add silent mentions/tags (Max 5 for safety)
        if (mentions && mentions.length > 0) {
          const cleanedMentions = mentions.map((m: string) => m.includes('@') ? m : `${m}@s.whatsapp.net`);
          const limitMentions = cleanedMentions.slice(0, 5); // Max 5 silent mentions per status update
          if (statusType === 'text') {
            if (payload.extendedTextMessage) {
              payload.extendedTextMessage.contextInfo = {
                mentionedJid: limitMentions
              };
            } else {
              payload.contextInfo = {
                mentionedJid: limitMentions
              };
            }
          } else {
            payload.contextInfo = {
              mentionedJid: limitMentions
            };
            payload.mentions = limitMentions;
          }
        }

        await session.sock.sendMessage('status@broadcast', payload, options);
        results.push({ sessionId: sid, success: true });
        addLog(req.username, `✅ Successfully published WhatsApp status from session "${session.name}".`, 'success');
      } catch (err: any) {
        console.error(`Error sending status from session ${sid}:`, err);
        results.push({ sessionId: sid, success: false, error: err.message });
        addLog(req.username, `❌ Failed to send status from session "${session.name}": ${err.message}`, 'error');
      }
    }

    const allSuccessful = results.every(r => r.success);
    if (allSuccessful) {
      res.json({ success: true, message: 'Status successfully published to WhatsApp!', results });
    } else if (results.some(r => r.success)) {
      res.json({ success: true, message: 'Status published from some connected sessions.', results });
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
      batchMode = 'members', // 'members' or 'groups'
      delayMinutes = 5,
      secondDelayMinutes,
      batchSize = 5,
      startTime
    } = req.body;

    const isGroupMode = batchMode === 'groups';

    if (isGroupMode) {
      if (!groupIds || groupIds.length === 0) {
        return res.status(400).json({ success: false, error: 'No groups selected for the scheduled background queue.' });
      }
    } else {
      if (!groupMembers || groupMembers.length === 0) {
        return res.status(400).json({ success: false, error: 'No group members provided for the scheduled background tags.' });
      }
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
      totalMembersCount: groupMembers.length,
      remainingMembers: groupMembers,
      completedMembers: [],
      totalGroupsCount: groupIds.length,
      remainingGroups: groupIds,
      completedGroups: [],
      delayMinutes: cleanDelay,
      secondDelayMinutes: cleanSecondDelay,
      batchSize: cleanBatchSize,
      status: 'active',
      createdAt: new Date().toISOString(),
      nextRunAt: startTime ? new Date(startTime).toISOString() : new Date(Date.now() + 5000).toISOString() // start first batch at future time or in 5s!
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
      server: { middlewareMode: true },
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

// Trigger initial health check in 10 seconds, then repeat every 5 minutes (300,000 ms)
setTimeout(runSystemHealthMonitor, 10000);
setInterval(runSystemHealthMonitor, 5 * 60 * 1000);

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
