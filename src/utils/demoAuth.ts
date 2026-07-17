import { User, UserRole } from '../types';

export const LOCAL_DEMO_PASSWORD = 'demo-only';
export const LOCAL_DEMO_SESSION_PREFIX = 'local-demo-session:';

const DEMO_USERS_STORAGE_KEY = 'dyesabel:local-demo-users';
const DEMO_CHAPTER_ID = 'tagum_city_chapter_2026-6aki--tagum';

export const LOCAL_DEMO_USERS: User[] = [
  { id: 'demo-admin', username: 'Demo Admin', email: 'demo.admin@local.test', role: 'admin' },
  { id: 'demo-editor', username: 'Demo Global Editor', email: 'demo.editor@local.test', role: 'editor' },
  { id: 'demo-pillar-editor', username: 'Demo Pillar Editor', email: 'demo.pillar@local.test', role: 'pillar_editor', pillarId: '1' },
  { id: 'demo-chapter-head', username: 'Demo Chapter Head', email: 'demo.chapter@local.test', role: 'chapter_head', chapterId: DEMO_CHAPTER_ID },
  { id: 'demo-member', username: 'Demo Member', email: 'demo.member@local.test', role: 'member', chapterId: DEMO_CHAPTER_ID }
];

const isLoopbackHost = () => {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
};

export const isLocalDemoAvailable = () => import.meta.env.DEV && isLoopbackHost();

export const isLocalDemoSession = (token?: string | null) => (
  isLocalDemoAvailable() && String(token || '').startsWith(LOCAL_DEMO_SESSION_PREFIX)
);

export const getLocalDemoUsers = (): User[] => {
  if (!isLocalDemoAvailable()) return [];
  try {
    const stored = window.sessionStorage.getItem(DEMO_USERS_STORAGE_KEY);
    if (stored) return JSON.parse(stored) as User[];
  } catch {
    // Fall back to clean fixtures if local demo data was manually corrupted.
  }
  return LOCAL_DEMO_USERS.map((user) => ({ ...user }));
};

const saveLocalDemoUsers = (users: User[]) => {
  window.sessionStorage.setItem(DEMO_USERS_STORAGE_KEY, JSON.stringify(users));
};

export const authenticateLocalDemo = (email: string, password: string) => {
  if (!isLocalDemoAvailable() || password !== LOCAL_DEMO_PASSWORD) return null;
  const user = getLocalDemoUsers().find((candidate) => candidate.email === email.trim().toLowerCase());
  return user ? { sessionToken: `${LOCAL_DEMO_SESSION_PREFIX}${user.id}`, user } : null;
};

export const validateLocalDemoSession = (token: string) => {
  if (!isLocalDemoSession(token)) return null;
  const id = token.slice(LOCAL_DEMO_SESSION_PREFIX.length);
  return getLocalDemoUsers().find((user) => user.id === id) || null;
};

export const updateLocalDemoUser = (nextUser: User) => {
  const users = getLocalDemoUsers();
  const index = users.findIndex((user) => user.id === nextUser.id);
  if (index < 0) return null;
  users[index] = { ...nextUser };
  saveLocalDemoUsers(users);
  return users[index];
};

export const createLocalDemoUser = (input: {
  username: string;
  email: string;
  role: UserRole;
  chapterId?: string;
  pillarId?: string;
}) => {
  const users = getLocalDemoUsers();
  const user: User = {
    id: `demo-${crypto.randomUUID()}`,
    username: input.username,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    chapterId: input.chapterId || undefined,
    pillarId: input.pillarId || undefined
  };
  users.push(user);
  saveLocalDemoUsers(users);
  return user;
};

export const deleteLocalDemoUser = (userId: string) => {
  const users = getLocalDemoUsers();
  const nextUsers = users.filter((user) => user.id !== userId);
  if (nextUsers.length === users.length) return false;
  saveLocalDemoUsers(nextUsers);
  return true;
};

export const resetLocalDemoUsers = () => {
  if (isLocalDemoAvailable()) window.sessionStorage.removeItem(DEMO_USERS_STORAGE_KEY);
};
