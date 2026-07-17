import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  IdCard,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  WandSparkles,
  X
} from 'lucide-react';
import { AuthService, DataService } from '../services/DriveService';
import { Chapter, Pillar, ROLE_COLORS, ROLE_LABELS, User, UserRole } from '../types';
import { getSessionToken } from '../utils/session';
import { useAppDialog } from '../contexts/AppDialogContext';
import { CustomSelect, CustomSelectOption } from './CustomSelect';
import { SkeletonBlock, SkeletonCircle } from './Skeleton';
import {
  generateStrongPassword,
  getPasswordRequirements,
  getPasswordStrength,
  getPasswordValidationError
} from '../utils/password';

interface RoleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AccessScope = 'general' | 'chapter' | 'pillar';
type PasswordMode = 'email' | 'manual';

interface UserDraft {
  username: string;
  email: string;
  scope: AccessScope;
  role: UserRole;
  chapterId: string;
  pillarId: string;
}

const ROLE_DETAILS: Record<UserRole, { level: number; description: string }> = {
  admin: { level: 5, description: 'Full platform administration' },
  editor: { level: 4, description: 'Content editing access' },
  pillar_editor: { level: 3, description: 'Editor for one assigned pillar' },
  chapter_head: { level: 2, description: 'Leader of one assigned chapter' },
  member: { level: 1, description: 'Member of one assigned chapter' }
};

const ROLES_BY_SCOPE: Record<AccessScope, UserRole[]> = {
  general: ['admin', 'editor'],
  chapter: ['editor', 'chapter_head', 'member'],
  pillar: ['pillar_editor']
};

const DEFAULT_ROLE_BY_SCOPE: Record<AccessScope, UserRole> = {
  general: 'editor',
  chapter: 'member',
  pillar: 'pillar_editor'
};

const scopeOptions: CustomSelectOption[] = [
  { value: 'general', label: 'General access', description: 'Platform-wide access without an assignment' },
  { value: 'chapter', label: 'Chapter bound', description: 'Access tied to one chapter' },
  { value: 'pillar', label: 'Pillar bound', description: 'Access tied to one pillar' }
];

const roleOptionsFor = (scope: AccessScope): CustomSelectOption[] =>
  ROLES_BY_SCOPE[scope].map((role) => ({
    value: role,
    label: ROLE_LABELS[role],
    description: `Level ${ROLE_DETAILS[role].level} · ${ROLE_DETAILS[role].description}`,
    previewClassName: ROLE_COLORS[role]
  }));

const scopeFor = (user: Pick<User, 'chapterId' | 'pillarId'>): AccessScope => {
  if (user.pillarId) return 'pillar';
  if (user.chapterId) return 'chapter';
  return 'general';
};

const draftFor = (user: User): UserDraft => ({
  username: user.username || '',
  email: user.email || '',
  scope: scopeFor(user),
  role: user.role,
  chapterId: user.chapterId || '',
  pillarId: user.pillarId || ''
});

const assignmentLabel = (user: User, chapters: Chapter[], pillars: Pillar[]) => {
  if (user.pillarId) {
    return pillars.find((pillar) => String(pillar.id) === String(user.pillarId))?.title || user.pillarId;
  }
  if (user.chapterId) {
    return chapters.find((chapter) => String(chapter.id) === String(user.chapterId))?.name || user.chapterId;
  }
  return 'General access';
};

const inputClassName = 'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary-cyan focus:ring-2 focus:ring-primary-cyan/15 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-white/30';
const labelClassName = 'mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-white/45';

export const RoleEditorModal: React.FC<RoleEditorModalProps> = ({ isOpen, onClose }) => {
  const { showAlert, showConfirm } = useAppDialog();
  const [users, setUsers] = useState<User[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('email');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const modalTransitionMs = 300;

  const selectedUser = users.find((user) => user.id === selectedUserId) || null;

  const resetPasswordEditor = () => {
    setPasswordMode('email');
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const closeEditor = () => {
    setSelectedUserId(null);
    setIsCreating(false);
    setDraft(null);
    resetPasswordEditor();
  };

  const requestClose = () => {
    if (saving || deleting || passwordSaving || sendingReset || closeTimerRef.current != null) return;
    setIsModalVisible(false);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, modalTransitionMs);
  };

  const loadData = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      setLoadError('Your session has expired. Please sign in again.');
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
    if (chaptersResult.success && chaptersResult.chapters) setChapters(chaptersResult.chapters);
    if (pillarsResult.success && pillarsResult.pillars) setPillars(pillarsResult.pillars);
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    closeEditor();
    const entryTimer = window.setTimeout(() => setIsModalVisible(true), 10);
    void loadData();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
      window.clearTimeout(entryTimer);
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [isOpen]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return users;
    return users.filter((user) => [
      user.username,
      user.email,
      ROLE_LABELS[user.role],
      assignmentLabel(user, chapters, pillars)
    ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)));
  }, [chapters, pillars, query, users]);

  const startEditing = (user: User) => {
    setIsCreating(false);
    setSelectedUserId(user.id);
    setDraft(draftFor(user));
    resetPasswordEditor();
  };

  const startCreating = () => {
    setSelectedUserId(null);
    setIsCreating(true);
    setDraft({
      username: '',
      email: '',
      scope: 'general',
      role: 'editor',
      chapterId: '',
      pillarId: ''
    });
    setPasswordMode('manual');
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
  };

  const changeScope = (scope: AccessScope) => {
    setDraft((current) => {
      if (!current) return current;
      const role = ROLES_BY_SCOPE[scope].includes(current.role)
        ? current.role
        : DEFAULT_ROLE_BY_SCOPE[scope];
      return {
        ...current,
        scope,
        role,
        chapterId: scope === 'chapter' ? current.chapterId : '',
        pillarId: scope === 'pillar' ? current.pillarId : ''
      };
    });
  };

  const saveUser = async () => {
    if (!selectedUser || !draft) return;
    const username = draft.username.trim();
    const email = draft.email.trim().toLowerCase();

    if (!username) {
      await showAlert('Enter a name before saving.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      await showAlert('Enter a valid email address before saving.');
      return;
    }
    if (draft.scope === 'chapter' && !draft.chapterId) {
      await showAlert('Choose a chapter before saving.');
      return;
    }
    if (draft.scope === 'pillar' && !draft.pillarId) {
      await showAlert('Choose a pillar before saving.');
      return;
    }

    const sessionToken = getSessionToken();
    if (!sessionToken) {
      await showAlert('Session expired. Please sign in again.');
      return;
    }

    setSaving(true);
    const result = await AuthService.updateUser(sessionToken, {
      userId: selectedUser.id,
      username,
      email,
      role: draft.role,
      chapterId: draft.scope === 'chapter' ? draft.chapterId : undefined,
      pillarId: draft.scope === 'pillar' ? draft.pillarId : undefined
    });
    setSaving(false);

    if (!result.success || !result.user) {
      await showAlert(result.error || 'The user could not be updated.');
      return;
    }

    const updatedUser = result.user;
    setUsers((current) => current.map((user) => user.id === updatedUser.id ? updatedUser : user));
    closeEditor();
    await showAlert(`${username}'s account information was saved.`, { title: 'User Updated' });
  };

  const createUser = async () => {
    if (!isCreating || !draft) return;
    const username = draft.username.trim();
    const email = draft.email.trim().toLowerCase();
    if (!username) {
      await showAlert('Enter a name before creating the account.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      await showAlert('Enter a valid email address before creating the account.');
      return;
    }
    if (draft.scope === 'chapter' && !draft.chapterId) {
      await showAlert('Choose a chapter before creating the account.');
      return;
    }
    if (draft.scope === 'pillar' && !draft.pillarId) {
      await showAlert('Choose a pillar before creating the account.');
      return;
    }
    const validationError = getPasswordValidationError(newPassword, { username, email });
    if (validationError) {
      await showAlert(validationError);
      return;
    }
    if (newPassword !== confirmPassword) {
      await showAlert('The passwords do not match.');
      return;
    }
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      await showAlert('Session expired. Please sign in again.');
      return;
    }
    setSaving(true);
    const result = await AuthService.createUser(sessionToken, {
      username,
      email,
      password: newPassword,
      role: draft.role,
      chapterId: draft.scope === 'chapter' ? draft.chapterId : undefined,
      pillarId: draft.scope === 'pillar' ? draft.pillarId : undefined
    });
    setSaving(false);
    if (!result.success || !result.user) {
      await showAlert(result.error || 'The user account could not be created.');
      return;
    }
    setUsers((current) => [...current, result.user!].sort((a, b) => a.username.localeCompare(b.username)));
    closeEditor();
    await showAlert(`${username}'s account was created successfully.`, { title: 'User Created' });
  };

  const deleteUser = async () => {
    if (!selectedUser) return;
    const confirmed = await showConfirm(
      `Permanently delete ${selectedUser.username} (${selectedUser.email})? This removes their sign-in account and profile and cannot be undone.`,
      { title: 'Delete User Account', confirmLabel: 'Delete Account' }
    );
    if (!confirmed) return;
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      await showAlert('Session expired. Please sign in again.');
      return;
    }
    setDeleting(true);
    const result = await AuthService.deleteUser(sessionToken, selectedUser.id);
    setDeleting(false);
    if (!result.success) {
      await showAlert(result.error || 'The user account could not be deleted.');
      return;
    }
    setUsers((current) => current.filter((user) => user.id !== selectedUser.id));
    const deletedName = selectedUser.username;
    closeEditor();
    await showAlert(`${deletedName}'s account was deleted.`, { title: 'User Deleted' });
  };

  const sendPasswordReset = async () => {
    if (!selectedUser) return;
    const confirmed = await showConfirm(
      `Send a password reset email to ${selectedUser.email}?`,
      { title: 'Send Password Reset', confirmLabel: 'Send Email' }
    );
    if (!confirmed) return;
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      await showAlert('Session expired. Please sign in again.');
      return;
    }
    setSendingReset(true);
    const redirectTo = new URL('/reset-password', window.location.origin).toString();
    const result = await AuthService.sendPasswordReset(sessionToken, selectedUser.id, redirectTo);
    setSendingReset(false);
    if (!result.success) {
      await showAlert(result.error || 'The password reset email could not be sent.');
      return;
    }
    await showAlert(result.message || `Password reset email sent to ${selectedUser.email}.`, { title: 'Email Sent' });
  };

  const updatePassword = async () => {
    if (!selectedUser || !draft) return;
    const validationError = getPasswordValidationError(newPassword, {
      username: draft.username,
      email: draft.email
    });
    if (validationError) {
      await showAlert(validationError);
      return;
    }
    if (newPassword !== confirmPassword) {
      await showAlert('The passwords do not match.');
      return;
    }
    const confirmed = await showConfirm(
      `Change the password for ${selectedUser.username}? The new password will take effect immediately.`,
      { title: 'Change Password', confirmLabel: 'Update Password' }
    );
    if (!confirmed) return;
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      await showAlert('Session expired. Please sign in again.');
      return;
    }
    setPasswordSaving(true);
    const result = await AuthService.updatePassword(sessionToken, selectedUser.id, newPassword);
    setPasswordSaving(false);
    if (!result.success) {
      await showAlert(result.error || 'The password could not be updated.');
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    await showAlert(result.message || 'Password updated successfully.', { title: 'Password Updated' });
  };

  if (!isOpen) return null;

  const chapterOptions: CustomSelectOption[] = chapters.map((chapter) => ({
    value: String(chapter.id),
    label: chapter.name,
    description: chapter.location || String(chapter.id)
  }));
  const pillarOptions: CustomSelectOption[] = pillars.map((pillar) => ({
    value: String(pillar.id),
    label: pillar.title,
    description: pillar.excerpt
  }));
  const hasChanges = !!selectedUser && !!draft && JSON.stringify(draft) !== JSON.stringify(draftFor(selectedUser));
  const editorOpen = !!draft && (!!selectedUser || isCreating);
  const passwordRequirements = getPasswordRequirements(newPassword);
  const passwordStrength = getPasswordStrength(newPassword);

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm transition-opacity duration-300 sm:p-3 md:p-4 ${isModalVisible ? 'opacity-100' : 'opacity-0'}`} role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-editor-title"
        className={`relative flex h-[calc(100dvh-1rem)] max-h-[98vh] w-full max-w-[98vw] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-300 dark:border-white/10 dark:bg-gray-900 sm:h-[95dvh] sm:max-h-[95vh] sm:max-w-6xl sm:rounded-3xl ${isModalVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-95 opacity-0'}`}
      >
        <header className="shrink-0 border-b border-gray-200 p-4 dark:border-gray-700 sm:p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {editorOpen ? (
                <button type="button" onClick={closeEditor} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-primary-blue dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-primary-cyan" aria-label="Back to users">
                  <ArrowLeft size={18} />
                </button>
              ) : (
                <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-cyan/10 text-primary-cyan sm:flex">
                  <ShieldCheck size={20} />
                </div>
              )}
              <div className="min-w-0">
                <h2 id="role-editor-title" className="truncate text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">
                  {isCreating ? 'Create User' : selectedUser ? `Edit ${selectedUser.username || 'user'}` : 'User Management'}
                </h2>
                <p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                  {isCreating ? 'Create a sign-in account and assign its access' : selectedUser ? 'Review and update this account' : 'Create, view, update, and remove user accounts'}
                </p>
              </div>
            </div>
            <button type="button" onClick={requestClose} className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800" aria-label="Close user management">
              <X className="h-6 w-6" />
            </button>
          </div>
        </header>

        {!editorOpen && (
          <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-950/40 sm:px-5 md:px-6">
            <div className="flex gap-2">
              <label className="relative block flex-1">
                <span className="sr-only">Search users</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" className="h-9 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-primary-cyan dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30" />
              </label>
              <button type="button" onClick={() => void loadData()} disabled={loading} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:border-primary-cyan hover:text-primary-blue disabled:opacity-50 dark:border-white/10 dark:text-gray-400 dark:hover:text-primary-cyan" aria-label="Reload users">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              </button>
              <button type="button" onClick={startCreating} className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary-blue px-3 text-xs font-bold text-white transition hover:bg-primary-cyan">
                <Plus size={14} /> <span className="hidden sm:inline">Create User</span><span className="sm:hidden">Create</span>
              </button>
            </div>
            <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400">Showing {filteredUsers.length} of {users.length} users</p>
          </div>
        )}

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-gray-50 p-4 dark:bg-gray-950/40 sm:p-5 md:p-6">
          {editorOpen && draft ? (
            <div className="mx-auto max-w-5xl space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-primary-cyan/20 bg-primary-cyan/[0.06] p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-cyan/10 text-primary-cyan"><UserRound size={17} /></div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{draft.username || (isCreating ? 'New user account' : 'Unnamed user')}</p>
                  <p className="truncate text-[11px] text-gray-500 dark:text-white/45">{draft.email || (isCreating ? 'Enter the account information below' : '')}</p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#051923]">
                  <div className="mb-3">
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white">Account information</h3>
                    <p className="mt-0.5 text-[10px] text-gray-500 dark:text-white/40">Identity and sign-in email for this account.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <label>
                      <span className={labelClassName}>Name</span>
                      <div className="relative"><UserRound className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} /><input value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} className={`${inputClassName} pl-9`} /></div>
                    </label>
                    <label>
                      <span className={labelClassName}>Email</span>
                      <div className="relative"><Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} /><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className={`${inputClassName} pl-9`} /></div>
                    </label>
                    {selectedUser && (
                      <label className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                        <span className={labelClassName}>Account ID</span>
                        <div className="relative"><IdCard className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} /><input value={selectedUser.id} readOnly className={`${inputClassName} cursor-not-allowed pl-9 text-gray-500 dark:text-white/40`} /></div>
                      </label>
                    )}
                  </div>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#051923]">
                  <div className="mb-3">
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white">Access and assignment</h3>
                    <p className="mt-0.5 text-[10px] text-gray-500 dark:text-white/40">Choose what the account is bound to before selecting its role.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div>
                      <label className={labelClassName}>1. Bound to</label>
                      <CustomSelect value={draft.scope} onChange={(value) => changeScope(value as AccessScope)} options={scopeOptions} ariaLabel="Access binding" triggerClassName="min-h-[36px] text-xs" />
                    </div>
                    <div>
                      <label className={labelClassName}>2. Role</label>
                      <CustomSelect value={draft.role} onChange={(value) => setDraft({ ...draft, role: value as UserRole })} options={roleOptionsFor(draft.scope)} ariaLabel="User role" triggerClassName="min-h-[36px] text-xs" />
                    </div>
                    {draft.scope === 'chapter' && (
                      <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                        <label className={labelClassName}>3. Chapter assignment</label>
                        <CustomSelect value={draft.chapterId} onChange={(chapterId) => setDraft({ ...draft, chapterId })} options={chapterOptions} placeholder="Choose a chapter" ariaLabel="Chapter assignment" triggerClassName="min-h-[36px] text-xs" />
                      </div>
                    )}
                    {draft.scope === 'pillar' && (
                      <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                        <label className={labelClassName}>3. Pillar assignment</label>
                        <CustomSelect value={draft.pillarId} onChange={(pillarId) => setDraft({ ...draft, pillarId })} options={pillarOptions} placeholder="Choose a pillar" ariaLabel="Pillar assignment" triggerClassName="min-h-[36px] text-xs" />
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#051923]">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-blue/10 text-primary-blue dark:text-primary-cyan"><KeyRound size={17} /></span>
                  <div>
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white">{isCreating ? 'Initial password' : 'Password management'}</h3>
                    <p className="mt-0.5 text-[10px] text-gray-500 dark:text-white/40">{isCreating ? 'Set or generate the strong password used for the first sign-in.' : 'Send a secure recovery email or set a strong password manually.'}</p>
                  </div>
                </div>

                {!isCreating && <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => setPasswordMode('email')} className={`rounded-lg border p-3 text-left transition ${passwordMode === 'email' ? 'border-primary-blue bg-primary-blue/5 dark:border-primary-cyan dark:bg-primary-cyan/10' : 'border-gray-200 hover:border-primary-blue/40 dark:border-white/10'}`}>
                    <span className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-white"><Send size={14} /> Send change email</span>
                    <span className="mt-1 block text-[10px] text-gray-500 dark:text-gray-400">The user creates their password from a secure email link.</span>
                  </button>
                  <button type="button" onClick={() => setPasswordMode('manual')} className={`rounded-lg border p-3 text-left transition ${passwordMode === 'manual' ? 'border-primary-blue bg-primary-blue/5 dark:border-primary-cyan dark:bg-primary-cyan/10' : 'border-gray-200 hover:border-primary-blue/40 dark:border-white/10'}`}>
                    <span className="flex items-center gap-2 text-xs font-bold text-gray-900 dark:text-white"><KeyRound size={14} /> Change manually</span>
                    <span className="mt-1 block text-[10px] text-gray-500 dark:text-gray-400">Set or generate a strong password immediately.</span>
                  </button>
                </div>}

                {!isCreating && passwordMode === 'email' ? (
                  <div className="mt-4 flex flex-col gap-3 rounded-lg bg-gray-50 p-3 dark:bg-white/5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{selectedUser?.email}</p>
                      <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">The recovery link opens the website’s password reset page.</p>
                    </div>
                    <button type="button" onClick={() => void sendPasswordReset()} disabled={sendingReset || passwordSaving} className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary-blue px-4 text-xs font-bold text-white transition hover:bg-primary-cyan disabled:opacity-50">
                      {sendingReset ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                      {sendingReset ? 'Sending...' : 'Send Reset Email'}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label>
                        <span className={labelClassName}>New password</span>
                        <span className="relative block">
                          <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" className={`${inputClassName} pr-10`} placeholder="Enter a strong password" />
                          <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                        </span>
                      </label>
                      <label>
                        <span className={labelClassName}>Confirm password</span>
                        <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" className={inputClassName} placeholder="Repeat the password" />
                      </label>
                    </div>

                    <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1.5 flex items-center justify-between text-[10px]"><span className="font-bold text-gray-600 dark:text-gray-300">Strength</span><span className="text-gray-500 dark:text-gray-400">{passwordStrength.label}</span></div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10"><div className={`h-full rounded-full transition-all ${passwordStrength.className}`} style={{ width: `${passwordStrength.score}%` }} /></div>
                        <div className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                          {passwordRequirements.map((requirement) => (
                            <span key={requirement.key} className={`flex items-center gap-1 text-[10px] ${requirement.met ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}><CheckCircle2 size={11} /> {requirement.label}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <button type="button" onClick={() => { const generated = generateStrongPassword(); setNewPassword(generated); setConfirmPassword(generated); setShowPassword(true); }} className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-600 transition hover:border-primary-cyan hover:text-primary-blue dark:border-white/10 dark:text-gray-300 dark:hover:text-primary-cyan"><WandSparkles size={14} /> Generate</button>
                        {!isCreating && <button type="button" onClick={() => void updatePassword()} disabled={passwordSaving || sendingReset || !newPassword || !confirmPassword} className="flex h-9 items-center gap-2 rounded-lg bg-primary-blue px-4 text-xs font-bold text-white transition hover:bg-primary-cyan disabled:opacity-50">{passwordSaving ? <RefreshCw size={14} className="animate-spin" /> : <KeyRound size={14} />}{passwordSaving ? 'Updating...' : 'Update Password'}</button>}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : loading ? (
            <div className="grid gap-2 sm:grid-cols-2" aria-label="Loading users" role="status">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-white/10 dark:bg-[#051923]">
                  <SkeletonCircle className="h-9 w-9 shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock className={`h-3 ${index % 2 ? 'w-32' : 'w-24'} max-w-full rounded-md`} />
                    <SkeletonBlock className={`h-2.5 ${index % 2 ? 'w-40' : 'w-36'} max-w-full rounded-md`} />
                  </div>
                  <SkeletonBlock className="h-8 w-[74px] shrink-0 rounded-lg" />
                </div>
              ))}
              <span className="sr-only">Loading user accounts</span>
            </div>
          ) : loadError ? (
            <div className="flex min-h-52 flex-col items-center justify-center px-5 text-center">
              <AlertCircle size={28} className="mb-2 text-red-500" />
              <p className="text-sm font-bold text-gray-900 dark:text-white">Real users could not be loaded</p>
              <p className="mt-1 max-w-xl text-xs text-gray-500 dark:text-white/50">{loadError}</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center text-center text-gray-500 dark:text-white/50">
              <Users size={28} className="mb-2" /><p className="text-sm font-bold">No users match your search.</p>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {filteredUsers.map((user) => (
                <article key={user.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:border-primary-cyan/40 dark:border-white/10 dark:bg-[#051923]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-cyan/10 text-primary-cyan"><UserRound size={17} /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xs font-bold text-gray-900 dark:text-white">{user.username || 'Unnamed user'}</h3>
                    <p className="truncate text-[10px] text-gray-500 dark:text-white/45">{user.email}</p>
                  </div>
                  <button type="button" onClick={() => startEditing(user)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-[11px] font-semibold text-gray-600 transition hover:border-primary-cyan hover:text-primary-blue dark:border-white/10 dark:text-gray-300 dark:hover:text-primary-cyan">
                    <Pencil size={11} /> Edit
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-white/90 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/90 sm:gap-3 sm:px-5 sm:py-4 md:px-6">
          {editorOpen && draft ? (
            <>
              {selectedUser && <button type="button" onClick={() => void deleteUser()} disabled={saving || deleting || passwordSaving || sendingReset} className="mr-auto flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"><Trash2 size={15} />{deleting ? 'Deleting...' : <><span className="hidden sm:inline">Delete Account</span><span className="sm:hidden">Delete</span></>}</button>}
              <button type="button" onClick={closeEditor} disabled={saving || deleting} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white">Cancel</button>
              <button type="button" onClick={() => void (isCreating ? createUser() : saveUser())} disabled={saving || deleting || (isCreating ? !draft.username.trim() || !draft.email.trim() || !newPassword || !confirmPassword : !hasChanges)} className="flex items-center gap-2 rounded-lg bg-primary-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-cyan disabled:cursor-not-allowed disabled:opacity-40">
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                {saving ? (isCreating ? 'Creating...' : 'Saving...') : (isCreating ? 'Create User' : 'Save Changes')}
              </button>
            </>
          ) : (
            <button type="button" onClick={requestClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white">Close</button>
          )}
        </footer>
      </section>
    </div>
  );
};
