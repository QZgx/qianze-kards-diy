const WIDTH = 1000;
const HEIGHT = 1404;
const SOURCE_BASE = new URL('./azur/source/', import.meta.url);
const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';
const TITLE_FONT = '"AzurTitleLatin", "AzurTitleChinese", sans-serif';
const SKILL_FONT = '"AzurSkillLatin", "AzurSkillChinese", sans-serif';
const COST_FONT = '"AzurCostStencil", sans-serif';
const TITLE_ZH = '"AzurTitleChinese", sans-serif';
const TITLE_EN = '"AzurTitleLatin", sans-serif';
const SKILL_ZH = '"AzurSkillChinese", sans-serif';
const SKILL_EN = '"AzurSkillLatin", sans-serif';
// Keep the original Common maker's automatic Bold terms and exclusion.
const BOLD_TERMS = ['部署：','部署','亡计：','亡计','揭示：','压制','奋战','收缴','烟幕','闪击','守护','山地','流亡','隐蔽','伏击','老兵','冲击','撤退','抑制','动员','战斗','或','被收缴','免疫','开发','抉择：','抉择','重甲','情报','钳击：','钳击','转换','抽取：','溃军','生产'];
function glyphFont(character, role = 'skills', emphasized = false) {
  if (/\s|["'“”‘’]/u.test(character)) return SKILL_EN;
  if (role === 'name' || role === 'keywords') return /[\x21-\x7e]/.test(character) ? TITLE_EN : TITLE_ZH;
  if (emphasized) return /\d/.test(character) ? TITLE_EN : TITLE_ZH;
  return /[\x21-\x7e。，、；：？！“”‘’（）【】《》…～·]/.test(character) ? SKILL_EN : SKILL_ZH;
}
function textGlyphs(value, role, manualBold = false) {
  const text = plainText(value), result = [];
  let emphasized = false;
  for (let index = 0; index < text.length;) {
    if (role === 'skills' && manualBold && text[index] === '#') { emphasized = !emphasized; index++; continue; }
    const term = role === 'skills' && !manualBold && !text.startsWith('战斗机', index) ? BOLD_TERMS.find(term => text.startsWith(term, index)) : null;
    const segment = term || String.fromCodePoint(text.codePointAt(index));
    for (const character of segment) result.push({text: character, family: glyphFont(character, role, !!term || emphasized), weight: 400});
    index += segment.length;
  }
  return result;
}
let fontPromise;
async function loadFonts() {
  if (!fontPromise) fontPromise = Promise.all([
    ['AzurTitleChinese', './azur/fonts/FZZongYi-GBK.ttf'],
    ['AzurSkillChinese', './azur/fonts/FZRuiZHJW.ttf'],
    ['AzurTitleLatin', './CardMake/fonts/FRADMCN.ttf'],
    ['AzurSkillLatin', './CardMake/fonts/FRAMDCN.ttf'],
    ['AzurCostStencil', './azur/fonts/RedOctoberStencil.ttf'],
  ].map(async ([family, file, unicodeRange]) => {
    const face = new FontFace(family, `url("${new URL(file, import.meta.url).href}")`, { weight: '400 700', ...(unicodeRange ? {unicodeRange} : {}) });
    await face.load(); document.fonts.add(face); return family;
  })).catch(error => { fontPromise = undefined; throw new Error('碧蓝航线字体无法载入：' + error.message); });
  return fontPromise;
}
const FACTION_BASE = new URL('./azur/factions/', import.meta.url);
const factions = Object.freeze([
  ['eagle-union', '白鹰', 'webp'], ['royal-navy', '皇家', 'jpg'], ['sakura-empire', '重樱', 'jpg'],
  ['iron-blood', '铁血', 'jpg'], ['dragon-empery', '东煌', 'jpg'], ['northern-parliament', '北方联合', 'jpg'],
  ['iris-libre', '自由鸢尾', 'jpg'], ['vichya-dominion', '维希教廷', 'webp'], ['sardegna-empire', '撒丁帝国', 'webp'],
  ['universal', '其他／通用', 'webp'], ['neptunia', '超次元游戏海王星', 'webp'],
].map(([id, label, extension]) => Object.freeze({ id, label, icon: new URL(id + '.' + extension, FACTION_BASE).href })));
const rarityPalettes = Object.freeze({ 精英: 'white-gold', 特殊: 'purple', 限定: 'blue-gray', 普通: 'silver-white' });
function rarityToPalette(rarity) { return rarityPalettes[rarity] || 'white-gold'; }

const palettes = Object.freeze([
  { id: 'blue-gray', label: '蓝灰', primary: '#519EE0', accent: '#B6DEFF', dark: '#203A51', text: '#F5F7FA', top: '#478AC5' },
  { id: 'white-gold', label: '白金', primary: '#D6A12E', accent: '#F4D47A', dark: '#543E24', text: '#FFF7E3', top: '#A16E22' },
  { id: 'purple', label: '紫', primary: '#B67EE2', accent: '#E2C6FF', dark: '#3C294E', text: '#FAF7FF', top: '#9D61CF' },
  { id: 'silver-white', label: '银白', primary: '#E2EAF2', accent: '#FFFFFF', dark: '#3A4653', text: '#F7FAFC', top: '#C6D2DF' },
].map(Object.freeze));

const layout = Object.freeze({
  frame: Object.freeze({ x: 24, y: 24, width: 952, height: 1356 }),
  brand: Object.freeze({ x: 64, y: 32, width: 248, height: 29 }),
  cost: Object.freeze({ x: 48, y: 62, width: 136, height: 156, cx: 116, cy: 140 }),
  oil: Object.freeze({ x: 151, y: 76, width: 20, height: 25 }),
  name: Object.freeze({ x: 180, y: 68, width: 750, height: 124 }),
  nameText: Object.freeze({ x: 206, y: 82, width: 696, height: 65 }),
  subtitleText: Object.freeze({ x: 206, y: 154, width: 696, height: 26 }),
  description: Object.freeze({ x: 60, y: 1050, width: 880, height: 270 }),
  descriptionText: Object.freeze({ x: 96, y: 1084, width: 808, height: 206 }),
  art: Object.freeze({ x: 24, y: 24, width: 952, height: 1356 }),
});

let texturePromise;
const svgCache = new Map();
const imageCache = new Map();
const renderVersions = new WeakMap();
const factionCache = new Map();

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function paletteFor(value) {
  const id = typeof value === 'object' && value ? value.id : value;
  return palettes.find(palette => palette.id === id) || palettes[0];
}

async function dataUrl(file) {
  const response = await fetch(new URL(file, SOURCE_BASE));
  if (!response.ok) throw new Error(`碧蓝模板素材无法读取：${file}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`碧蓝模板素材无法解析：${file}`));
    reader.readAsDataURL(blob);
  });
}

async function textures() {
  if (!texturePromise) {
    texturePromise = Promise.all(['cost-line.png', 'dark-mask.png'].map(dataUrl))
      .then(([costLine, darkMask]) => ({ costLine, darkMask }))
      .catch(error => { texturePromise = undefined; throw error; });
  }
  return texturePromise;
}

function svgDocument(palette, texture, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="lower-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${palette.dark}" stop-opacity="0"/><stop offset=".35" stop-color="${palette.dark}" stop-opacity=".2"/><stop offset="1" stop-color="${palette.dark}" stop-opacity=".68"/></linearGradient>
    <linearGradient id="panel-glass" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${palette.dark}" stop-opacity=".72"/><stop offset="1" stop-color="${palette.dark}" stop-opacity=".62"/></linearGradient>
    <linearGradient id="description-glass" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${palette.dark}" stop-opacity=".46"/><stop offset="1" stop-color="${palette.dark}" stop-opacity=".68"/></linearGradient>
    <filter id="texture-tint" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feFlood flood-color="${palette.accent}"/><feComposite in2="SourceAlpha" operator="in"/></filter>
    <clipPath id="card-clip"><path d="M50 24H948L976 52V1336L932 1380H66L24 1338V50Z"/></clipPath>
    <clipPath id="lower-only"><rect x="26" y="938" width="948" height="440"/></clipPath>
  </defs>
  ${content}
</svg>`;
}

// Outlined lettering keeps the brand consistent in SVG and PNG exports.
function brandMark(palette) {
  const glyphs = {
    A: 'M0 72L26 0H45L71 72H54L49 57H21L16 72ZM26 43H44L35 17Z',
    Z: 'M0 0H62V13L21 57H62V72H0V59L42 15H0Z',
    U: 'M0 0H17V48Q17 59 31 59T45 48V0H62V50Q62 73 31 73T0 50Z',
    R: 'M0 0H35Q63 0 63 24Q63 41 46 47L66 72H46L29 49H17V72H0ZM17 14V35H34Q46 35 46 24T34 14Z',
    L: 'M0 0H17V57H59V72H0Z',
    N: 'M0 0H16L47 45V0H64V72H48L17 27V72H0Z',
    E: 'M0 0H61V15H17V28H55V43H17V57H61V72H0Z',
  };
  const letters = [['A',0],['Z',81],['U',153],['R',225],['L',333],['A',402],['N',483],['E',557]];
  return `<g id="azur-lane-brand" aria-label="AZUR LANE" transform="translate(64 32) scale(.4) skewX(-10)" fill="${palette.primary}" fill-opacity=".94" fill-rule="evenodd" stroke="none"><title>AZUR LANE</title>${letters.map(([letter,x]) => `<path transform="translate(${x} 0)" d="${glyphs[letter]}"/>`).join('')}</g>`;
}

function layerContent(palette, texture) {
  const frame = `<g id="frame" fill="none" stroke-linejoin="miter" clip-path="url(#card-clip)">
    <path d="M50 26H947L974 53V1335L931 1378H67L26 1337V50Z" stroke="${palette.accent}" stroke-width="5.2" stroke-opacity=".96"/>
    <path d="M52 39H60M330 39H732L762 64H960V1331L924 1364H81L41 1324V55L52 39" stroke="${palette.primary}" stroke-width="3.2" stroke-opacity=".96"/>
    <path d="M44 44H60M330 44H730L760 69H958" stroke="${palette.top}" stroke-width="8" stroke-opacity=".93"/>
    ${brandMark(palette)}
    <path d="M784 39H946L958 51H797Z" fill="${palette.primary}" fill-opacity=".47" stroke="none"/>
    <path d="M43 1295L108 1360H676M44 1313L94 1363M758 1363H924L958 1329" stroke="${palette.accent}" stroke-width="2.2" stroke-opacity=".85"/>
    <path d="M29 303V492M970 374V528" stroke="${palette.primary}" stroke-width="5" stroke-opacity=".7"/>
    <path d="M41 344V462M957 405V497" stroke="${palette.accent}" stroke-width="1.5" stroke-opacity=".55"/>
    <path d="M946 227h8m-4-4v8M946 249h8m-4-4v8M946 271h8m-4-4v8" stroke="${palette.primary}" stroke-width="1.5" stroke-opacity=".66"/>
  </g>`;
  const cost = `<g id="cost">
    <path d="M61 62H170L184 76V204L170 218H48V75Z" fill="${palette.dark}" fill-opacity=".76" stroke="${palette.primary}" stroke-width="2.8" stroke-opacity=".9"/>
    <path d="M58 83V193M61 70H158" fill="none" stroke="${palette.accent}" stroke-width="2" stroke-opacity=".68"/>
    <image href="${texture.costLine}" x="77" y="179" width="78" height="32" filter="url(#texture-tint)" opacity=".85" preserveAspectRatio="none"/>
    <g id="oil-unit" aria-label="石油花费单位" transform="translate(${layout.oil.x} ${layout.oil.y}) scale(${layout.oil.width / 24} ${layout.oil.height / 32})">
      <path d="M12 1C10 6 2 13 2 21A10 10 0 0 0 22 21C22 13 14 6 12 1Z" fill="${palette.accent}" stroke="${palette.dark}" stroke-width="1.2"/>
      <path d="M8 14C6 17 5 19 5 22" fill="none" stroke="${palette.dark}" stroke-width="2.2" stroke-linecap="round"/>
    </g>
  </g>`;
  const name = `<g id="name">
    <path d="M180 68H911L930 87V177L915 192H180Z" fill="url(#panel-glass)"/>
    <path d="M180 69H910L929 88M180 191H914L929 177" fill="none" stroke="${palette.accent}" stroke-width="2" stroke-opacity=".65"/>
    <path d="M921 105V151" stroke="${palette.primary}" stroke-width="3" stroke-opacity=".65"/>
  </g>`;
  const description = `<g id="description" clip-path="url(#card-clip)">
    <rect x="26" y="904" width="948" height="474" fill="url(#lower-shade)"/>
    <image href="${texture.darkMask}" x="26" y="26" width="948" height="1352" opacity=".18" clip-path="url(#lower-only)" preserveAspectRatio="none"/>
    <path d="M76 1050H940V1303L923 1320H60V1066Z" fill="url(#description-glass)"/>
    <path d="M76 1051H939M61 1067V1319H922L939 1302" fill="none" stroke="${palette.accent}" stroke-width="1.8" stroke-opacity=".59"/>
    <path d="M74 1065H337M68 1306H258M915 1063V1127" fill="none" stroke="${palette.primary}" stroke-width="3" stroke-opacity=".58"/>
    <path d="M876 1310H921L930 1301" fill="none" stroke="${palette.primary}" stroke-width="1.5" stroke-opacity=".76"/>
  </g>`;
  return { frame, cost, name, description };
}

async function layers(paletteId) {
  const palette = paletteFor(paletteId);
  if (!svgCache.has(palette.id)) {
    const texture = await textures();
    const content = layerContent(palette, texture);
    const result = Object.fromEntries(Object.entries(content).map(([key, value]) => [key, svgDocument(palette, texture, value)]));
    result.combined = svgDocument(palette, texture, content.frame + content.description + content.name + content.cost);
    svgCache.set(palette.id, Object.freeze(result));
  }
  const { frame, cost, name, description } = svgCache.get(palette.id);
  return { frame, cost, name, description };
}

async function templateSvg(paletteId, layer = 'combined') {
  const palette = paletteFor(paletteId);
  await layers(palette.id);
  const svg = svgCache.get(palette.id)[layer];
  if (!svg) throw new Error(`未知碧蓝模板图层：${layer}`);
  return svg;
}

async function svgImage(svg, key) {
  if (!imageCache.has(key)) {
    imageCache.set(key, new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); imageCache.delete(key); reject(new Error('碧蓝模板无法渲染')); };
      image.src = url;
    }));
  }
  return imageCache.get(key);
}

async function resolveArt(value) {
  if (!value) return null;
  if (typeof value !== 'string') {
    if (value instanceof HTMLImageElement) {
      if (!value.getAttribute('src')) return null;
      if (!value.complete) await new Promise((resolve, reject) => {
        value.addEventListener('load', resolve, { once: true });
        value.addEventListener('error', () => reject(new Error('图片无法读取')), { once: true });
      });
      if (!value.naturalWidth) return null;
    }
    return value;
  }
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = value;
  if (!image.complete) await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('图片无法读取'));
  });
  return image;
}

async function factionMark(value, color) {
  const faction = factions.find(item => item.id === value || item.label === value);
  if (!faction) return null;
  const key = faction.id + color;
  if (!factionCache.has(key)) factionCache.set(key, (async () => {
    const source = await resolveArt(faction.icon);
    const mark = document.createElement('canvas');
    mark.width = mark.height = 256;
    const ctx = mark.getContext('2d', { willReadFrequently: true });
    const scale = Math.min(256 / source.naturalWidth, 256 / source.naturalHeight);
    ctx.drawImage(source, (256 - source.naturalWidth * scale) / 2, (256 - source.naturalHeight * scale) / 2, source.naturalWidth * scale, source.naturalHeight * scale);
    const pixels = ctx.getImageData(0, 0, 256, 256);
    let darkest = 255;
    for (let index = 0; index < pixels.data.length; index += 4) {
      if (pixels.data[index + 3]) darkest = Math.min(darkest, (pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2]) / 3);
    }
    const rgb = color.match(/[\da-f]{2}/gi).map(hex => parseInt(hex, 16));
    for (let index = 0; index < pixels.data.length; index += 4) {
      const light = (pixels.data[index] + pixels.data[index + 1] + pixels.data[index + 2]) / 3;
      const alpha = pixels.data[index + 3] * Math.max(0, (248 - light) / Math.max(1, 248 - darkest));
      [pixels.data[index], pixels.data[index + 1], pixels.data[index + 2], pixels.data[index + 3]] = [...rgb, Math.min(255, alpha)];
    }
    ctx.putImageData(pixels, 0, 0);
    return mark;
  })());
  return factionCache.get(key);
}

function clipCard(ctx) {
  ctx.beginPath();
  ctx.moveTo(50, 24);
  for (const [x, y] of [[948, 24], [976, 52], [976, 1336], [932, 1380], [66, 1380], [24, 1338], [24, 50]]) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.clip();
}

function setFont(ctx, size, weight, family) {
  ctx.font = `${weight} ${size}px ${family}`;
}

function plainText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

// Greedy wrapping keeps explicit line breaks and Latin words where they fit.
function wrap(ctx, value, width) {
  const lines = [];
  for (const paragraph of plainText(value).split('\n')) {
    if (!paragraph) { lines.push(''); continue; }
    const tokens = paragraph.match(/[^\S\n]+|[A-Za-z0-9À-ɏ]+(?:[-'.][A-Za-z0-9À-ɏ]+)*|./gu) || [];
    let current = '';
    for (let token of tokens) {
      if (!current && /^\s+$/.test(token)) continue;
      if (ctx.measureText(current + token).width <= width) { current += token; continue; }
      if (current) { lines.push(current.trimEnd()); current = ''; }
      if (/^\s+$/.test(token)) continue;
      if (ctx.measureText(token).width <= width) { current = token; continue; }
      for (const character of token) {
        if (current && ctx.measureText(current + character).width > width) { lines.push(current); current = ''; }
        current += character;
      }
    }
    lines.push(current.trimEnd());
  }
  return lines;
}

function fitName(ctx, value, box, requested, family, weight = 700) {
  const text = plainText(value);
  const explicit = text.split('\n');
  let size = Math.max(1, numeric(requested, 52));
  setFont(ctx, size, weight, family);
  const role = family === TITLE_FONT ? 'name' : 'skills';
  const glyphLines = explicit.map(line => textGlyphs(line, role));
  const measureLine = glyphs => glyphs.reduce((sum, glyph) => {setFont(ctx,size,400,glyph.family);return sum+ctx.measureText(glyph.text).width;},0);
  const maxWidth = Math.max(0, ...glyphLines.map(measureLine));
  if (maxWidth > box.width) size *= box.width / maxWidth;
  size = Math.min(size, box.height / Math.max(1, explicit.length * 1.12));
  setFont(ctx, size, weight, family);
  const lineHeight = size * 1.12;
  const metrics = ctx.measureText('国Mg');
  const ascent = metrics.actualBoundingBoxAscent || size * .82;
  const descent = metrics.actualBoundingBoxDescent || size * .18;
  const total = (explicit.length - 1) * lineHeight + ascent + descent;
  const y = box.y + (box.height - total) / 2 + ascent;
  ctx.textAlign = 'left';
  glyphLines.forEach((glyphs, index) => {
    let x = box.x + (box.width - measureLine(glyphs)) / 2;
    for (const glyph of glyphs) {setFont(ctx,size,400,glyph.family);ctx.fillText(glyph.text,x,y+index*lineHeight);x+=ctx.measureText(glyph.text).width;}
  });
  ctx.textAlign = 'left';
  return { text, size, lines: explicit.length, box };
}

function fitDescription(ctx, state, family) {
  const keywords = Array.isArray(state.keywords) ? state.keywords.map(plainText).filter(Boolean).join(' · ') : plainText(state.keywords);
  const sections = [];
  if (keywords.trim()) sections.push({ text: keywords, weight: 400, role: 'keywords' });
  if (plainText(state.skills).length) sections.push({ text: plainText(state.skills), weight: 400, role: 'skills' });
  const box = { ...layout.descriptionText, y: layout.descriptionText.y + numeric(state.overallY) + numeric(state.keywordY), height: state.showStats ? 152 : layout.descriptionText.height };
  let size = Math.max(1, numeric(state.fontSize, 36));
  let rows = [];
  for (let iteration = 0; iteration < 400; iteration++) {
    rows = sections.flatMap(section => {
      const output = [];
      let row = [], width = 0;
      const flush = () => { output.push({ text: row.map(run => run.text).join(''), runs: row, weight: section.weight, role: section.role }); row = []; width = 0; };
      for (const glyph of textGlyphs(section.text, section.role, !!state.bold)) {
        const character = glyph.text;
        if (character === '\n') { flush(); continue; }
        const weight = glyph.weight;
        const runFamily = glyph.family;
        setFont(ctx, size, weight, runFamily);
        const advance = ctx.measureText(character).width;
        if (width + advance > box.width && row.length) flush();
        row.push({ text: character, weight, family: runFamily, width: advance }); width += advance;
      }
      flush();
      return output;
    });
    const lineHeight = size * 1.32;
    if (rows.length * lineHeight <= box.height || size <= 1) break;
    size = Math.max(1, size * .965);
  }
  const lineHeight = size * 1.32;
  const center = state.descriptionAlign === 'center';
  const blockHeight = rows.length * lineHeight;
  const top = center ? box.y + (box.height - blockHeight) / 2 : box.y;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.width, box.height);
  ctx.clip();
  ctx.textAlign = 'left';
  rows.forEach((row, index) => {
    setFont(ctx, size, row.weight, row.role === 'keywords' ? TITLE_FONT : SKILL_FONT);
    const metrics = ctx.measureText('国Mg');
    const ascent = metrics.actualBoundingBoxAscent || size * .82;
    const descent = metrics.actualBoundingBoxDescent || size * .18;
    const baseline = top + index * lineHeight + (lineHeight - ascent - descent) / 2 + ascent;
    let x = center ? box.x + (box.width - row.runs.reduce((sum, run) => sum + run.width, 0)) / 2 : box.x;
    row.runs.forEach(run => {
      setFont(ctx, size, run.weight, run.family);
      const correction = run.family === SKILL_EN ? numeric(state.symbolY) : 0;
      ctx.fillText(run.text, x, baseline + correction); x += run.width;
    });
  });
  ctx.restore();
  return { fontSize: size, lineHeight, lines: rows, box, align: center ? 'center' : 'left' };
}

function drawStats(ctx, state, palette, family) {
  if (!state.showStats) return;
  for (const [index, label, value] of [[0, '攻击', state.attack], [1, '耐久', state.defense]]) {
    const x = 96 + index * 205;
    const y = 1255;
    ctx.fillStyle = palette.dark;
    ctx.globalAlpha = .6;
    ctx.fillRect(x, y, 184, 42);
    ctx.globalAlpha = .74;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y, 184, 42);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.text;
    ctx.textAlign = 'left';
    setFont(ctx, 23, 400, family);
    ctx.fillText(label, x + 13, y + 29);
    ctx.textAlign = 'right';
    setFont(ctx, 30, 700, family);
    const text = plainText(value);
    const width = ctx.measureText(text).width;
    if (width > 87) setFont(ctx, 30 * 87 / width, 700, family);
    ctx.fillText(text, x + 170, y + 31);
  }
  ctx.textAlign = 'left';
}

async function render(canvas, state = {}) {
  const version = (renderVersions.get(canvas) || 0) + 1;
  renderVersions.set(canvas, version);
  const palette = paletteFor(state.palette || (state.rarity && rarityToPalette(state.rarity)));
  await loadFonts();
  const [template, art, emblem] = await Promise.all([
    templateSvg(palette.id).then(svg => svgImage(svg, palette.id)),
    resolveArt(state.art || state.artImage || state.dataUrl || state.image),
    factionMark(state.faction, palette.accent),
  ]);
  if (renderVersions.get(canvas) !== version) return canvas.__azurMeta;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  if (art) {
    const sourceWidth = art.naturalWidth || art.videoWidth || art.width;
    const sourceHeight = art.naturalHeight || art.videoHeight || art.height;
    if (sourceWidth > 0 && sourceHeight > 0) {
      const scale = Math.max(layout.art.width / sourceWidth, layout.art.height / sourceHeight) * Math.max(.01, numeric(state.artScale, 1));
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      const x = (WIDTH - width) / 2 + numeric(state.artX);
      const y = (HEIGHT - height) / 2 + numeric(state.artY);
      ctx.save();
      clipCard(ctx);
      ctx.drawImage(art, x, y, width, height);
      ctx.restore();
    }
  }
  ctx.drawImage(template, 0, 0, WIDTH, HEIGHT);
  if (emblem) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(layout.description.x, layout.description.y, layout.description.width, layout.description.height);
    ctx.clip();
    ctx.globalAlpha = .3;
    ctx.drawImage(emblem, 388, 1076, 224, 224);
    ctx.restore();
  }
  if (state.customCountry) {
    const custom = await resolveArt(state.customCountry);
    if (custom) {
      const scale = 224 / Math.max(custom.naturalWidth, custom.naturalHeight) * numeric(state.countryScale, 1);
      ctx.save(); ctx.globalAlpha = .3;
      ctx.drawImage(custom, 500 - custom.naturalWidth * scale / 2 + numeric(state.countryX), 1188 - custom.naturalHeight * scale / 2 + numeric(state.countryY), custom.naturalWidth * scale, custom.naturalHeight * scale);
      ctx.restore();
    }
  }
  const family = state.fontFamily || FONT;
  ctx.fillStyle = state.nameDark ? palette.dark : palette.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // The lower row remains reserved even when the optional subtitle is empty.
  // This keeps long names separate from the optional subtitle.
  const nameBox = state.subtitle ? layout.nameText : {...layout.nameText, y: 80, height: 104};
  const name = fitName(ctx, state.name, { ...nameBox, y: nameBox.y + numeric(state.nameY) }, state.nameSize ?? 52, TITLE_FONT, 400);
  const subtitle = state.subtitle ? fitName(ctx, state.subtitle, layout.subtitleText, 26, SKILL_FONT, 400) : null;
  const costText = plainText(state.cost);
  ctx.fillStyle = palette.text;
  setFont(ctx, 86, 400, COST_FONT);
  const width = ctx.measureText(costText).width;
  if (width > 78) setFont(ctx, 86 * 78 / width, 400, COST_FONT);
  const costMetrics = ctx.measureText(costText || '0');
  const ascent = costMetrics.actualBoundingBoxAscent || 74;
  const descent = costMetrics.actualBoundingBoxDescent || 9;
  ctx.textAlign = 'center';
  ctx.fillText(costText, layout.cost.cx, layout.cost.cy + (ascent - descent) / 2 + numeric(state.costY));
  ctx.textAlign = 'left';
  const description = fitDescription(ctx, state, family);
  drawStats(ctx, state, palette, family);
  if (state.proverb) {
    ctx.save(); ctx.fillStyle = palette.text;
    setFont(ctx, numeric(state.proverbSize, 26), 400, family);
    ctx.textAlign = 'center'; ctx.fillText(plainText(state.proverb), 500 + numeric(state.proverbX), 1350 + numeric(state.proverbY), 808);
    ctx.restore();
  }
  if (state.corner) {
    const corner = await resolveArt(state.corner);
    if (corner) {
      const scale = 100 / Math.max(corner.naturalWidth, corner.naturalHeight) * numeric(state.cornerScale, 1);
      ctx.drawImage(corner, 870 + numeric(state.cornerX), 225 + numeric(state.cornerY), corner.naturalWidth * scale, corner.naturalHeight * scale);
    }
  }
  const meta = { canvas: [WIDTH, HEIGHT], palette: palette.id, name, subtitle, cost: costText, description, oil: { ...layout.oil, color: palette.accent }, fonts: { name: TITLE_FONT, keywords: TITLE_FONT, skills: SKILL_FONT, cost: COST_FONT }, showStats: !!state.showStats };
  canvas.__azurMeta = meta;
  return meta;
}

export const kardsAzur = Object.freeze({ WIDTH, HEIGHT, palettes, factions, rarityToPalette, layout, templateSvg, render, layers });
export { WIDTH, HEIGHT, palettes, factions, rarityToPalette, layout, templateSvg, render, layers, glyphFont, textGlyphs };
