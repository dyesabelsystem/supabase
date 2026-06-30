import { Chapter, Pillar, User } from '../types';

export const HOME_PATH = '/home';
export const LOGIN_PATH = '/login';
export const RESET_PASSWORD_PATH = '/reset-password';
export const DONATE_PATH = '/donate';

const DASHBOARD_BASE_PATH = '/dashboard';
const CHAPTERS_BASE_PATH = '/chapters';
const PILLARS_BASE_PATH = '/pillars';

export type ParsedAppRoute =
  | { type: 'root' }
  | { type: 'home' }
  | { type: 'login' }
  | { type: 'reset-password' }
  | { type: 'donate' }
  | { type: 'dashboard'; roleSlug: string; usernameSlug: string }
  | { type: 'chapter'; chapterId: string; chapterSlug: string }
  | { type: 'pillar'; pillarId: string; pillarSlug: string }
  | { type: 'unknown' };

export const slugifyRouteSegment = (value: string): string => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || 'user';
};

export const canUserAccessDashboard = (user: User | null | undefined): boolean => {
  if (!user) return false;
  return user.role === 'admin' || (user.role === 'editor' && !user.chapterId) || !!user.chapterId;
};

export const buildDashboardPath = (user: Pick<User, 'role' | 'username'>): string => {
  return `${DASHBOARD_BASE_PATH}/${slugifyRouteSegment(user.role)}/${slugifyRouteSegment(user.username)}`;
};

export const buildChapterPath = (chapter: Pick<Chapter, 'id' | 'name'>): string => {
  return `${CHAPTERS_BASE_PATH}/${encodeURIComponent(chapter.id)}--${slugifyRouteSegment(chapter.name)}`;
};

export const buildPillarPath = (pillar: Pick<Pillar, 'id' | 'title'>): string => {
  return `${PILLARS_BASE_PATH}/${encodeURIComponent(pillar.id)}--${slugifyRouteSegment(pillar.title)}`;
};

export const getDefaultAuthenticatedPath = (user: User): string => {
  return canUserAccessDashboard(user) ? buildDashboardPath(user) : HOME_PATH;
};

export const parseAppPath = (pathname: string): ParsedAppRoute => {
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');

  if (normalizedPath === '/') return { type: 'root' };
  if (normalizedPath === HOME_PATH) return { type: 'home' };
  if (normalizedPath === LOGIN_PATH) return { type: 'login' };
  if (normalizedPath === RESET_PASSWORD_PATH) return { type: 'reset-password' };
  if (normalizedPath === DONATE_PATH) return { type: 'donate' };

  const dashboardMatch = normalizedPath.match(/^\/dashboard\/([^/]+)\/([^/]+)$/);
  if (dashboardMatch) {
    return {
      type: 'dashboard',
      roleSlug: dashboardMatch[1],
      usernameSlug: dashboardMatch[2]
    };
  }

  const chapterMatch = normalizedPath.match(/^\/chapters\/([^/]+)$/);
  if (chapterMatch) {
    const decodedChapterSegment = decodeURIComponent(chapterMatch[1]);
    const chapterSplitIndex = decodedChapterSegment.indexOf('--');
    return {
      type: 'chapter',
      chapterId: chapterSplitIndex === -1 ? decodedChapterSegment : decodedChapterSegment.slice(0, chapterSplitIndex),
      chapterSlug: chapterSplitIndex === -1 ? '' : decodedChapterSegment.slice(chapterSplitIndex + 2)
    };
  }

  const pillarMatch = normalizedPath.match(/^\/pillars\/([^/]+)$/);
  if (pillarMatch) {
    const decodedPillarSegment = decodeURIComponent(pillarMatch[1]);
    const pillarSplitIndex = decodedPillarSegment.indexOf('--');
    return {
      type: 'pillar',
      pillarId: pillarSplitIndex === -1 ? decodedPillarSegment : decodedPillarSegment.slice(0, pillarSplitIndex),
      pillarSlug: pillarSplitIndex === -1 ? '' : decodedPillarSegment.slice(pillarSplitIndex + 2)
    };
  }

  return { type: 'unknown' };
};

export const isDashboardRouteForUser = (
  route: ParsedAppRoute,
  user: Pick<User, 'role' | 'username'>
): boolean => {
  if (route.type !== 'dashboard') return false;

  return (
    route.roleSlug === slugifyRouteSegment(user.role) &&
    route.usernameSlug === slugifyRouteSegment(user.username)
  );
};

export const isChapterRouteForChapter = (
  route: ParsedAppRoute,
  chapter: Pick<Chapter, 'id' | 'name'>
): boolean => {
  if (route.type !== 'chapter') return false;

  return (
    route.chapterId === String(chapter.id) &&
    route.chapterSlug === slugifyRouteSegment(chapter.name)
  );
};

export const isPillarRouteForPillar = (
  route: ParsedAppRoute,
  pillar: Pick<Pillar, 'id' | 'title'>
): boolean => {
  if (route.type !== 'pillar') return false;

  return (
    route.pillarId === String(pillar.id) &&
    route.pillarSlug === slugifyRouteSegment(pillar.title)
  );
};
