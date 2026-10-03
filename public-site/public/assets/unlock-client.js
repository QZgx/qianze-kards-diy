// 铸钢本地解锁客户端：密钥在本机校验，解锁后永久有效，不再联网。
//
// 校验链：密钥 →(PBKDF2-SHA256, 10 万次) h1 →(PBKDF2-SHA256, 100 万次) h2
//         → SHA-256(h2 + 标签) 与内置校验值比对；素材密钥 = PBKDF2(h2, salt, 20 万次)。
// 客户端只保存校验值和盐，不保存 h2 与素材密钥，因此还原素材必须完整跑完 110 万次迭代。
const CONFIG = {
  version: 2,
  mode: 'local',
  stage1: { salt: 'k/KzNnnNpECrssHmXqq1nzHBatYGeNfI', iterations: 100000 },
  stage2: { salt: 'FjgJ8dkcmg2rrgUsBYrx6g==', iterations: 1000000 },
  verifier: 'sAGygW+iQayugCEr5WjrjDDA4Y4vLHXRAK5Wc3BCmEA=',
  asset: { salt: 'We73lrs6rhTS/krAJ9nW1w==', iterations: 200000 },
};
const VERIFIER_TAG = 'kards-steel-v2';
const STORAGE_KEY = 'kards.steel.unlock.v2';
const FAILURE_KEY = 'kards.steel.fail.v2';
const MAX_STORED_FAILURES = 10;
const enc = new TextEncoder();
const listeners = new Set();
let current = { unlocked: false, expiresAt: 0, checked: false, permanent: true };
let storedKey = '';
let storageLoaded = false;
let dialogRequest;
let decryptRequest;
let assetKey;

function nativeClient() {
  try { return window.KARDS_NATIVE_DESKTOP === true || window.Capacitor?.getPlatform?.() === 'android'; }
  catch { return false; }
}

function preferences() {
  if (window.KARDS_NATIVE_DESKTOP && window.KARDS_DESKTOP_SESSION) {
    return {
      get: async () => ({ value: await window.KARDS_DESKTOP_SESSION.get() }),
      set: async ({ value }) => window.KARDS_DESKTOP_SESSION.set(value),
      remove: async () => window.KARDS_DESKTOP_SESSION.remove(),
    };
  }
  try { return window.Capacitor.registerPlugin('Preferences'); }
  catch { return null; }
}

async function loadStoredKey() {
  if (storageLoaded) return storedKey;
  storageLoaded = true;
  const store = nativeClient() ? await preferences() : null;
  try { storedKey = (await store?.get({ key: STORAGE_KEY }))?.value || ''; }
  catch { storedKey = ''; }
  if (!storedKey) {
    try { storedKey = localStorage.getItem(STORAGE_KEY) || ''; }
    catch { storedKey = ''; }
  }
  return storedKey;
}

async function saveStoredKey(value) {
  storedKey = value;
  const store = nativeClient() ? await preferences() : null;
  try {
    if (value) await store?.set({ key: STORAGE_KEY, value });
    else await store?.remove({ key: STORAGE_KEY });
  } catch { /* 存储不可用时仍保留内存中的解锁状态。 */ }
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* 存储可选。 */ }
}

function base64Bytes(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function base64Text(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function equalBytes(left, right) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ (right[index] ?? 0);
  return difference === 0;
}

async function deriveAuth(entered) {
  const material = await crypto.subtle.importKey('raw', enc.encode(entered), 'PBKDF2', false, ['deriveBits']);
  const first = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64Bytes(CONFIG.stage1.salt), iterations: CONFIG.stage1.iterations, hash: 'SHA-256' },
    material,
    256,
  );
  const hardened = await crypto.subtle.importKey('raw', first, 'PBKDF2', false, ['deriveBits']);
  const second = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64Bytes(CONFIG.stage2.salt), iterations: CONFIG.stage2.iterations, hash: 'SHA-256' },
    hardened,
    256,
  ));
  const tag = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...second, ...enc.encode(VERIFIER_TAG)])));
  if (!equalBytes(tag, base64Bytes(CONFIG.verifier))) throw new Error('密钥不正确，请重新输入');
  const assetBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: base64Bytes(CONFIG.asset.salt), iterations: CONFIG.asset.iterations, hash: 'SHA-256' },
    await crypto.subtle.importKey('raw', second, 'PBKDF2', false, ['deriveBits']),
    256,
  );
  // 同时返回原始字节：解锁状态需要把它存进本地存储，所以不能只留不可导出的 CryptoKey。
  const key = await crypto.subtle.importKey('raw', assetBits, 'AES-GCM', false, ['decrypt']);
  return { key, bytes: new Uint8Array(assetBits) };
}

function failures() {
  try { return JSON.parse(localStorage.getItem(FAILURE_KEY) || '{"count":0,"until":0}'); }
  catch { return { count: 0, until: 0 }; }
}

function rememberFailure() {
  const state = failures();
  state.count = Math.min(state.count + 1, MAX_STORED_FAILURES);
  state.until = Date.now() + (state.count >= 6 ? 30000 : state.count >= 3 ? 2000 : 0);
  try { localStorage.setItem(FAILURE_KEY, JSON.stringify(state)); } catch { /* 存储可选。 */ }
  return state;
}

function clearFailures() {
  try { localStorage.removeItem(FAILURE_KEY); } catch { /* 存储可选。 */ }
}

function updateState(unlocked) {
  current = { unlocked: !!unlocked, expiresAt: unlocked ? Number.MAX_SAFE_INTEGER : 0, checked: true, permanent: true };
  if (!unlocked) { assetKey = undefined; decryptRequest = undefined; }
  for (const listener of listeners) listener({ ...current });
}

async function checkSession() {
  if (current.unlocked && assetKey) return true;
  const value = await loadStoredKey();
  if (!value) { updateState(false); return false; }
  try {
    assetKey = await crypto.subtle.importKey('raw', base64Bytes(value), 'AES-GCM', false, ['decrypt']);
    updateState(true);
    return true;
  } catch {
    await saveStoredKey('');
    updateState(false);
    return false;
  }
}

function promptUnlock(initialMessage = '') {
  if (dialogRequest) return dialogRequest;
  dialogRequest = new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.48);box-sizing:border-box';
    const dialog = document.createElement('form');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'steel-unlock-title');
    dialog.style.cssText = 'width:100%;max-width:340px;border-radius:16px;background:white;padding:24px;box-sizing:border-box;color:#323233;font:14px/1.5 sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.18)';
    dialog.innerHTML = '<h2 id="steel-unlock-title" style="font-size:18px;text-align:center;margin:0 0 16px">解锁铸钢——来自BigC</h2><label for="steel-unlock-input" style="display:block;margin-bottom:8px">请输入密钥</label><input id="steel-unlock-input" type="password" autocomplete="off" spellcheck="false" maxlength="128" required style="width:100%;height:44px;box-sizing:border-box;border:1px solid #dcdee0;border-radius:8px;padding:0 12px;font:inherit;outline-color:#1989fa"><div role="alert" style="min-height:22px;color:#b42318;font-size:12px;margin:8px 0 16px"></div><p style="margin:0 0 16px;color:#8a8f99;font-size:12px">密钥在本机校验，解锁后永久有效，无需联网。</p><div style="display:flex;gap:12px"><button type="button" data-cancel style="flex:1;height:42px;border:1px solid #dcdee0;border-radius:8px;background:white;color:#646566;font:inherit">取消</button><button type="submit" style="flex:1;height:42px;border:0;border-radius:8px;background:#1989fa;color:white;font:inherit">解锁</button></div>';
    overlay.append(dialog);
    const input = dialog.querySelector('input');
    const error = dialog.querySelector('[role="alert"]');
    const submit = dialog.querySelector('[type="submit"]');
    const cancel = dialog.querySelector('[data-cancel]');
    error.textContent = initialMessage;
    let finished = false;
    const close = (result) => {
      if (finished) return;
      finished = true;
      input.value = '';
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
      dialogRequest = undefined;
      resolve(result);
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(false); }
      if (event.key === 'Tab') {
        const focusable = [input, cancel, submit].filter((node) => !node.disabled);
        const index = focusable.indexOf(document.activeElement);
        const next = event.shiftKey ? (index - 1 + focusable.length) % focusable.length : (index + 1) % focusable.length;
        event.preventDefault(); focusable[next].focus();
      }
    };
    cancel.addEventListener('click', () => close(false));
    dialog.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      const enteredKey = input.value;
      if (!enteredKey) { input.focus(); return; }
      const state = failures();
      if (state.until > Date.now()) {
        error.textContent = `尝试次数过多，请 ${Math.ceil((state.until - Date.now()) / 1000)} 秒后再试。`;
        return;
      }
      input.value = '';
      submit.disabled = true;
      submit.textContent = '正在验证…';
      error.textContent = '';
      await new Promise((next) => setTimeout(next, 30));
      try {
        const derived = await deriveAuth(enteredKey);
        if (finished) return;
        assetKey = derived.key;
        await saveStoredKey(base64Text(derived.bytes));
        clearFailures();
        updateState(true);
        close(true);
      } catch (failure) {
        if (!finished) {
          const next = rememberFailure();
          error.textContent = next.until > Date.now()
            ? `${failure.message || '验证失败，请重试。'}（尝试次数过多，请稍后再试）`
            : failure.message || '验证失败，请重试。';
          input.focus();
        }
      } finally {
        submit.disabled = false;
        submit.textContent = '解锁';
      }
    });
    document.body.append(overlay);
    document.addEventListener('keydown', onKeydown);
    input.focus();
  });
  return dialogRequest;
}

async function ensureUnlocked() {
  if (await checkSession()) return true;
  return promptUnlock('');
}

async function loadSteel() {
  if (!await checkSession()) throw new Error('铸钢模块需要密钥解锁。');
  return import('./steel-renderer.js').then((module) => module.kardsSteel);
}

async function readAsset(relative) {
  if (!await checkSession()) throw new Error('铸钢模块需要密钥解锁。');
  const segments = String(relative).split('/');
  if (!segments.length || segments.some((part) => !part || part === '.' || part === '..')) throw new Error('无效的铸钢资源路径。');
  const assetURL = new URL('./steel-secure/' + segments.map(encodeURIComponent).join('/') + '.bin', import.meta.url);
  const response = await fetch(assetURL);
  if (!response.ok) throw new Error('铸钢资源无法读取，请重新解锁。');
  const encrypted = new Uint8Array(await response.arrayBuffer());
  if (encrypted.length < 29) throw new Error('铸钢资源损坏，请重新解锁。');
  try {
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: encrypted.subarray(0, 12) }, assetKey, encrypted.subarray(12));
  } catch {
    await saveStoredKey('');
    updateState(false);
    throw new Error('铸钢资源无法解密，请重新输入密钥。');
  }
}

async function lock() {
  await saveStoredKey('');
  updateState(false);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const kardsUnlock = {
  get state() { return { ...current }; },
  ensureUnlocked, checkSession, loadSteel, readAsset, lock, subscribe,
};

// 仅供自动化测试校验派生链，应用本身只使用 kardsUnlock。
export const __steelInternals = { deriveAuth, CONFIG };
