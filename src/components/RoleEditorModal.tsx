import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Filter,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  X
} from 'lucide-react';
import { AuthService, DataService } from '../services/DriveService';
import { Chapter, Pillar, ROLE_COLORS, ROLE_LABELS, USER_ROLES, User, UserRole } from '../types';
import { getSessionToken } from '../utils/session';
import { useAppDialog } from '../contexts/AppDialogContext';
import { CustomSelect, CustomSelectOption } from './CustomSelect';
import { SkeletonBlock } from './Skeleton';
import { isLocalDemoSession } from '../utils/demoAuth';

interface RoleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserDraft {
  role: UserRole;
  chapterId: string;
  pillarId: string;
}

type ScopeFilter = 'all' | 'general' | 'chapter' | 'pillar';

const ROLE_DETAILS: Record<UserRole, { level: number; description: string }> = {
  admin: { level: 5, description: 'Full platform administration' },
  editor: { level: 4, description: 'Global or chapter content editor' },
  pillar_editor: { level: 3, description: 'Editor for one assigned pillar' },
  chapter_head: { level: 2, description: 'Leader of one assigned chapter' },
  member: { level: 1, description: 'Member of one assigned chapter' }
};

const roleOptions: CustomSelectOption[] = USER_ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
  description: `Level ${ROLE_DETAILS[role].level} · ${ROLE_DETAILS[role].description}`,
  previewClassName: ROLE_COLORS[role]
}));

const roleFilterOptions: CustomSelectOption[] = [
  { value: 'all', label: 'All roles', description: 'Show every role' },
  ...roleOptions
];

const scopeFilterOptions: CustomSelectOption[] = [
  { value: 'all', label: 'All assignments' },
  { value: 'general', label: 'General roles', description: 'Not bound to a chapter or pillar' },
  { value: 'chapter', label: 'Chapter-bound', description: 'Assigned to a local chapter' },
  { value: 'pillar', label: 'Pillar-bound', description: 'Assigned to a core pillar' }
];

const draftFor = (user: User): UserDraft => ({
  role: user.role,
  chapterId: user.chapterId || '',
  pillarId: user.pillarId || ''
});

const scopeFor = (user: Pick<User, 'chapterId' | 'pillarId'>): Exclude<ScopeFilter, 'all'> => {
  if (user.pillarId) return 'pillar';
  if (user.chapterId) return 'chapter';
  return 'general';
};

const assignmentLabel = (user: User, chapters: Chapter[], pillars: Pillar[]) => {
  if (user.pillarId) {
    return pillars.find((pillar) => String(pillar.id) === String(user.pillarId))?.title || user.pillarId;
  }
  if (user.chapterId) {
    return chapters.find((chapter) => String(chapter.id) === String(user.chapterId))?.name || user.chapterId;
  }
  return 'General · No assignment';
};

export const RoleEditorModal: React.FC<RoleEditorModalProps> = ({ isOpen, onClose }) => {
  const { showAlert } = useAppDialog();
  const [users, setUsers] = useState<User[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [drafts, setDrafts] = useState<Record<string, UserDraft>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');

  const loadData = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      setLoadError('Your session has expired. Please sign in again.');
      setLoading(false);
      return;
    }

    if (isLocalDemoSession(sessionToken)) {
      setUsers([]);
      setDrafts({});
      setLoadError('Real user accounts are protected by Supabase. Sign out of the local UI demo and sign in with a real Admin account to view and edit them.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    const [usersResult, chaptersResult, pillarsResult] = await Promise.all([
      AuthService.listUsers(sessionToken),
      DataService.listChapters(),
      DataService.loadPillars()
    ]);

    if (!usersResult.success || !usersResult.users) {
      setLoadError(usersResult.error || 'Unable to load users.');
      setLoading(false);
      return;
    }

    setUsers(usersResult.users);
    setDrafts(Object.fromEntries(usersResult.users.map((user: User) => [user.id, draftFor(user)])));
    if (chaptersResult.success && chaptersResult.chapters) setChapters(chaptersResult.chapters);
    if (pillarsResult.success && pillarsResult.pillars) setPillars(pillarsResult.pillars);
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    void loadData();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery = !normalizedQuery || [
        user.username,
        user.email,
        ROLE_LABELS[user.role],
        assignmentLabel(user, chapters, pillars)
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesScope = scopeFilter === 'all' || scopeFor(user) === scopeFilter;
      return matchesQuery && matchesRole && matchesScope;
    });
  }, [chapters, pillars, query, roleFilter, scopeFilter, users]);

  const setRole = (userId: string, role: UserRole) => {
    setDrafts((current) => {
      const previous = current[userId];
      return {
        ...current,
        [userId]: {
          role,
          chapterId: role === 'editor' || role === 'chapter_head' || role === 'member'
            ? previous?.chapterId || ''
            : '',
          pillarId: role === 'pillar_editor' ? previous?.pillarId || '' : ''
        }
      };
    });
  };

  const dirtyUsers = users.filter((user) => {
    const draft = drafts[user.id] || draftFor(user);
    const original = draftFor(user);
    return draft.role !== original.role
      || draft.chapterId !== original.chapterId
      || draft.pillarId !== original.pillarId;
  });

  const saveAll = async () => {
    for (const user of dirtyUsers) {
      const draft = drafts[user.id] || draftFor(user);
      if ((draft.role === 'chapter_head' || draft.role === 'member') && !draft.chapterId) {
        await showAlert(`Choose a chapter for ${user.username} before saving.`);
        return;
      }
      if (draft.role === 'pillar_editor' && !draft.pillarId) {
        await showAlert(`Choose a pillar for ${user.username} before saving.`);
        return;
      }
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      await showAlert('Session expired. Please sign in again.');
      return;
    }

    setSaving(true);
    const results = await Promise.all(dirtyUsers.map(async (user) => {
      const draft = drafts[user.id] || draftFor(user);
      const result = await AuthService.updateUser(sessionToken, {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: draft.role,
        chapterId: draft.chapterId || undefined,
        pillarId: draft.pillarId || undefined
      });
      return { user, result };
    }));
    setSaving(false);

    const successfulUsers = results
      .filter(({ result }) => result.success && result.user)
      .map(({ result }) => result.user as User);
    const successfulById = new Map(successfulUsers.map((user) => [user.id, user]));
    setUsers((current) => current.map((user) => successfulById.get(user.id) || user));
    setDrafts((current) => ({
      ...current,
      ...Object.fromEntries(successfulUsers.map((user) => [user.id, draftFor(user)]))
    }));

    const failures = results.filter(({ result }) => !result.success || !result.user);
    if (failures.length) {
      await showAlert(
        `Saved ${successfulUsers.length} of ${results.length} changes. Could not save: ${failures.map(({ user }) => user.username).join(', ')}.`
      );
      return;
    }
    await showAlert('All role and assignment changes were saved.', { title: 'Roles Updated' });
  };

  if (!isOpen) return null;

  const chapterOptions = chapters.map((chapter) => ({
    value: String(chapter.id),
    label: chapter.name,
    description: chapter.location || String(chapter.id)
  }));
  const pillarOptions = pillars.map((pillar) => ({
    value: String(pillar.id),
    label: pillar.title,
    description: pillar.excerpt
  }));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm transition-opacity duration-300 sm:p-3 md:p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-editor-title"
        className="relative flex max-h-[98vh] w-full max-w-[98vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl sm:max-h-[95vh] sm:max-w-7xl sm:rounded-3xl"
      >
        <header className="shrink-0 border-b border-white/10 bg-white/5 p-4 sm:p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className="hidden rounded-xl bg-primary-cyan/10 p-3 text-primary-cyan sm:block">
                <ShieldCheck size={26} />
              </div>
              <div>
                <h2 id="role-editor-title" className="text-xl font-black tracking-tight text-white sm:text-2xl">Role Editor</h2>
                <p className="mt-1 max-w-2xl text-xs text-white/50 sm:text-sm">
                  Set access level and bind users to a chapter, pillar, or general platform scope.
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 rounded-full p-2 text-white/40 transition hover:bg-red-500/20 hover:text-red-400" aria-label="Close role editor">
              <X className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>
        </header>

        <div className="shrink-0 border-b border-white/10 bg-white/[0.025] p-4 sm:p-5 md:px-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(250px,1fr)_210px_210px_44px]">
            <label className="relative block">
              <span className="sr-only">Search users</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ocean-deep/40 dark:text-white/40" size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email, role, or assignment"
                className="min-h-[42px] w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-primary-cyan focus:ring-2 focus:ring-primary-cyan/20"
              />
            </label>
            <CustomSelect value={roleFilter} onChange={(value) => setRoleFilter(value as UserRole | 'all')} options={roleFilterOptions} ariaLabel="Filter by role" variant="dark" />
            <CustomSelect value={scopeFilter} onChange={(value) => setScopeFilter(value as ScopeFilter)} options={scopeFilterOptions} ariaLabel="Filter by assignment" variant="dark" />
            <button type="button" onClick={() => void loadData()} disabled={loading} title="Reload users" aria-label="Reload users" className="flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-white/10 text-white/70 transition hover:border-primary-cyan hover:text-primary-cyan disabled:opacity-50">
              <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-white/45">
            <span className="flex items-center gap-1.5"><Filter size={14} /> Showing {filteredUsers.length} of {users.length} users</span>
            <span>Hierarchy: Admin 5 · Editor 4 · Pillar Editor 3 · Chapter Head 2 · Member 1</span>
          </div>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => <SkeletonBlock key={index} className="h-28 w-full rounded-2xl" />)}
            </div>
          ) : loadError ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center">
              <AlertCircle size={36} className="mb-3 text-red-500" />
              <p className="font-bold text-white">Real users could not be loaded</p>
              <p className="mt-1 max-w-xl text-sm text-white/55">{loadError}</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center text-white/55">
              <Users size={36} className="mb-3" />
              <p className="font-bold">No users match these filters.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((user) => {
                const draft = drafts[user.id] || draftFor(user);
                const requiresChapter = draft.role === 'chapter_head' || draft.role === 'member';
                const allowsChapter = draft.role === 'editor' || requiresChapter;
                const availableChapterOptions = draft.chapterId && !chapterOptions.some((option) => option.value === draft.chapterId)
                  ? [{ value: draft.chapterId, label: draft.chapterId, description: 'Current chapter' }, ...chapterOptions]
                  : chapterOptions;
                const availablePillarOptions = draft.pillarId && !pillarOptions.some((option) => option.value === draft.pillarId)
                  ? [{ value: draft.pillarId, label: draft.pillarId, description: 'Current pillar' }, ...pillarOptions]
                  : pillarOptions;

                return (
                  <article key={user.id} className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-primary-cyan/35 sm:rounded-2xl sm:p-5">
                    <div className="grid items-center gap-4 lg:grid-cols-[minmax(210px,1.15fr)_minmax(190px,.8fr)_minmax(220px,1fr)]">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-cyan/10 text-primary-blue dark:text-primary-cyan">
                          <UserRound size={21} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-extrabold text-white">{user.username || 'Unnamed user'}</h3>
                          <p className="truncate text-xs text-white/50">{user.email}</p>
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/45">Current role · Level {ROLE_DETAILS[draft.role].level}</label>
                        <CustomSelect value={draft.role} onChange={(value) => setRole(user.id, value as UserRole)} options={roleOptions} ariaLabel={`Role for ${user.username}`} menuClassName="min-w-[250px]" variant="dark" />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-white/45">Assignment</label>
                        {draft.role === 'admin' ? (
                          <div className="flex min-h-[42px] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-medium text-white/65">
                            <ShieldCheck size={16} /> General platform access
                          </div>
                        ) : draft.role === 'pillar_editor' ? (
                          <CustomSelect value={draft.pillarId} onChange={(pillarId) => setDrafts((current) => ({ ...current, [user.id]: { ...draft, pillarId } }))} options={availablePillarOptions} placeholder="Choose a pillar" ariaLabel={`Pillar assignment for ${user.username}`} variant="dark" />
                        ) : allowsChapter ? (
                          <CustomSelect
                            value={draft.chapterId}
                            onChange={(chapterId) => setDrafts((current) => ({ ...current, [user.id]: { ...draft, chapterId } }))}
                            options={draft.role === 'editor' ? [{ value: '', label: 'General editor', description: 'All chapters and platform content' }, ...availableChapterOptions] : availableChapterOptions}
                            placeholder={requiresChapter ? 'Choose a chapter' : 'General editor'}
                            ariaLabel={`Chapter assignment for ${user.username}`}
                            variant="dark"
                          />
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-white/10 bg-white/5 p-4 sm:px-5 md:px-6">
          <p className="text-xs text-white/45 sm:text-sm">
            {dirtyUsers.length ? `${dirtyUsers.length} unsaved ${dirtyUsers.length === 1 ? 'change' : 'changes'}` : 'No unsaved changes'}
          </p>
          <button
            type="button"
            onClick={() => void saveAll()}
            disabled={!dirtyUsers.length || saving || loading || !!loadError}
            className="flex min-h-[42px] items-center justify-center gap-2 rounded-xl bg-primary-blue px-5 text-sm font-bold text-white shadow-lg transition hover:bg-primary-cyan disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <RefreshCw size={17} className="animate-spin" /> : <Save size={17} />}
            {saving ? 'Saving changes...' : 'Save all changes'}
          </button>
        </footer>
      </section>
    </div>
  );
};
