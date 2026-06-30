import fs from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from 'vite';

const viteEnv = loadEnv(process.env.NODE_ENV || 'production', process.cwd(), '');
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://www.dyesabelph.org';
const SUPABASE_URL = viteEnv.VITE_SUPABASE_URL || viteEnv.SUPABASE_URL || 'https://rtmpjojqzfrggmmlseam.supabase.co';
const SUPABASE_KEY = viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY || viteEnv.SUPABASE_PUBLISHABLE_KEY || '';
const OUTPUT_PATH = path.resolve(process.cwd(), 'public', 'sitemap.xml');
const FALLBACK_DATA_PATH = process.env.SITEMAP_FALLBACK_PATH || path.resolve(process.cwd(), 'scripts', 'sitemap-fallback.json');

const slugifyRouteSegment = (value = '') => {
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'item';
};

const escapeXml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const normalizeOrigin = (origin) => String(origin || '').replace(/\/+$/, '');

const readFallbackData = async () => {
  try {
    const raw = await fs.readFile(FALLBACK_DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      chapters: Array.isArray(parsed?.chapters) ? parsed.chapters : [],
      pillars: Array.isArray(parsed?.pillars) ? parsed.pillars : []
    };
  } catch (error) {
    return { chapters: [], pillars: [] };
  }
};

const callSupabase = async (resource) => {
  if (!SUPABASE_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${resource}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
};

const buildStaticUrls = () => [
  { loc: `${normalizeOrigin(SITE_ORIGIN)}/home`, changefreq: 'weekly', priority: '1.0' },
  { loc: `${normalizeOrigin(SITE_ORIGIN)}/donate`, changefreq: 'weekly', priority: '0.9' }
];

const buildChapterUrls = (chapters) => {
  return (Array.isArray(chapters) ? chapters : [])
    .filter((chapter) => chapter && chapter.id != null)
    .map((chapter) => {
      const chapterId = encodeURIComponent(String(chapter.id));
      const chapterSlug = slugifyRouteSegment(chapter.name || chapter.title || String(chapter.id));
      return {
        loc: `${normalizeOrigin(SITE_ORIGIN)}/chapters/${chapterId}--${chapterSlug}`,
        changefreq: 'weekly',
        priority: '0.8'
      };
    });
};

const buildPillarUrls = (pillars) => {
  return (Array.isArray(pillars) ? pillars : [])
    .filter((pillar) => pillar && pillar.id != null)
    .map((pillar) => {
      const pillarId = encodeURIComponent(String(pillar.id));
      const pillarSlug = slugifyRouteSegment(pillar.title || String(pillar.id));
      return {
        loc: `${normalizeOrigin(SITE_ORIGIN)}/pillars/${pillarId}--${pillarSlug}`,
        changefreq: 'weekly',
        priority: '0.8'
      };
    });
};

const buildSitemapXml = (entries) => {
  const uniqueByLoc = new Map();
  entries.forEach((entry) => {
    if (!entry || !entry.loc) return;
    uniqueByLoc.set(entry.loc, entry);
  });

  const urlNodes = [...uniqueByLoc.values()]
    .map((entry) => {
      const lastmod = new Date().toISOString();
      return [
        '  <url>',
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${entry.changefreq || 'weekly'}</changefreq>`,
        `    <priority>${entry.priority || '0.7'}</priority>`,
        '  </url>'
      ].join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlNodes}\n</urlset>\n`;
};

const generate = async () => {
  const staticEntries = buildStaticUrls();
  const [chaptersResult, pillarsResult, fallbackData] = await Promise.all([
    callSupabase('chapters?select=data&order=sort_order.asc'),
    callSupabase('site_content?content_key=eq.pillars&select=data'),
    readFallbackData()
  ]);

  const apiChapters = Array.isArray(chaptersResult) ? chaptersResult.map((row) => row.data) : [];
  const apiPillars = Array.isArray(pillarsResult?.[0]?.data) ? pillarsResult[0].data : [];
  const chapters = apiChapters.length ? apiChapters : (fallbackData.chapters || []);
  const pillars = apiPillars.length ? apiPillars : (fallbackData.pillars || []);

  const chapterEntries = buildChapterUrls(chapters);
  const pillarEntries = buildPillarUrls(pillars);
  const allEntries = [...staticEntries, ...chapterEntries, ...pillarEntries];

  const xml = buildSitemapXml(allEntries);
  await fs.writeFile(OUTPUT_PATH, xml, 'utf8');

  const hasApiData = Array.isArray(chaptersResult) || Array.isArray(pillarsResult?.[0]?.data);
  const hasFallbackData = fallbackData.chapters.length > 0 || fallbackData.pillars.length > 0;
  const sourceLabel = hasApiData && hasFallbackData
    ? 'api+fallback'
    : hasApiData
      ? 'api'
      : hasFallbackData
        ? 'fallback'
        : 'static-only';
  console.log(`[sitemap] Generated ${allEntries.length} URLs (${sourceLabel}).`);
};

generate().catch((error) => {
  console.error('[sitemap] Generation failed:', error);
  process.exitCode = 1;
});
