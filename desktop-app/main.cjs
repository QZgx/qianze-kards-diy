'use strict';

const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createLocalServer } = require('./local-server.cjs');

let localOrigin;
let localServer;
let mainWindow;

function localSender(event) {
  try {
    return event.sender === mainWindow?.webContents &&
      event.senderFrame === mainWindow.webContents.mainFrame &&
      new URL(event.senderFrame.url).origin === localOrigin;
  } catch { return false; }
}

function configureTokenStorage() {
  const sessionFile = path.join(app.getPath('userData'), 'steel-session.dat');
  const allow = event => { if (!localSender(event)) throw new Error('Request denied'); };
  ipcMain.handle('kards-session:get', async event => {
    allow(event);
    if (!safeStorage.isEncryptionAvailable()) return '';
    try { return safeStorage.decryptString(await fs.readFile(sessionFile)); }
    catch { return ''; }
  });
  ipcMain.handle('kards-session:set', async (event, token) => {
    allow(event);
    if (typeof token !== 'string' || token.length > 8192 || /[\r\n\0]/.test(token)) throw new Error('Invalid session');
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (!token) { await fs.rm(sessionFile, { force: true }); return true; }
    const encrypted = safeStorage.encryptString(token);
    await fs.mkdir(path.dirname(sessionFile), { recursive: true });
    await fs.writeFile(sessionFile, encrypted);
    return true;
  });
  ipcMain.handle('kards-session:remove', async event => {
    allow(event);
    await fs.rm(sessionFile, { force: true });
    return true;
  });
}

async function openWindow() {
  mainWindow = new BrowserWindow({
    width: 920, height: 1040, minWidth: 600, minHeight: 700,
    title: 'KARDS 制卡（浅泽改）', backgroundColor: '#eef3f6',
    show: false, autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false, nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true, sandbox: true,
      webSecurity: true, allowRunningInsecureContent: false,
      webviewTag: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).protocol === 'https:') void shell.openExternal(url); }
    catch { /* Invalid external links are ignored. */ }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try { if (new URL(url).origin === localOrigin) return; }
    catch { /* Treat invalid navigation as external. */ }
    event.preventDefault();
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.webContents.session.on('will-download', (_event, item) => {
    const filename = path.basename(item.getFilename()).replace(/[\\/:*?"<>|]/g, '_');
    item.setSaveDialogOptions({
      title: '保存卡牌图片', defaultPath: path.join(app.getPath('downloads'), filename || '我的卡牌.png'),
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    });
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = undefined; });
  await mainWindow.loadURL(`${localOrigin}/index.html`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  });
  app.whenReady().then(async () => {
    const local = await createLocalServer(path.join(__dirname, 'web'));
    localOrigin = local.origin;
    localServer = local.server;
    configureTokenStorage();
    await openWindow();
  }).catch(() => {
    dialog.showErrorBox('无法启动 KARDS 制卡', '本地编辑器无法加载，请重新安装后再试。');
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => localServer?.close());
}
