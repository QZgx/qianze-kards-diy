import { kardsAzur } from './azur-renderer.js';
import { downloadTemplateArchive } from './azur-export.js';

const byId = id => document.getElementById(id);
const descriptions = { 'blue-gray': '阿尔萨斯 · 蓝灰几何线条', 'white-gold': '弗兰德尔 · 白金斜切卡框', purple: '紫色 · 柔和冷调', 'silver-white': '银白 · 明亮极简' };
const swatches = { 'blue-gray': '#7594b4', 'white-gold': '#d6a12e', purple: '#9d8bb8', 'silver-white': '#c9d2dc' };
const palettes = kardsAzur.palettes;
const canvases = new Map();
const paletteButtons = new Map();
const cardButtons = new Map();
const formIds = ['cost','card-name','subtitle','description','name-size','font-size','description-align','art-scale','art-x','art-y','blank-preview'];
let selectedPalette = 'blue-gray';
let artwork = null;
let uploadUrl = null;
let artworkRevision = 0;
let previewRevision = 0;
let previewRunning = false;
let exportRunning = false;

function paletteLabel(id) { return palettes.find(item => item.id === id)?.label || id; }
function showError(message = '') { byId('error-message').textContent = message; byId('error-message').hidden = !message; }
function number(id, fallback) { const value = Number(byId(id).value); return Number.isFinite(value) ? value : fallback; }

function stateFor(paletteId, blank = byId('blank-preview').checked) {
  return {
    palette: paletteId,
    art: blank ? null : artwork,
    artScale: number('art-scale', 1), artX: number('art-x', 0), artY: number('art-y', 0),
    name: blank ? '' : byId('card-name').value,
    cost: blank ? '' : byId('cost').value,
    subtitle: blank ? '' : byId('subtitle').value,
    skills: blank ? '' : byId('description').value,
    keywords: [], nameSize: number('name-size', 52), fontSize: number('font-size', 36),
    descriptionAlign: byId('description-align').value, showStats: false,
  };
}

function selectPalette(id) {
  selectedPalette = id;
  byId('selected-label').textContent = paletteLabel(id);
  byId('export-label').textContent = paletteLabel(id);
  for (const [key, button] of paletteButtons) button.setAttribute('aria-pressed', String(key === id));
  for (const [key, button] of cardButtons) button.setAttribute('aria-pressed', String(key === id));
}

function buildPreviews() {
  for (const palette of palettes) {
    const paletteButton = document.createElement('button');
    paletteButton.type = 'button'; paletteButton.className = 'palette-button';
    paletteButton.setAttribute('aria-label', `选择${palette.label}模板`);
    const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.background = swatches[palette.id];
    paletteButton.append(swatch, document.createTextNode(palette.label));
    paletteButton.addEventListener('click', () => selectPalette(palette.id));
    paletteButtons.set(palette.id, paletteButton); byId('palette-controls').append(paletteButton);

    const figure = document.createElement('figure'); figure.className = 'card-item';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'card-select';
    button.setAttribute('aria-label', `选择${palette.label}卡面`); button.dataset.palette = palette.id;
    const canvas = document.createElement('canvas'); canvas.className = 'card-canvas';
    canvas.width = kardsAzur.WIDTH; canvas.height = kardsAzur.HEIGHT;
    canvas.setAttribute('aria-label', `${palette.label}卡牌预览`); canvas.dataset.palette = palette.id;
    button.append(canvas); button.addEventListener('click', () => selectPalette(palette.id));
    const caption = document.createElement('figcaption');
    const captionSwatch = swatch.cloneNode(); caption.append(captionSwatch, document.createTextNode(palette.label));
    const description = document.createElement('p'); description.className = 'style-description'; description.textContent = descriptions[palette.id];
    figure.append(button, caption, description); byId('card-grid').append(figure);
    canvases.set(palette.id, canvas); cardButtons.set(palette.id, button);
  }
  selectPalette(selectedPalette);
}

function updateOutputs() {
  byId('scale-value').textContent = `${Math.round(number('art-scale', 1) * 100)}%`;
  byId('x-value').textContent = byId('art-x').value;
  byId('y-value').textContent = byId('art-y').value;
}

function schedulePreview() {
  previewRevision++;
  updateOutputs();
  if (!previewRunning) void renderPreviews();
}

async function renderPreviews() {
  previewRunning = true;
  let renderedRevision = 0;
  try {
    do {
      renderedRevision = previewRevision;
      byId('render-status').textContent = '正在更新…';
      const state = stateFor(selectedPalette);
      await Promise.all(palettes.map(palette => kardsAzur.render(canvases.get(palette.id), { ...state, palette: palette.id })));
    } while (renderedRevision !== previewRevision);
    byId('render-status').textContent = byId('blank-preview').checked ? '空白模板预览' : artwork ? '四种配色已更新' : '空白立绘 · 可上传图片';
    showError();
  } catch (error) {
    byId('render-status').textContent = '预览未完成';
    showError(`模板加载失败：${error.message || String(error)}`);
  } finally {
    previewRunning = false;
    if (renderedRevision !== previewRevision) void renderPreviews();
  }
}

async function decodedImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片无法读取'));
    image.src = url;
  });
}

function resetPosition() {
  byId('art-scale').value = '1'; byId('art-x').value = '0'; byId('art-y').value = '0';
}

byId('art-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const revision = ++artworkRevision;
  const pendingUrl = URL.createObjectURL(file);
  try {
    const image = await decodedImage(pendingUrl);
    if (revision !== artworkRevision) { URL.revokeObjectURL(pendingUrl); return; }
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    uploadUrl = pendingUrl; artwork = image;
    resetPosition(); byId('blank-preview').checked = false;
    byId('art-name').textContent = `${file.name} · ${image.naturalWidth} × ${image.naturalHeight}`;
    schedulePreview();
  } catch {
    URL.revokeObjectURL(pendingUrl);
    if (revision === artworkRevision) showError('图片无法读取，请选择有效的 PNG、JPG 或 WebP 图片。');
  }
});

byId('clear-art').addEventListener('click', () => {
  artworkRevision++; artwork = null;
  if (uploadUrl) URL.revokeObjectURL(uploadUrl);
  uploadUrl = null; byId('art-file').value = '';
  byId('art-name').textContent = '未上传立绘 · 可保留当前文本';
  resetPosition(); schedulePreview();
});

byId('load-demo').addEventListener('click', async () => {
  const revision = ++artworkRevision;
  const button = byId('load-demo'); button.disabled = true;
  try {
    const image = await decodedImage(new URL('./azur/demo-art.jpg', import.meta.url).href);
    if (revision !== artworkRevision) return;
    if (uploadUrl) URL.revokeObjectURL(uploadUrl);
    uploadUrl = null; artwork = image; resetPosition();
    byId('card-name').value = '阿尔萨斯'; byId('cost').value = '4';
    byId('subtitle').value = 'IRIS LIBRE · BATTLESHIP';
    byId('description').value = '部署：使一个友方单位获得 +2 攻击力。\n每回合首次攻击后，抽一张牌。';
    byId('art-name').textContent = '舰船立绘示例 · 效果文字仅用于排版演示';
    byId('blank-preview').checked = false; schedulePreview();
  } catch {
    if (revision === artworkRevision) showError('舰船示例尚未就绪，请先上传自己的立绘。');
  } finally { button.disabled = false; }
});

byId('reset-art').addEventListener('click', () => { resetPosition(); schedulePreview(); });
for (const id of formIds) byId(id).addEventListener('input', schedulePreview);

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function pngBlob(canvas) {
  return new Promise((resolve, reject) => {
    try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 导出失败')), 'image/png'); }
    catch (error) { reject(error); }
  });
}

function cleanFilename(value) { return String(value || '通用卡牌').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60); }

async function exportWith(action) {
  if (exportRunning) return;
  exportRunning = true;
  const buttons = ['download-card','download-template','download-svg','download-all'].map(byId);
  buttons.forEach(button => { button.disabled = true; });
  byId('render-status').textContent = '正在导出…';
  try { await action(); showError(); byId('render-status').textContent = '已开始下载'; }
  catch (error) { showError(`导出失败：${error.message || String(error)}`); byId('render-status').textContent = '导出未完成'; }
  finally { exportRunning = false; buttons.forEach(button => { button.disabled = false; }); }
}

byId('download-card').addEventListener('click', () => exportWith(async () => {
  const palette = selectedPalette;
  const canvas = document.createElement('canvas'); canvas.width = kardsAzur.WIDTH; canvas.height = kardsAzur.HEIGHT;
  await kardsAzur.render(canvas, stateFor(palette, false));
  saveBlob(await pngBlob(canvas), `${cleanFilename(byId('card-name').value)}_${paletteLabel(palette)}.png`);
}));

byId('download-template').addEventListener('click', () => exportWith(async () => {
  const palette = selectedPalette;
  const svg = await kardsAzur.templateSvg(palette, 'combined');
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await decodedImage(url);
    const canvas = document.createElement('canvas'); canvas.width = kardsAzur.WIDTH; canvas.height = kardsAzur.HEIGHT;
    canvas.getContext('2d').drawImage(image, 0, 0, kardsAzur.WIDTH, kardsAzur.HEIGHT);
    saveBlob(await pngBlob(canvas), `碧蓝航线_${paletteLabel(palette)}_透明模板.png`);
  } finally { URL.revokeObjectURL(url); }
}));

byId('download-svg').addEventListener('click', () => exportWith(async () => {
  const palette = selectedPalette;
  const svg = await kardsAzur.templateSvg(palette, 'combined');
  saveBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `碧蓝航线_${paletteLabel(palette)}_模板.svg`);
}));

byId('download-all').addEventListener('click', () => exportWith(async () => {
  await downloadTemplateArchive(kardsAzur);
}));

buildPreviews();
schedulePreview();
