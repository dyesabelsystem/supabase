const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

const slugifyFilePart = (value: string, fallback: string) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || fallback;

export const buildDescriptiveImageFileName = (file: File, placement: string): string => {
  const originalStem = file.name.replace(/\.[^.]+$/, '');
  const extension = MIME_EXTENSIONS[file.type] || slugifyFilePart(file.name.split('.').pop() || '', 'img');
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const uniqueId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);

  return [
    'dyesabel',
    slugifyFilePart(placement, 'website-image'),
    slugifyFilePart(originalStem, 'image'),
    timestamp,
    uniqueId
  ].join('-') + `.${extension}`;
};
