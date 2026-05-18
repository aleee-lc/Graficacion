import type { ProjectArtifactFile } from './project-workspace.models';

export const removeAccents = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export const slugify = (value: string) => {
  const slug = removeAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'archivo';
};

export const cleanProjectFilePart = (value: string) =>
  removeAccents(String(value || 'archivo'))
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .join('/')
    .replace(/[<>:"|?*]/g, '-')
    .trim() || 'archivo';

export const kindForFileName = (fileName: string) => {
  const lower = fileName.toLowerCase();
  if (/\.(png|jpe?g|webp|svg)$/.test(lower)) return 'Imagen';
  if (lower.endsWith('.json')) return 'JSON';
  if (lower.endsWith('.md')) return 'Markdown';
  if (lower.endsWith('.mmd')) return 'Mermaid';
  if (lower.endsWith('.txt')) return 'Texto';
  return 'Archivo';
};

// I keep imports as project files so the UI can treat generated and uploaded artifacts the same way.
export const projectFileFromPath = (
  path: string,
  content: string,
  source: ProjectArtifactFile['source']
): ProjectArtifactFile => {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const name = parts.pop() ?? `archivo-${Date.now()}.txt`;
  return {
    id: `${source}-${Date.now()}-${slugify(path)}`,
    folder: cleanProjectFilePart(parts.join('/') || '04-importados'),
    name: cleanProjectFilePart(name),
    kind: kindForFileName(name),
    content,
    encoding: 'text',
    source,
    updatedAt: new Date().toISOString()
  };
};

export const tryReadBundleFiles = (content: string): Array<{ path: string; content: string }> => {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.files)) {
      return [];
    }
    return parsed.files
      .filter((file: { path?: unknown; content?: unknown }) => typeof file.path === 'string')
      .map((file: { path: string; content?: unknown }) => ({
        path: file.path,
        content: typeof file.content === 'string' ? file.content : JSON.stringify(file.content ?? '', null, 2)
      }));
  } catch {
    return [];
  }
};

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let index = 0; index < 8; index++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

export const dataUrlToBytes = (dataUrl: string) => {
  const [metadata, payload = ''] = dataUrl.split(',');
  const isBase64 = metadata.includes(';base64');
  if (!isBase64) {
    return new TextEncoder().encode(decodeURIComponent(payload));
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const createZipBlob = (files: Array<{ path: string; content: string | Uint8Array }>) => {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path.replace(/\\/g, '/'));
    const data = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const blobParts = [...localParts, ...centralParts, end].map((part) =>
    part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as BlobPart
  );
  return new Blob(blobParts, { type: 'application/zip' });
};

export const readZipEntries = (buffer: ArrayBuffer): Array<{ path: string; content: string }> => {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const entries: Array<{ path: string; content: string }> = [];
  let index = 0;
  while (index < bytes.length - 4) {
    if (view.getUint32(index, true) !== 0x04034b50) {
      index++;
      continue;
    }
    const method = view.getUint16(index + 8, true);
    const compressedSize = view.getUint32(index + 18, true);
    const fileNameLength = view.getUint16(index + 26, true);
    const extraLength = view.getUint16(index + 28, true);
    const nameStart = index + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const path = decoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));
    if (method === 0 && path && !path.endsWith('/')) {
      entries.push({ path, content: decoder.decode(bytes.slice(dataStart, dataEnd)) });
    }
    index = Math.max(dataEnd, index + 30);
  }
  if (entries.length === 0) {
    throw new Error('Unsupported zip');
  }
  return entries.filter((entry) => entry.path !== 'manifest.json');
};
