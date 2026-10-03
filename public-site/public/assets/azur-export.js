const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}

function header(size) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function zip(files) {
  const local = [], central = [];
  let offset = 0, centralSize = 0;
  for (const { name, bytes } of files) {
    const filename = encoder.encode(name);
    const checksum = crc32(bytes);
    const l = header(30), c = header(46);
    l.view.setUint32(0, 0x04034b50, true);
    l.view.setUint16(4, 20, true);
    l.view.setUint16(6, 0x800, true);
    l.view.setUint16(12, 0x5d42, true);
    l.view.setUint32(14, checksum, true);
    l.view.setUint32(18, bytes.length, true);
    l.view.setUint32(22, bytes.length, true);
    l.view.setUint16(26, filename.length, true);
    c.view.setUint32(0, 0x02014b50, true);
    c.view.setUint16(4, 20, true);
    c.view.setUint16(6, 20, true);
    c.view.setUint16(8, 0x800, true);
    c.view.setUint16(14, 0x5d42, true);
    c.view.setUint32(16, checksum, true);
    c.view.setUint32(20, bytes.length, true);
    c.view.setUint32(24, bytes.length, true);
    c.view.setUint16(28, filename.length, true);
    c.view.setUint32(42, offset, true);
    local.push(l.bytes, filename, bytes);
    central.push(c.bytes, filename);
    offset += l.bytes.length + filename.length + bytes.length;
    centralSize += c.bytes.length + filename.length;
  }
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, offset, true);
  return new Blob([...local, ...central, end.bytes], { type: 'application/zip' });
}

async function pngBytes(svg, width, height) {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  try {
    const image = await new Promise((resolve, reject) => {
      const pending = new Image();
      pending.onload = () => resolve(pending);
      pending.onerror = () => reject(new Error('模板 SVG 无法读取'));
      pending.src = url;
    });
    canvas.getContext('2d').drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('模板 PNG 导出失败');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 1;
  }
}

export async function buildTemplateArchive(renderer) {
  const files = [];
  for (const palette of renderer.palettes) {
    const layers = await renderer.layers(palette.id);
    const variants = { template: await renderer.templateSvg(palette.id), ...layers };
    for (const [role, svg] of Object.entries(variants)) {
      if (typeof svg !== 'string') throw new Error(`图层 ${role} 无法导出`);
      files.push({ name: `${palette.id}/${role}.svg`, bytes: encoder.encode(svg) });
      files.push({ name: `${palette.id}/${role}.png`, bytes: await pngBytes(svg, renderer.WIDTH, renderer.HEIGHT) });
    }
  }
  const manifest = {
    name: '碧蓝航线简约通用卡牌模板', width: renderer.WIDTH, height: renderer.HEIGHT,
    palettes: renderer.palettes, layout: renderer.layout,
    layers: ['frame', 'cost', 'name', 'description'],
    brand: 'AZUR LANE outlined lettering in frame layer',
    composition: 'artwork → frame → cost/name/description → editable text',
    source: ['阿尔萨斯、弗兰德尔角色档案卡的细折线和半透明横带', '卡厄思梦境费用下划线与局部遮罩'],
  };
  files.push({ name: 'manifest.json', bytes: encoder.encode(JSON.stringify(manifest, null, 2)) });
  files.push({ name: 'README.txt', bytes: encoder.encode([
    '碧蓝航线简约通用卡牌模板',
    `尺寸：${renderer.WIDTH} × ${renderer.HEIGHT}，透明 RGBA PNG 与可编辑 SVG。`,
    '四配色：蓝灰 blue-gray / 白金 white-gold / 紫 purple / 银白 silver-white。',
    '每套包含 template（完整叠加模板）及 frame/cost/name/description 四个独立图层。',
    '所有图层均为同一画布尺寸，可直接对齐叠加；先放立绘，再放模板，最后放费用/名称/描述文字。',
    '空模板保留顶部 AZUR LANE 字样，不含人物、示例卡名、描述或固定费用数字。字样以矢量路径保存，位于 frame 图层的 azur-lane-brand 分组。',
    '项目网页制卡入口：web-trial/azur-lane.html（用项目本地 HTTP 服务打开）。',
    '名称框已移除装饰纹理横条，保留简洁的半透明面板。',
    '来源：角色档案卡作几何和配色参考；CZN 的 cost-line.png、dark-mask.png 作为纹理来源，沿用此前下载的来源说明。',
  ].join('\n')) });
  return { blob: zip(files), names: files.map(file => file.name) };
}

export async function downloadTemplateArchive(renderer) {
  const { blob } = await buildTemplateArchive(renderer);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'azur-lane-card-templates.zip';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
