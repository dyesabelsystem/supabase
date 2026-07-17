import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Edit2, Trash2, Save, X, Users, MapPin, 
  Phone, Mail, Globe, Image as ImageIcon, ChevronLeft,
  UserPlus, Search, Shield, Key, Upload, Loader,
  Eye, EyeOff
} from 'lucide-react';
import { DataService, AuthService, convertToCORSFreeLink, getImageDebugInfo } from '../services/DriveService';
import { useAppDialog } from '../contexts/AppDialogContext';
import { Chapter, ChapterActivity, User } from '../types';
import { getSessionToken, getSessionUser } from '../utils/session';
import { uploadImageToDrive } from '../utils/driveUpload';
import { CustomSelect, CustomSelectOption } from './CustomSelect';
import { SkeletonBlock, SkeletonCircle } from './Skeleton';
import { getPasswordValidationError } from '../utils/password';

const CHAPTERS_MANAGEMENT_CACHE_PREFIX = 'dyesabel:chapters-management:cache:v1';
const ENABLE_IMAGE_DIAGNOSTICS = import.meta.env.DEV && import.meta.env.VITE_ENABLE_IMAGE_DIAGNOSTICS === 'true';
const CHAPTER_ACTIVITY_INITIAL_VISIBLE_COUNT = 4;

interface ChaptersManagementCacheRecord {
  chapters: Chapter[];
  users: User[];
  cachedAt: number;
}

const createStableJson_ = (value: unknown): string => {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === 'object') {
      const source = input as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};
      Object.keys(source).sort().forEach((key) => {
        normalized[key] = normalize(source[key]);
      });
      return normalized;
    }
    return input;
  };

  return JSON.stringify(normalize(value));
};

const readChaptersManagementCache_ = (cacheKey: string): ChaptersManagementCacheRecord | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChaptersManagementCacheRecord;
    if (!parsed || !Array.isArray(parsed.chapters) || !Array.isArray(parsed.users)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeChaptersManagementCache_ = (cacheKey: string, chapters: Chapter[], users: User[]): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify({ chapters, users, cachedAt: Date.now() }));
  } catch {
    // Ignore cache write failures so modal remains usable.
  }
};

// --- Types ---
type ViewState = 'LIST' | 'CREATE_CHAPTER' | 'CHAPTER_DETAIL';
type TabState = 'DETAILS' | 'CONTENT' | 'MEMBERS';
type MemberSubTabState = 'GENERAL' | 'CHAPTER';
type UserEditorMode = 'CREATE_CHAPTER' | 'CREATE_GENERAL' | 'EDIT';
type ChapterImageField = 'logo' | 'image' | 'headImageUrl';

interface UserEditorFormState {
  userId?: string;
  username: string;
  email: string;
  password: string;
  role: string;
  chapterId: string;
  pillarId: string;
}

interface ChaptersManagementProps {
  onBack: () => void;
}

const chapterRoleOptions: CustomSelectOption[] = [
  { value: 'member', label: 'Member', description: 'Basic chapter account' },
  { value: 'editor', label: 'Chapter Editor', description: 'Can edit chapter content' },
  { value: 'chapter_head', label: 'Chapter Head', description: 'Leads the local chapter' }
];

const allRoleOptions: CustomSelectOption[] = [
  { value: 'member', label: 'Member', description: 'Basic chapter account' },
  { value: 'editor', label: 'Editor', description: 'Can edit content globally or by chapter' },
  { value: 'pillar_editor', label: 'Pillar Editor', description: 'Can edit one assigned pillar only' },
  { value: 'chapter_head', label: 'Chapter Head', description: 'Leads a local chapter' },
  { value: 'admin', label: 'Admin', description: 'Full system access' }
];

function formatActivityDateInManila_(rawDate?: string) {
  var value = String(rawDate || '').trim();
  if (!value) return 'No date available';
  var parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(parsed);
}

function normalizeExternalUrl_(value?: string) {
  var raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return 'https://' + raw;
}

function truncateText_(value: string, maxLength: number) {
  var text = String(value || '').trim();
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}

export const ChaptersManagement: React.FC<ChaptersManagementProps> = ({ onBack }) => {
  const { showAlert, showConfirm } = useAppDialog();
  const chapterCacheKey = `${CHAPTERS_MANAGEMENT_CACHE_PREFIX}:${getSessionUser()?.id || 'anonymous'}`;
  const initialCache = readChaptersManagementCache_(chapterCacheKey);
  // --- Global State ---
  const [view, setView] = useState<ViewState>('LIST');
  const [activeTab, setActiveTab] = useState<TabState>('DETAILS');
  const [activeMemberSubTab, setActiveMemberSubTab] = useState<MemberSubTabState>('GENERAL');
  const [chapters, setChapters] = useState<Chapter[]>(() => initialCache?.chapters || []);
  const [users, setUsers] = useState<User[]>(() => initialCache?.users || []); 
  const [pillars, setPillars] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(() => !initialCache);
  
  // --- Selected Item State ---
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  // --- Form States ---
  const [chapterFormData, setChapterFormData] = useState<Partial<Chapter>>({});
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState<UserEditorMode>('CREATE_CHAPTER');
  const [userEditorForm, setUserEditorForm] = useState<UserEditorFormState>({
    username: '',
    email: '',
    password: '',
    role: 'member',
    chapterId: '',
    pillarId: ''
  });
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [isSavingChapter, setIsSavingChapter] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [pendingChapterImages, setPendingChapterImages] = useState<Partial<Record<ChapterImageField, File>>>({});
  const [chapterImagePreviews, setChapterImagePreviews] = useState<Partial<Record<ChapterImageField, string>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [visibleChapterActivityCount, setVisibleChapterActivityCount] = useState(CHAPTER_ACTIVITY_INITIAL_VISIBLE_COUNT);
  const [activeChapterActivityEditor, setActiveChapterActivityEditor] = useState<{ activityIndex: number | null; isNew: boolean } | null>(null);
  const [chapterActivityDraft, setChapterActivityDraft] = useState<ChapterActivity | null>(null);
  const [pendingChapterActivityImage, setPendingChapterActivityImage] = useState<{ file: File; oldFileId?: string } | null>(null);
  const [savingChapterActivity, setSavingChapterActivity] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isChapterActivityEditorVisible, setIsChapterActivityEditorVisible] = useState(false);
  const [isUserModalVisible, setIsUserModalVisible] = useState(false);
  const modalTransitionMs = 300;
  const closeTimerRef = useRef<number | null>(null);
  const chapterActivityCloseTimerRef = useRef<number | null>(null);
  const userModalCloseTimerRef = useRef<number | null>(null);
  const chapterImagePreviewsRef = useRef<Partial<Record<ChapterImageField, string>>>({});

  const clearPendingChapterImages = () => {
    Object.values(chapterImagePreviewsRef.current).forEach((url) => URL.revokeObjectURL(url));
    chapterImagePreviewsRef.current = {};
    setChapterImagePreviews({});
    setPendingChapterImages({});
  };

  // --- Initial Load ---
  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const entryTimer = window.setTimeout(() => setIsModalVisible(true), 10);

    return () => {
      Object.values(chapterImagePreviewsRef.current).forEach((url) => URL.revokeObjectURL(url));
      window.clearTimeout(entryTimer);
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (chapterActivityCloseTimerRef.current != null) {
        window.clearTimeout(chapterActivityCloseTimerRef.current);
      }
      if (userModalCloseTimerRef.current != null) {
        window.clearTimeout(userModalCloseTimerRef.current);
      }
    };
  }, []);

  // ... inside ChaptersManagement.tsx ...

  const loadData = async () => {
    const cached = readChaptersManagementCache_(chapterCacheKey);
    const hasCachedData = !!cached;
    const cachedSignature = cached ? createStableJson_({ chapters: cached.chapters, users: cached.users }) : '';

    if (hasCachedData) {
      setChapters(cached.chapters);
      setUsers(cached.users);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const token = getSessionToken() || '';

      const [chapRes, userRes, pillarRes] = await Promise.all([
        DataService.listChapters(),
        AuthService.listUsers(token),
        DataService.loadPillars()
      ]);

      if (pillarRes.success && Array.isArray(pillarRes.pillars)) setPillars(pillarRes.pillars);

      const nextChapters = chapRes.success && chapRes.chapters ? chapRes.chapters : (hasCachedData ? cached!.chapters : []);
      const nextUsers = userRes.success && userRes.users ? userRes.users : (hasCachedData ? cached!.users : []);
      const backendSignature = createStableJson_({ chapters: nextChapters, users: nextUsers });

      if (ENABLE_IMAGE_DIAGNOSTICS && Array.isArray(nextChapters)) {
        const chapterLogoDiagnostics = nextChapters.map((chapter) => {
          const rawLogo = String((chapter as any).logo || (chapter as any).logoUrl || '').trim();
          return {
            chapterId: chapter.id,
            chapterName: chapter.name,
            logoRaw: rawLogo,
            logoMatchesChapterId: rawLogo !== '' && rawLogo === String(chapter.id || ''),
            ...getImageDebugInfo(rawLogo)
          };
        });

        console.log('[ChaptersManagement] Loaded chapter logo diagnostics', chapterLogoDiagnostics);

        const missing = chapterLogoDiagnostics.filter((entry) => !entry.hasUrl);
        const suspicious = chapterLogoDiagnostics.filter((entry) => entry.logoMatchesChapterId);
        if (missing.length || suspicious.length) {
          console.warn('[ChaptersManagement] Chapter logos need attention', {
            missingCount: missing.length,
            suspiciousCount: suspicious.length,
            missing,
            suspicious
          });
        }
      }

      if (!hasCachedData || backendSignature !== cachedSignature) {
        setChapters(nextChapters);
        setUsers(nextUsers);
      }

      writeChaptersManagementCache_(chapterCacheKey, nextChapters, nextUsers);

      if (!userRes.success && !hasCachedData) {
        setUsers([]);
      }
    } catch (error) {
      if (!hasCachedData) {
        setUsers([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // ... rest of the file ...

  // --- Handlers ---
  const handleChapterClick = (chapter: Chapter) => {
    clearPendingChapterImages();
    setSelectedChapter(chapter);
    setChapterFormData(chapter);
    setVisibleChapterActivityCount(CHAPTER_ACTIVITY_INITIAL_VISIBLE_COUNT);
    closeChapterActivityEditor();
    setView('CHAPTER_DETAIL');
    setActiveTab('DETAILS');
  };

  const requestCloseManagementModal = () => {
    if (closeTimerRef.current != null) return;
    setIsModalVisible(false);
    closeTimerRef.current = window.setTimeout(() => {
      onBack();
    }, modalTransitionMs);
  };

  const generateChapterId = (name: string) => {
    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const year = new Date().getFullYear();
    const uniqueCode = Math.random().toString(36).substring(2, 6);
    return `${slug}_chapter_${year}-${uniqueCode}`;
  };

  const handleSaveChapter = async () => {
    if (isSavingChapter) return;

    if (!chapterFormData.name) {
      await showAlert('Chapter Name is required');
      return;
    }
    
    const isNew = view === 'CREATE_CHAPTER';
    let chapterId = selectedChapter?.id || '';

    if (isNew) {
      chapterId = generateChapterId(chapterFormData.name);
    }
    
    const token = getSessionToken();
    if (!token) {
      await showAlert('Session expired. Please log in again.');
      return;
    }

    setIsSavingChapter(true);
    try {
      const payload: Partial<Chapter> & { id: string } = { ...chapterFormData, id: chapterId };
      const pendingUploads = Object.entries(pendingChapterImages) as [ChapterImageField, File][];

      for (const [field, file] of pendingUploads) {
        const oldFileId = field === 'logo'
          ? chapterFormData.logoFileId || chapterFormData.logoUrl || chapterFormData.logo
          : field === 'image'
            ? chapterFormData.imageFileId || chapterFormData.imageUrl || chapterFormData.image
            : chapterFormData.headImageFileId || chapterFormData.headImageUrl;
        const uploadType = field === 'logo' ? 'chapter-logo' : `chapter-${field}`;
        const upload = await uploadImageToDrive(file, uploadType, token, oldFileId);

        if (!upload.success || !upload.url || !upload.fileId) {
          throw new Error(upload.error || `Google Drive did not return an uploaded ${field} URL.`);
        }

        if (field === 'logo') {
          payload.logo = upload.url;
          payload.logoUrl = upload.url;
          payload.logoFileId = upload.fileId;
        } else if (field === 'image') {
          payload.image = upload.url;
          payload.imageUrl = upload.url;
          payload.imageFileId = upload.fileId;
        } else {
          payload.headImageUrl = upload.url;
          payload.headImageFileId = upload.fileId;
        }
      }

      const res = await DataService.saveChapter(chapterId, payload, token);
      if (res.success) {
        clearPendingChapterImages();
        await showAlert(isNew ? 'Chapter Created!' : 'Chapter Updated!', {
          title: isNew ? 'Chapter Created' : 'Chapter Updated'
        });
        loadData();
        setView('LIST');
      } else {
        await showAlert('Failed to save: ' + res.message);
      }
    } catch (e) {
      await showAlert('Error saving chapter: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsSavingChapter(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      await showAlert('Please select a valid image file.');
      return;
    }

    setIsUploadingLogo(true);
    setPendingChapterImage_('logo', file);
    setIsUploadingLogo(false);
    e.target.value = '';
  };

  const handleChapterImageFieldUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'image' | 'headImageUrl'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      await showAlert('Please select a valid image file.');
      return;
    }

    setPendingChapterImage_(field, file);
    e.target.value = '';
  };

  const setPendingChapterImage_ = (field: ChapterImageField, file: File) => {
    const previousUrl = chapterImagePreviewsRef.current[field];
    if (previousUrl) URL.revokeObjectURL(previousUrl);

    const previewUrl = URL.createObjectURL(file);
    chapterImagePreviewsRef.current = { ...chapterImagePreviewsRef.current, [field]: previewUrl };
    setChapterImagePreviews({ ...chapterImagePreviewsRef.current });
    setPendingChapterImages((current) => ({ ...current, [field]: file }));
  };

  const getChapterActivities_ = (): ChapterActivity[] => (
    Array.isArray(chapterFormData.activities) ? [...chapterFormData.activities] : []
  );

  const setChapterActivities_ = (activities: ChapterActivity[]) => {
    setChapterFormData((prev) => ({ ...prev, activities }));
  };

  const closeChapterActivityEditor = () => {
    if (chapterActivityCloseTimerRef.current != null) {
      window.clearTimeout(chapterActivityCloseTimerRef.current);
    }
    setIsChapterActivityEditorVisible(false);
    chapterActivityCloseTimerRef.current = window.setTimeout(() => {
      setActiveChapterActivityEditor(null);
      setChapterActivityDraft(null);
      setPendingChapterActivityImage(null);
    }, modalTransitionMs);
  };

  const addChapterActivity = () => {
    const newActivity: ChapterActivity = {
      id: `activity-${Date.now()}`,
      title: 'New Chapter Activity',
      description: '',
      date: new Date().toISOString(),
      imageUrl: 'https://picsum.photos/seed/new-activity/640/360',
      learnMoreUrl: ''
    };

    setActiveChapterActivityEditor({ activityIndex: null, isNew: true });
    setChapterActivityDraft({ ...newActivity });
    window.setTimeout(() => setIsChapterActivityEditorVisible(true), 10);
  };

  const openChapterActivityEditor = (activityIndex: number) => {
    const activity = getChapterActivities_()[activityIndex];
    if (!activity) return;
    setActiveChapterActivityEditor({ activityIndex, isNew: false });
    setChapterActivityDraft({ ...activity });
    window.setTimeout(() => setIsChapterActivityEditorVisible(true), 10);
  };

  const applyChapterActivityDraft_ = (
    baseActivities: ChapterActivity[],
    nextActivity: ChapterActivity,
    options?: { fallbackIndex?: number | null; prepend?: boolean }
  ) => {
    var activities = [...baseActivities];
    if (options && options.prepend) {
      return [nextActivity, ...activities];
    }

    var targetIndex = activities.findIndex(function(activity) {
      return String(activity && activity.id) === String(nextActivity.id);
    });

    if (
      targetIndex < 0 &&
      options &&
      typeof options.fallbackIndex === 'number' &&
      activities[options.fallbackIndex]
    ) {
      targetIndex = options.fallbackIndex;
    }

    if (targetIndex < 0) activities.push(nextActivity);
    else activities[targetIndex] = nextActivity;

    return activities;
  };

  const handleSaveChapterActivityDraft = async () => {
    if (!activeChapterActivityEditor || !chapterActivityDraft) return;

    const nextActivity = { ...chapterActivityDraft };
    if (!String(nextActivity.title || '').trim()) {
      await showAlert('Activity title is required.');
      return;
    }

    const activityOptions = activeChapterActivityEditor.isNew
      ? { prepend: true }
      : { fallbackIndex: activeChapterActivityEditor.activityIndex };

    setSavingChapterActivity(true);
    try {
      if (pendingChapterActivityImage) {
        const token = getSessionToken();
        if (!token) throw new Error('Session expired. Please log in again.');
        const upload = await uploadImageToDrive(
          pendingChapterActivityImage.file,
          'chapter-activity',
          token,
          pendingChapterActivityImage.oldFileId
        );
        if (!upload.success || !upload.url || !upload.fileId) {
          throw new Error(upload.error || 'Chapter activity image upload failed.');
        }
        nextActivity.imageUrl = upload.url;
        nextActivity.imageFileId = upload.fileId;
      }
      const updatedActivities = applyChapterActivityDraft_(getChapterActivities_(), nextActivity, activityOptions);
      const canSyncImmediately = view === 'CHAPTER_DETAIL' && !!selectedChapter?.id;

      if (!canSyncImmediately) {
        setChapterActivities_(updatedActivities);
        if (activeChapterActivityEditor.isNew) {
          setVisibleChapterActivityCount((current) => current + 1);
        }
        await showAlert('Activity saved in draft. Save the chapter to sync it to backend.', {
          title: 'Draft Saved'
        });
        closeChapterActivityEditor();
        return;
      }

      const token = getSessionToken();
      if (!token) {
        await showAlert('Session expired. Please log in again.');
        return;
      }

      const chapterId = String(selectedChapter.id);
      const nextChapterPayload = {
        ...chapterFormData,
        id: chapterId,
        activities: updatedActivities
      };

      const result = await DataService.saveChapter(chapterId, nextChapterPayload, token);
      if (!result.success) {
        await showAlert('Failed to sync activity: ' + (result.message || 'Unknown error'));
        return;
      }

      setChapterActivities_(updatedActivities);
      if (activeChapterActivityEditor.isNew) {
        setVisibleChapterActivityCount((current) => current + 1);
      }

      setSelectedChapter((current) => {
        if (!current) return current;
        return {
          ...current,
          ...nextChapterPayload,
          id: chapterId,
          activities: updatedActivities
        } as Chapter;
      });
      setChapters((current) => current.map((chapter) => (
        String(chapter.id) === chapterId
          ? ({ ...chapter, ...nextChapterPayload, id: chapterId, activities: updatedActivities } as Chapter)
          : chapter
      )));

      await showAlert(activeChapterActivityEditor.isNew ? 'Activity created and synced.' : 'Activity updated and synced.', {
        title: 'Activity Saved'
      });
      closeChapterActivityEditor();
    } finally {
      setSavingChapterActivity(false);
    }
  };

  const handleChapterActivityImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      await showAlert('Please select a valid image file.');
      return;
    }

    if (!chapterActivityDraft) return;

    setPendingChapterActivityImage({
      file,
      oldFileId: chapterActivityDraft.imageFileId || chapterActivityDraft.imageUrl
    });
    setChapterActivityDraft({ ...chapterActivityDraft, imageUrl: URL.createObjectURL(file) });
  };

  const removeChapterActivity = async (activityIndex: number) => {
    const shouldRemove = await showConfirm('Remove this uploaded activity item?', {
      title: 'Remove Activity',
      confirmLabel: 'Remove'
    });
    if (!shouldRemove) return;

    const nextActivities = getChapterActivities_().filter((_, index) => index !== activityIndex);
    setChapterActivities_(nextActivities);
  };

  const handleAddUser = async () => {
    if (!userEditorForm.username || !userEditorForm.password) {
      await showAlert('Username and Password required');
      return;
    }

    const isAdminRole = userEditorForm.role === 'admin';
    const isPillarEditorRole = userEditorForm.role === 'pillar_editor';
    const assignedChapterId = isAdminRole || isPillarEditorRole ? '' : String(userEditorForm.chapterId || '');
    const assignedPillarId = isPillarEditorRole ? String(userEditorForm.pillarId || '') : '';
    const requiresChapter = userEditorForm.role === 'chapter_head' || userEditorForm.role === 'member';

    if (requiresChapter && !assignedChapterId) {
      await showAlert('Chapter assignment is required for chapter heads and members.');
      return;
    }
    const passwordError = getPasswordValidationError(userEditorForm.password, {
      username: userEditorForm.username,
      email: userEditorForm.email
    });
    if (passwordError) {
      await showAlert(passwordError);
      return;
    }
    if (isPillarEditorRole && !assignedPillarId) {
      await showAlert('Pillar assignment is required for pillar editors.');
      return;
    }

    setIsSavingUser(true);
    try {
      const token = getSessionToken();
      if (!token) {
        await showAlert('Session expired. Please log in again.');
        return;
      }
      const payload = {
        username: userEditorForm.username,
        email: userEditorForm.email,
        password: userEditorForm.password,
        role: userEditorForm.role,
        chapterId: assignedChapterId,
        pillarId: assignedPillarId
      };
      const res = await AuthService.createUser(token, payload);

      if (!res.success) {
        await showAlert('Failed to add user: ' + (res.error || res.message || 'Unknown error'));
        return;
      }

      if (res.user) {
        setUsers(prev => [...prev, res.user]);
      } else {
        await loadData();
      }

      await showAlert('User created successfully.', { title: 'User Created' });
      closeUserModal();
    } catch (e) {
      await showAlert('Error adding user');
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!userEditorForm.userId) {
      await showAlert('User ID is required for updates.');
      return;
    }
    if (!userEditorForm.username) {
      await showAlert('Username is required.');
      return;
    }

    const isAdminRole = userEditorForm.role === 'admin';
    const isPillarEditorRole = userEditorForm.role === 'pillar_editor';
    const assignedChapterId = isAdminRole || isPillarEditorRole ? '' : String(userEditorForm.chapterId || '');
    const assignedPillarId = isPillarEditorRole ? String(userEditorForm.pillarId || '') : '';
    if (!isAdminRole && (userEditorForm.role === 'chapter_head' || userEditorForm.role === 'member') && !assignedChapterId) {
      await showAlert('Chapter assignment is required for chapter heads and members.');
      return;
    }
    if (userEditorForm.password) {
      const passwordError = getPasswordValidationError(userEditorForm.password, {
        username: userEditorForm.username,
        email: userEditorForm.email
      });
      if (passwordError) {
        await showAlert(passwordError);
        return;
      }
    }
    if (isPillarEditorRole && !assignedPillarId) {
      await showAlert('Pillar assignment is required for pillar editors.');
      return;
    }

    setIsSavingUser(true);
    try {
      const token = getSessionToken();
      if (!token) {
        await showAlert('Session expired. Please log in again.');
        return;
      }

      const updateRes = await AuthService.updateUser(token, {
        userId: userEditorForm.userId,
        username: userEditorForm.username,
        email: userEditorForm.email,
        role: userEditorForm.role,
        chapterId: assignedChapterId,
        pillarId: assignedPillarId
      });

      if (!updateRes.success) {
        await showAlert('Failed to update user: ' + (updateRes.error || updateRes.message || 'Unknown error'));
        return;
      }

      if (userEditorForm.password) {
        const passRes = await AuthService.updatePassword(token, userEditorForm.userId, userEditorForm.password);
        if (!passRes.success) {
          await showAlert('User info updated, but password update failed: ' + (passRes.error || passRes.message || 'Unknown error'));
        }
      }

      await loadData();
      await showAlert('User updated successfully.', { title: 'User Updated' });
      closeUserModal();
    } catch (error) {
      await showAlert('Error updating user');
    } finally {
      setIsSavingUser(false);
    }
  };

  const closeUserModal = () => {
    if (userModalCloseTimerRef.current != null) {
      window.clearTimeout(userModalCloseTimerRef.current);
    }
    setIsUserModalVisible(false);
    userModalCloseTimerRef.current = window.setTimeout(() => {
      setIsUserModalOpen(false);
      setShowPassword(false);
      setUserEditorForm({
        username: '',
        email: '',
        password: '',
        role: 'member',
        chapterId: '',
        pillarId: ''
      });
    }, modalTransitionMs);
  };

  const openUserModal_ = () => {
    if (userModalCloseTimerRef.current != null) {
      window.clearTimeout(userModalCloseTimerRef.current);
    }
    setIsUserModalOpen(true);
    setIsUserModalVisible(false);
    window.setTimeout(() => setIsUserModalVisible(true), 10);
  };

  const openCreateChapterUserModal = () => {
    if (!selectedChapter) return;
    setUserModalMode('CREATE_CHAPTER');
    setShowPassword(false);
    setUserEditorForm({
      username: '',
      email: '',
      password: '',
      role: 'member',
      chapterId: selectedChapter.id,
      pillarId: ''
    });
    openUserModal_();
  };

  const openCreateGeneralUserModal = () => {
    setUserModalMode('CREATE_GENERAL');
    setShowPassword(false);
    setUserEditorForm({
      username: '',
      email: '',
      password: '',
      role: 'member',
      chapterId: selectedChapter?.id || '',
      pillarId: ''
    });
    openUserModal_();
  };

  const openEditUserModal = (user: User) => {
    setUserModalMode('EDIT');
    setShowPassword(false);
    setUserEditorForm({
      userId: user.id,
      username: user.username,
      email: user.email,
      password: '',
      role: user.role,
      chapterId: user.chapterId || '',
      pillarId: user.pillarId || ''
    });
    openUserModal_();
  };

  const handleAssignGeneralUserToSelectedChapter = async (user: User) => {
    if (!selectedChapter) return;
    if (user.role === 'admin' || user.role === 'pillar_editor') {
      await showAlert(user.role === 'admin'
        ? 'Admin accounts cannot be assigned to a chapter.'
        : 'Pillar editors cannot be assigned to a chapter.');
      return;
    }
    const token = getSessionToken();
    if (!token) {
      await showAlert('Session expired. Please log in again.');
      return;
    }
    try {
      const res = await AuthService.updateUser(token, {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        chapterId: selectedChapter.id,
        pillarId: ''
      });
      if (!res.success) {
        await showAlert('Failed to assign user: ' + res.message);
        return;
      }
      await loadData();
      await showAlert(`Assigned ${user.username} to ${selectedChapter.name}.`, { title: 'User Assigned' });
    } catch (error) {
      await showAlert('Error assigning user to chapter.');
    }
  };

  const handleDeleteChapter = async (id: string) => {
    const shouldDelete = await showConfirm('Delete this chapter? This cannot be undone.', {
      title: 'Delete Chapter',
      confirmLabel: 'Delete'
    });
    if (!shouldDelete) return;
    setChapters(prev => prev.filter(c => c.id !== id)); 
    setView('LIST');
    const token = getSessionToken();
    if (!token) {
      await showAlert('Session expired. Please log in again.');
      return;
    }
    await DataService.deleteChapter(id, token);
  };

  const chapterUsers = users.filter(u => u.chapterId === selectedChapter?.id);
  const generalUsers = users.filter(u => !u.chapterId);

  const previewChapterName = String(chapterFormData.name || selectedChapter?.name || 'Untitled chapter');
  const previewChapterLocation = String(chapterFormData.location || selectedChapter?.location || 'Location not set');
  const previewChapterDescription = String(chapterFormData.description || selectedChapter?.description || 'No description available.');
  const previewChapterLogo = String(chapterFormData.logo || selectedChapter?.logo || selectedChapter?.logoUrl || '');
  const previewChapterCover = String(chapterFormData.image || chapterFormData.imageUrl || selectedChapter?.image || selectedChapter?.imageUrl || '');
  const previewChapterEmail = String(chapterFormData.email || selectedChapter?.email || '');
  const previewChapterPhone = String(chapterFormData.phone || selectedChapter?.phone || '');
  const previewChapterWebsite = String(chapterFormData.websiteUrl || selectedChapter?.websiteUrl || '');
  const previewChapterHeadName = String(chapterFormData.headName || selectedChapter?.headName || '');
  const previewChapterHeadRole = String(chapterFormData.headRole || selectedChapter?.headRole || '');
  const previewChapterHeadQuote = String(chapterFormData.headQuote || selectedChapter?.headQuote || '');
  const previewChapterHeadImage = String(chapterFormData.headImageUrl || selectedChapter?.headImageUrl || '');
  const previewChapterJoinUrl = String(chapterFormData.joinUrl || selectedChapter?.joinUrl || '');
  const previewChapterJoinDescription = String(
    chapterFormData.joinCtaDescription ||
    selectedChapter?.joinCtaDescription ||
    `Become a volunteer and make a direct impact in ${previewChapterLocation}.`
  );
  const previewChapterActivities = Array.isArray(chapterFormData.activities)
    ? chapterFormData.activities
    : (selectedChapter?.activities || []);

  const renderMiniClientSidePreview = () => (
    <div className="bg-white/5 rounded-2xl border border-white/10 p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-bold uppercase tracking-wider text-primary-cyan">Mini Client-Side Preview</h4>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">Read-only</span>
      </div>
      <p className="mt-2 text-sm text-white/60">
        This preview mirrors the chapter page layout your visitors see on the client side.
      </p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#020b1f]">
        <div className="relative h-44 overflow-hidden">
          <img
            src={convertToCORSFreeLink(previewChapterCover) || 'https://picsum.photos/1200/600'}
            alt={`${previewChapterName} cover preview`}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ocean-deep via-ocean-deep/70 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 p-4 md:p-5">
            <div className="h-16 w-16 overflow-hidden rounded-full border-2 border-white/30 bg-white/10 p-1 backdrop-blur-sm">
              <img
                src={convertToCORSFreeLink(previewChapterLogo) || `https://ui-avatars.com/api/?name=${encodeURIComponent(previewChapterName)}`}
                alt={`${previewChapterName} logo preview`}
                className="h-full w-full rounded-full object-cover"
              />
            </div>
            <div className="min-w-0 text-white">
              <h5 className="truncate text-xl font-black md:text-2xl">{previewChapterName}</h5>
              <div className="mt-1 flex items-center gap-2 text-sm text-white/85">
                <MapPin size={14} className="text-primary-cyan" />
                <span className="truncate">{previewChapterLocation}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3 md:p-5">
          <div className="space-y-4 md:col-span-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h6 className="text-sm font-bold text-white">About the Chapter</h6>
              <p className="mt-2 text-sm leading-relaxed text-white/80 whitespace-pre-wrap text-justify">
                {previewChapterDescription}
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h6 className="text-sm font-bold text-white">Recent Activities</h6>
              {previewChapterActivities.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {previewChapterActivities.slice(0, 2).map((activity, index) => (
                    <div key={`${activity.id || index}`} className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex gap-3">
                        <div className="h-14 w-14 overflow-hidden rounded-md border border-white/10 bg-black/20">
                          {activity.imageUrl ? (
                            <img
                              src={convertToCORSFreeLink(String(activity.imageUrl))}
                              alt={`${activity.title || 'Activity'} preview`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-white/35">No image</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{activity.title || 'Untitled Activity'}</p>
                          {!!activity.date && <p className="mt-1 text-xs text-primary-cyan">{formatActivityDateInManila_(activity.date)}</p>}
                          <p className="mt-1 line-clamp-2 text-xs text-white/70 text-justify whitespace-pre-line">
                            {activity.description || 'No description provided.'}
                          </p>
                          {!!String(activity.learnMoreUrl || '').trim() && (
                            <p className="mt-1 text-[11px] font-semibold text-primary-cyan">Learn More link available</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-white/50">No recent activities posted yet.</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <h6 className="text-sm font-bold text-white">Get in Touch</h6>
              <ul className="mt-3 space-y-2 text-xs text-white/80">
                {!!previewChapterEmail && (
                  <li className="flex items-center gap-2"><Mail size={13} className="text-primary-cyan" /> <span className="truncate">{previewChapterEmail}</span></li>
                )}
                {!!previewChapterPhone && (
                  <li className="flex items-center gap-2"><Phone size={13} className="text-primary-cyan" /> <span>{previewChapterPhone}</span></li>
                )}
                <li className="flex items-center gap-2"><MapPin size={13} className="text-primary-cyan" /> <span>{previewChapterLocation}</span></li>
                {!!previewChapterWebsite && (
                  <li className="flex items-center gap-2"><Globe size={13} className="text-primary-cyan" /> <span className="truncate">Website available</span></li>
                )}
              </ul>
            </div>

            {(previewChapterHeadName || previewChapterHeadQuote) && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <h6 className="text-sm font-bold text-white">Chapter Leadership</h6>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-10 w-10 overflow-hidden rounded-full border border-white/10 bg-black/20">
                    <img
                      src={convertToCORSFreeLink(previewChapterHeadImage) || `https://ui-avatars.com/api/?name=${encodeURIComponent(previewChapterHeadName || 'Head')}`}
                      alt={`${previewChapterHeadName || 'Chapter head'} preview`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-white">{previewChapterHeadName || 'Leader'}</p>
                    <p className="truncate text-[11px] text-primary-cyan">{previewChapterHeadRole || 'Chapter Head'}</p>
                  </div>
                </div>
                {!!previewChapterHeadQuote && (
                  <p className="mt-2 text-xs italic text-white/70 whitespace-pre-wrap text-justify">
                    "{previewChapterHeadQuote}"
                  </p>
                )}
              </div>
            )}

            {!!previewChapterJoinUrl && (
              <div className="rounded-xl bg-gradient-to-br from-primary-blue to-primary-cyan p-4 text-white">
                <h6 className="text-sm font-black">Join {previewChapterName}</h6>
                <p className="mt-2 text-xs opacity-90 whitespace-pre-wrap text-justify">{previewChapterJoinDescription}</p>
                <div className="mt-3 rounded-md bg-white px-3 py-2 text-center text-xs font-bold text-primary-blue">
                  Sign Up Now
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );


  // --- RENDER ---
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm transition-opacity duration-300 sm:p-3 md:p-4 ${isModalVisible ? 'opacity-100' : 'opacity-0'}`}>
      
      <div className={`relative flex max-h-[98vh] w-full max-w-[98vw] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f172a] shadow-2xl transition-all duration-300 sm:max-h-[95vh] sm:max-w-6xl sm:rounded-3xl ${isModalVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-95 opacity-0'}`}>
        
        {/* Header Section - Responsive */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-white/5 p-4 sm:gap-3 sm:p-5 md:p-6">
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0">
            {view !== 'LIST' && (
              <button 
                onClick={() => {
                  setView('LIST');
                  setSelectedChapter(null);
                }}
                className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors flex-shrink-0"
              >
                <ChevronLeft size={20} className="sm:w-6 sm:h-6" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2 sm:gap-3 truncate">
                <Globe className="text-primary-cyan flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6" />
                <span className="truncate">
                  {view === 'LIST' ? 'Chapter Management' : selectedChapter?.name || 'New Chapter'}
                </span>
              </h2>
              <p className="text-white/50 text-xs sm:text-sm mt-0.5 sm:mt-1 truncate">
                {view === 'LIST' 
                  ? 'Manage local chapters and their member accounts' 
                  : (selectedChapter?.id || 'ID will be generated on save')}
              </p>
            </div>
          </div>
          
          <button 
            onClick={requestCloseManagementModal}
            className="p-1.5 sm:p-2 rounded-full hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors flex-shrink-0"
          >
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        {/* Content Body - Responsive padding */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-gray-950/40 p-4 sm:p-5 md:p-6">
          
          {loading ? (
            <div className="space-y-4 sm:space-y-6">
              <div className="flex justify-end">
                <SkeletonBlock className="h-10 sm:h-12 w-40 sm:w-44 rounded-lg sm:rounded-xl" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="group relative bg-white/5 border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6 flex flex-col h-full">
                    <div className="flex items-start justify-between mb-3 sm:mb-4 w-full">
                      <SkeletonCircle className="w-12 sm:w-14 h-12 sm:h-14" />
                      <SkeletonBlock className="h-5 sm:h-6 w-16 sm:w-20 rounded-full" />
                    </div>
                    <SkeletonBlock className="mb-2 sm:mb-3 h-6 sm:h-7 w-32 sm:w-40" />
                    <SkeletonBlock className="mb-3 sm:mb-4 h-3 sm:h-4 w-28 sm:w-32" />
                    <SkeletonBlock className="mb-3 sm:mb-4 h-2.5 sm:h-3 w-40 sm:w-48" />
                    <SkeletonBlock className="mt-auto h-14 sm:h-16 w-full rounded-lg sm:rounded-xl" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* VIEW: LIST */}
              {view === 'LIST' && (
                <div className="space-y-6">
                  <div className="flex justify-end">
                    <button 
                      onClick={() => {
                        setChapterFormData({});
                        setVisibleChapterActivityCount(CHAPTER_ACTIVITY_INITIAL_VISIBLE_COUNT);
                        closeChapterActivityEditor();
                        setView('CREATE_CHAPTER');
                      }}
                      className="flex items-center gap-2 bg-primary-cyan hover:bg-cyan-400 text-ocean-deep font-bold px-6 py-3 rounded-xl transition-all shadow-lg shadow-cyan-500/20"
                    >
                      <Plus size={20} /> Add New Chapter
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {chapters.map(chapter => {
                      const chapterLogo = (chapter as any).logo || (chapter as any).logoUrl || '';
                      const avatarFallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(chapter.name || 'Chapter')}&background=random`;
                      return (
                      <button 
                        key={chapter.id}
                        onClick={() => handleChapterClick(chapter)}
                        className="group relative bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all text-left hover:border-primary-cyan/50 hover:shadow-[0_0_30px_rgba(34,211,238,0.1)] flex flex-col h-full"
                      >
                         <div className="flex items-start justify-between mb-4 w-full">
                            <div className="w-14 h-14 rounded-full bg-black/30 border border-white/20 flex items-center justify-center overflow-hidden">
                              {chapterLogo ? (
                                <img
                                  src={convertToCORSFreeLink(chapterLogo)}
                                  alt={`${chapter.name} chapter logo`}
                                  referrerPolicy="no-referrer"
                                  onError={(event) => {
                                    console.error('[ChaptersManagement] Chapter card logo failed to load', {
                                      chapterId: chapter.id,
                                      chapterName: chapter.name,
                                      image: getImageDebugInfo(chapterLogo),
                                      attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src
                                    });
                                    event.currentTarget.src = avatarFallback;
                                  }}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Globe className="text-white/40" size={24} />
                              )}
                            </div>
                            <span className="bg-primary-blue/20 text-blue-300 text-xs font-bold px-3 py-1 rounded-full">
                              {users.filter(u => u.chapterId === chapter.id).length} Users
                            </span>
                         </div>
                         
                         <h3 className="text-xl font-bold text-white mb-2 group-hover:text-primary-cyan transition-colors">
                           {chapter.name}
                         </h3>
                         <div className="flex items-center gap-2 text-white/50 text-xs mb-4">
                           <MapPin size={12} /> {chapter.location || 'No location set'}
                         </div>
                         <div className="text-[10px] text-white/30 font-mono mb-4 truncate">
                           ID: {chapter.id}
                         </div>
                         
                         <p className="text-white/60 text-sm line-clamp-2 mt-auto border-t border-white/10 pt-4 whitespace-pre-line text-justify">
                           {chapter.description || "No description available."}
                         </p>
                      </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* VIEW: CREATE / EDIT */}
              {(view === 'CREATE_CHAPTER' || view === 'CHAPTER_DETAIL') && (
                <div className="max-w-5xl mx-auto">
                  
                  {/* Tabs */}
                  {view === 'CHAPTER_DETAIL' && (
                    <div className="flex gap-2 mb-8 border-b border-white/10 pb-1">
                      <button 
                        onClick={() => setActiveTab('DETAILS')}
                        className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'DETAILS' ? 'border-primary-cyan text-primary-cyan' : 'border-transparent text-white/50 hover:text-white'}`}
                      >
                        Chapter Details
                      </button>
                      <button
                        onClick={() => setActiveTab('CONTENT')}
                        className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'CONTENT' ? 'border-primary-cyan text-primary-cyan' : 'border-transparent text-white/50 hover:text-white'}`}
                      >
                        Content & Uploads
                      </button>
                      <button 
                        onClick={() => setActiveTab('MEMBERS')}
                        className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'MEMBERS' ? 'border-primary-cyan text-primary-cyan' : 'border-transparent text-white/50 hover:text-white'}`}
                      >
                        Members ({chapterUsers.length + generalUsers.length})
                      </button>
                    </div>
                  )}

                  {activeTab === 'DETAILS' && view === 'CHAPTER_DETAIL' && (
                    <div className="space-y-6">
                      {renderMiniClientSidePreview()}
                    </div>
                  )}

                  {/* FORM: Content & Uploads */}
                  {(activeTab === 'CONTENT' || view === 'CREATE_CHAPTER') && (
                    <div className="bg-white dark:bg-[#051923] rounded-2xl shadow-lg border border-white/10 p-6 sm:p-8 space-y-6">
                      <div className="flex items-center justify-between gap-3 border-b border-gray-200/70 pb-4 dark:border-white/10">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Chapter Content Editor</h3>
                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary-cyan">Match Chapter Editor UI</span>
                      </div>
                      {/* ... (Details form remains the same) ... */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Chapter Name</label>
                          <input 
                            value={chapterFormData.name || ''} 
                            onChange={e => setChapterFormData({...chapterFormData, name: e.target.value})}
                              className="w-full p-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:border-primary-cyan focus:outline-none"
                            placeholder="e.g. Tagum City Chapter"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Location</label>
                          <div className="relative">
                            <MapPin size={16} className="absolute left-4 top-3.5 text-white/40" />
                            <input 
                              value={chapterFormData.location || ''} 
                              onChange={e => setChapterFormData({...chapterFormData, location: e.target.value})}
                              className="w-full p-3 pl-10 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:border-primary-cyan focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="md:col-span-2 space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Description</label>
                          <textarea 
                            value={chapterFormData.description || ''} 
                            onChange={e => setChapterFormData({...chapterFormData, description: e.target.value})}
                            className="w-full p-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white h-32 resize-none focus:border-primary-cyan focus:outline-none"
                          />
                        </div>

                        {/* Contact Info Group */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Email</label>
                          <div className="relative">
                            <Mail size={16} className="absolute left-4 top-3.5 text-white/40" />
                            <input 
                              value={chapterFormData.email || ''} 
                              onChange={e => setChapterFormData({...chapterFormData, email: e.target.value})}
                              className="w-full p-3 pl-10 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:border-primary-cyan focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Phone</label>
                          <div className="relative">
                            <Phone size={16} className="absolute left-4 top-3.5 text-white/40" />
                            <input 
                              value={chapterFormData.phone || ''} 
                              onChange={e => setChapterFormData({...chapterFormData, phone: e.target.value})}
                              className="w-full p-3 pl-10 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:border-primary-cyan focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Social Media URL</label>
                          <div className="relative">
                            <Globe size={16} className="absolute left-4 top-3.5 text-white/40" />
                            <input 
                              value={chapterFormData.facebook || ''} 
                              onChange={e => setChapterFormData({...chapterFormData, facebook: e.target.value})}
                              className="w-full p-3 pl-10 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:border-primary-cyan focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Website URL</label>
                          <div className="relative">
                            <Globe size={16} className="absolute left-4 top-3.5 text-white/40" />
                            <input 
                              value={chapterFormData.websiteUrl || ''} 
                              onChange={e => setChapterFormData({...chapterFormData, websiteUrl: e.target.value})}
                              className="w-full p-3 pl-10 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:border-primary-cyan focus:outline-none"
                              placeholder="https://example.org"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Twitter URL</label>
                          <div className="relative">
                            <Globe size={16} className="absolute left-4 top-3.5 text-white/40" />
                            <input
                              value={chapterFormData.twitter || ''}
                              onChange={e => setChapterFormData({...chapterFormData, twitter: e.target.value})}
                              className="w-full p-3 pl-10 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:border-primary-cyan focus:outline-none"
                              placeholder="https://x.com/yourchapter"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Instagram URL</label>
                          <div className="relative">
                            <Globe size={16} className="absolute left-4 top-3.5 text-white/40" />
                            <input
                              value={chapterFormData.instagram || ''}
                              onChange={e => setChapterFormData({...chapterFormData, instagram: e.target.value})}
                              className="w-full p-3 pl-10 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:border-primary-cyan focus:outline-none"
                              placeholder="https://instagram.com/yourchapter"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Join URL</label>
                          <div className="relative">
                            <Globe size={16} className="absolute left-4 top-3.5 text-white/40" />
                            <input
                              value={chapterFormData.joinUrl || ''}
                              onChange={e => setChapterFormData({...chapterFormData, joinUrl: e.target.value})}
                              className="w-full p-3 pl-10 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:border-primary-cyan focus:outline-none"
                              placeholder="https://..."
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Join CTA Description</label>
                          <textarea
                            value={chapterFormData.joinCtaDescription || ''}
                            onChange={e => setChapterFormData({...chapterFormData, joinCtaDescription: e.target.value})}
                            className="w-full p-3 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white h-24 resize-none focus:border-primary-cyan focus:outline-none"
                            placeholder="Short call-to-action text shown near the join link"
                          />
                        </div>
                        
                        {/* Logo Upload Section */}
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Chapter Logo</label>
                          <div className="flex items-start gap-4">
                            {/* Preview */}
                            <div className="w-20 h-20 rounded-lg bg-black/20 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                               {chapterImagePreviews.logo || chapterFormData.logo ? (
                                 <img
                                   src={chapterImagePreviews.logo || convertToCORSFreeLink(chapterFormData.logo as string)}
                                   alt={`${chapterFormData.name || 'Chapter'} logo preview`}
                                   referrerPolicy="no-referrer"
                                   onError={(event) => {
                                     console.error('[ChaptersManagement] Chapter logo preview failed to load', {
                                       chapterId: selectedChapter?.id,
                                       chapterName: chapterFormData.name,
                                       image: getImageDebugInfo(chapterFormData.logo as string),
                                       attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src
                                     });
                                     event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(String(chapterFormData.name || 'Chapter'))}&background=random`;
                                   }}
                                   className="w-full h-full object-cover"
                                 />
                               ) : (
                                 <ImageIcon className="text-white/20" />
                               )}
                            </div>
                            
                            {/* Upload Button */}
                            <div className="flex-1">
                               <label className={`flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-primary-cyan/50 hover:bg-white/5 transition-colors ${isUploadingLogo ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                  <input 
                                    type="file" 
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleLogoUpload}
                                    disabled={isUploadingLogo}
                                  />
                                  <div className="flex items-center gap-2 text-white/60">
                                     {isUploadingLogo ? (
                                        <>
                                           <Loader className="animate-spin" size={18} />
                                         <span className="text-sm">Processing...</span>
                                        </>
                                     ) : (
                                        <>
                                           <Upload size={18} />
                                           <span className="text-sm font-medium">Upload Image</span>
                                        </>
                                     )}
                                  </div>
                               </label>
                               <p className="text-[10px] text-white/30 mt-1 pl-1">
                                  Supported: JPG, PNG, WebP. Max 5MB.
                               </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Chapter Cover Image</label>
                          <div className="flex items-start gap-4">
                            <div className="w-20 h-20 rounded-lg bg-black/20 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                              {chapterImagePreviews.image || chapterFormData.image || chapterFormData.imageUrl ? (
                                <img
                                  src={chapterImagePreviews.image || convertToCORSFreeLink(String(chapterFormData.image || chapterFormData.imageUrl))}
                                  alt={`${chapterFormData.name || 'Chapter'} cover preview`}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="text-white/20" />
                              )}
                            </div>
                            <div className="flex-1">
                              <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-primary-cyan/50 hover:bg-white/5 transition-colors">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => void handleChapterImageFieldUpload(e, 'image')}
                                />
                                <div className="flex items-center gap-2 text-white/60">
                                  <Upload size={18} />
                                  <span className="text-sm font-medium">Upload Cover</span>
                                </div>
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="md:col-span-2 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-5 space-y-4">
                          <div>
                            <h4 className="text-sm font-bold uppercase tracking-wider text-primary-cyan">Chapter Leadership</h4>
                            <p className="mt-1 text-xs text-gray-500 dark:text-white/50">Manage the chapter head profile shown on chapter pages.</p>
                          </div>

                          <div className="grid grid-cols-1 gap-4 md:grid-cols-[120px_1fr]">
                            <div className="space-y-2">
                              <div className="h-28 w-28 rounded-xl bg-black/20 border border-gray-200 dark:border-white/10 flex items-center justify-center overflow-hidden">
                                {chapterImagePreviews.headImageUrl || chapterFormData.headImageUrl ? (
                                  <img
                                    src={chapterImagePreviews.headImageUrl || convertToCORSFreeLink(String(chapterFormData.headImageUrl))}
                                    alt={`${chapterFormData.name || 'Chapter'} head preview`}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <ImageIcon className="text-white/20" />
                                )}
                              </div>
                              <label className="block cursor-pointer text-center text-xs font-semibold text-primary-cyan hover:text-cyan-300">
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => void handleChapterImageFieldUpload(e, 'headImageUrl')}
                                />
                                Upload Headshot
                              </label>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div className="space-y-2 md:col-span-1">
                                <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Chapter Head Name</label>
                                <input
                                  value={chapterFormData.headName || ''}
                                  onChange={e => setChapterFormData({...chapterFormData, headName: e.target.value})}
                                  className="w-full p-3 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:border-primary-cyan focus:outline-none"
                                  placeholder="Enter chapter head name"
                                />
                              </div>

                              <div className="space-y-2 md:col-span-1">
                                <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Chapter Head Role</label>
                                <input
                                  value={chapterFormData.headRole || ''}
                                  onChange={e => setChapterFormData({...chapterFormData, headRole: e.target.value})}
                                  className="w-full p-3 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white focus:border-primary-cyan focus:outline-none"
                                  placeholder="e.g. Chapter President"
                                />
                              </div>

                              <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-bold text-primary-cyan uppercase tracking-wider">Chapter Head Quote</label>
                                <textarea
                                  value={chapterFormData.headQuote || ''}
                                  onChange={e => setChapterFormData({...chapterFormData, headQuote: e.target.value})}
                                  className="w-full p-3 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-gray-900 dark:text-white h-24 resize-none focus:border-primary-cyan focus:outline-none"
                                  placeholder="Inspirational message from the chapter head"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="md:col-span-2 space-y-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-5">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-bold uppercase tracking-wider text-primary-cyan">Uploaded Activities</h4>
                              <p className="mt-1 text-xs text-white/50">Manage chapter activity entries with the same card-and-modal workflow as Pillars.</p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <button
                              type="button"
                              onClick={addChapterActivity}
                              className="w-full rounded-xl border border-dashed border-primary-blue/60 bg-primary-blue/5 p-4 text-left transition-colors hover:bg-primary-blue/10 dark:border-primary-cyan/60 dark:bg-primary-cyan/5 dark:hover:bg-primary-cyan/10"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-blue text-white dark:bg-primary-cyan dark:text-[#04131a]">
                                  <Plus className="h-5 w-5" />
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900 dark:text-white">Add Activity</p>
                                  <p className="text-xs text-gray-600 dark:text-gray-300">Create a new activity card.</p>
                                </div>
                              </div>
                            </button>

                            {(() => {
                              const chapterActivities = getChapterActivities_();
                              const visibleActivities = chapterActivities.slice(0, visibleChapterActivityCount);
                              const hasHiddenActivities = chapterActivities.length > visibleActivities.length;

                              return (
                                <>
                                  {visibleActivities.map((activity, activityIndex) => (
                                    <div
                                      key={`chapter-activity:${activity.id || activityIndex}`}
                                      className="rounded-xl border border-gray-200 dark:border-gray-700 p-4"
                                    >
                                      <div className="flex items-start gap-3">
                                        <button
                                          type="button"
                                          onClick={() => openChapterActivityEditor(activityIndex)}
                                          className="flex w-full min-w-0 items-center gap-4 text-left"
                                        >
                                          <div className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                                            <img
                                              src={convertToCORSFreeLink(String(activity.imageUrl || ''))}
                                              alt={`${activity.title || 'Chapter activity'} preview image`}
                                              onError={(event) => {
                                                event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(activity.title || 'Activity')}&background=0f172a&color=ffffff&size=512`;
                                              }}
                                              className="h-full w-full object-cover"
                                            />
                                          </div>

                                          <div className="min-w-0 flex-1">
                                            <h4 className="line-clamp-1 font-semibold text-gray-900 dark:text-white">
                                              {truncateText_(activity.title || `Activity ${activityIndex + 1}`, 80)}
                                            </h4>
                                          </div>
                                        </button>

                                        <button
                                          onClick={() => void removeChapterActivity(activityIndex)}
                                          className="p-1 rounded text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                        >
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}

                                  {chapterActivities.length === 0 && (
                                    <div className="rounded-lg border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/45">
                                      No uploaded activities yet.
                                    </div>
                                  )}

                                  {hasHiddenActivities && (
                                    <button
                                      type="button"
                                      onClick={() => setVisibleChapterActivityCount((current) => current + CHAPTER_ACTIVITY_INITIAL_VISIBLE_COUNT)}
                                      className="w-full rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                                    >
                                      Load More Activities
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          {renderMiniClientSidePreview()}
                        </div>

                      </div>

                      <div className="pt-6 border-t border-white/10 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        {view === 'CHAPTER_DETAIL' ? (
                          <button 
                            onClick={() => handleDeleteChapter(selectedChapter!.id)}
                            className="flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors text-sm font-bold w-fit"
                          >
                            <Trash2 size={16} /> Delete Chapter
                          </button>
                        ) : (
                          <div className="hidden sm:block" />
                        )}
                        
                        <div className="flex w-full sm:w-auto flex-col-reverse sm:flex-row gap-3 sm:gap-4 sm:justify-end">
                          <button onClick={() => { clearPendingChapterImages(); setView('LIST'); }} className="text-white/60 hover:text-white px-4 py-2 w-full sm:w-auto">Cancel</button>
                          <button 
                            onClick={handleSaveChapter}
                            disabled={isSavingChapter}
                            className="bg-primary-cyan text-ocean-deep font-bold px-6 py-2 rounded-lg hover:bg-cyan-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed w-full sm:w-auto"
                          >
                            {isSavingChapter ? (
                              <>
                                <Loader className="animate-spin" size={18} /> Saving...
                              </>
                            ) : (
                              <>
                                <Save size={18} /> Save Details
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MEMBERS TAB (Nested Sub-Tabs) */}
                  {activeTab === 'MEMBERS' && view === 'CHAPTER_DETAIL' && (
                    <div className="space-y-6">
                      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-1">
                        <button
                          type="button"
                          onClick={() => setActiveMemberSubTab('GENERAL')}
                          className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-colors ${activeMemberSubTab === 'GENERAL' ? 'border-primary-cyan text-primary-cyan' : 'border-transparent text-white/50 hover:text-white'}`}
                        >
                          General Members ({generalUsers.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMemberSubTab('CHAPTER')}
                          className={`px-4 py-2 text-xs sm:text-sm font-bold border-b-2 transition-colors ${activeMemberSubTab === 'CHAPTER' ? 'border-primary-cyan text-primary-cyan' : 'border-transparent text-white/50 hover:text-white'}`}
                        >
                          Chapter Members ({chapterUsers.length})
                        </button>
                      </div>

                      {activeMemberSubTab === 'CHAPTER' && (
                        <>
                          <div className="flex justify-between items-center bg-white/5 p-6 rounded-2xl border border-white/10">
                            <div>
                              <h3 className="text-lg font-bold text-white">Chapter Members</h3>
                              <p className="text-white/50 text-sm">Users who can manage this specific chapter, including chapter heads and chapter editors</p>
                            </div>
                            <button
                              onClick={openCreateChapterUserModal}
                              className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors border border-white/10"
                            >
                              <UserPlus size={18} /> Add Member
                            </button>
                          </div>

                          <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                            {chapterUsers.length === 0 ? (
                              <div className="p-12 text-center text-white/40">
                                <Users size={48} className="mx-auto mb-4 opacity-30" />
                                <p>No chapter head, chapter editor, or members assigned to this chapter yet.</p>
                              </div>
                            ) : (
                              <table className="w-full text-left">
                                <thead className="bg-black/20 text-xs uppercase text-white/40">
                                  <tr>
                                    <th className="px-6 py-4">User</th>
                                    <th className="px-6 py-4">Role</th>
                                    <th className="px-6 py-4">Email</th>
                                    <th className="px-6 py-4 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {chapterUsers.map(user => (
                                    <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                      <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                          <img
                                            src={`https://ui-avatars.com/api/?name=${user.username}&background=random&color=fff`}
                                            alt={`Profile avatar for ${user.username}`}
                                            className="w-8 h-8 rounded-full border border-white/20"
                                          />
                                          <span className="text-white font-medium">{user.username}</span>
                                        </div>
                                      </td>
                                      <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs border ${
                                          user.role === 'admin'
                                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/20'
                                            : user.role === 'pillar_editor'
                                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/20'
                                            : user.role === 'editor'
                                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/20'
                                            : user.role === 'chapter_head'
                                            ? 'bg-primary-cyan/20 text-cyan-300 border-primary-cyan/20'
                                            : 'bg-white/10 text-white/70 border-white/10'
                                        }`}>
                                          {user.role}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-white/60 text-sm">{user.email}</td>
                                      <td className="px-6 py-4 text-right">
                                        <button
                                          onClick={() => openEditUserModal(user)}
                                          className="text-white/30 hover:text-white transition-colors"
                                        >
                                          <Edit2 size={16} />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </>
                      )}

                      {activeMemberSubTab === 'GENERAL' && (
                        <>
                          <div className="bg-white/5 p-6 rounded-2xl border border-white/10 flex items-center justify-between gap-4">
                            <div>
                              <h3 className="text-lg font-bold text-white">General Members</h3>
                              <p className="text-white/50 text-sm">
                                Accounts without a chapter assignment, including admins and global editors.
                              </p>
                            </div>
                            <button
                              onClick={openCreateGeneralUserModal}
                              className="bg-primary-cyan hover:bg-cyan-400 text-ocean-deep font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                            >
                              <UserPlus size={16} /> Add New User
                            </button>
                          </div>

                          <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                            {generalUsers.length === 0 ? (
                              <div className="p-12 text-center text-white/40">
                                <Users size={48} className="mx-auto mb-4 opacity-30" />
                                <p>No general members or unassigned accounts found.</p>
                              </div>
                            ) : (
                              <table className="w-full text-left">
                                <thead className="bg-black/20 text-xs uppercase text-white/40">
                                  <tr>
                                    <th className="px-6 py-4">User</th>
                                    <th className="px-6 py-4">Role</th>
                                    <th className="px-6 py-4">Email</th>
                                    <th className="px-6 py-4">Assignment</th>
                                    <th className="px-6 py-4 text-right">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {generalUsers.map(user => (
                                    <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                      <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                          <img
                                            src={`https://ui-avatars.com/api/?name=${user.username}&background=random&color=fff`}
                                            alt={`Profile avatar for ${user.username}`}
                                            className="w-8 h-8 rounded-full border border-white/20"
                                          />
                                          <span className="text-white font-medium">{user.username}</span>
                                        </div>
                                      </td>
                                      <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs border ${
                                          user.role === 'admin'
                                            ? 'bg-purple-500/20 text-purple-300 border-purple-500/20'
                                            : user.role === 'editor'
                                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/20'
                                            : 'bg-white/10 text-white/70 border-white/10'
                                        }`}>
                                          {user.role}
                                        </span>
                                      </td>
                                      <td className="px-6 py-4 text-white/60 text-sm">{user.email}</td>
                                      <td className="px-6 py-4 text-white/40 text-sm">
                                        {user.role === 'pillar_editor'
                                          ? `Pillar: ${pillars.find((pillar) => String(pillar.id) === String(user.pillarId))?.title || user.pillarId || 'Unassigned'}`
                                          : 'No chapter assigned'}
                                      </td>
                                      <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-3">
                                          <button
                                            onClick={() => handleAssignGeneralUserToSelectedChapter(user)}
                                            disabled={user.role === 'admin' || user.role === 'pillar_editor'}
                                            className="text-xs px-3 py-1.5 rounded-md border border-primary-cyan/40 text-primary-cyan hover:bg-primary-cyan/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                          >
                                            {user.role === 'admin'
                                              ? 'Admins stay global'
                                              : user.role === 'pillar_editor'
                                                ? 'Pillar-scoped account'
                                                : `Assign to ${selectedChapter?.name}`}
                                          </button>
                                          <button
                                            onClick={() => openEditUserModal(user)}
                                            className="text-white/30 hover:text-white transition-colors"
                                          >
                                            <Edit2 size={16} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {activeChapterActivityEditor && chapterActivityDraft && (
        <div className={`fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 md:p-6 transition-opacity duration-300 ${isChapterActivityEditorVisible ? 'opacity-100' : 'opacity-0'}`}>
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeChapterActivityEditor}
            aria-label="Close activity editor"
          />

          <div className={`relative z-10 w-full max-w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[95vh] sm:max-h-[92vh] overflow-y-auto rounded-2xl sm:rounded-2xl border border-gray-200 bg-white px-4 sm:px-6 md:px-8 py-4 sm:py-6 shadow-2xl transition-all duration-300 dark:border-gray-700 dark:bg-gray-900 ${isChapterActivityEditorVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-95 opacity-0'}`}>
            <button
              type="button"
              onClick={closeChapterActivityEditor}
              aria-label="Close activity editor"
              className="absolute right-3 sm:right-4 top-3 sm:top-4 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>

            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white pr-10">{activeChapterActivityEditor.isNew ? 'Add Activity' : 'Edit Activity'}</h3>
            <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {activeChapterActivityEditor.isNew
                ? 'Complete this panel and save to create a new chapter activity card.'
                : 'Save this panel to update only this chapter activity.'}
            </p>

            <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
              <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                <img
                  src={convertToCORSFreeLink(String(chapterActivityDraft.imageUrl || ''))}
                  alt={`${chapterActivityDraft.title || 'Chapter activity'} image preview`}
                  onError={(event) => {
                    event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(chapterActivityDraft.title || 'Activity')}&background=0f172a&color=ffffff&size=512`;
                  }}
                  className="w-full h-full object-cover"
                />
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleChapterActivityImageUpload(file);
                    }}
                    className="hidden"
                  />
                  <div className="text-white text-center">
                    <Upload className="w-5 h-5 sm:w-6 sm:h-6 mx-auto mb-1" />
                    <span className="text-[11px] sm:text-xs font-medium">Change Image</span>
                  </div>
                </label>
              </div>

              <input
                type="text"
                value={chapterActivityDraft.title || ''}
                onChange={(e) => setChapterActivityDraft({ ...chapterActivityDraft, title: e.target.value })}
                placeholder="Activity title"
                className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-cyan/50"
              />

              <input
                type="text"
                value={chapterActivityDraft.date || ''}
                onChange={(e) => setChapterActivityDraft({ ...chapterActivityDraft, date: e.target.value })}
                placeholder="Date (e.g., 2026-02-28T16:00:00.000Z or March 01, 2026)"
                className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-cyan/50"
              />

              <textarea
                value={chapterActivityDraft.description || ''}
                onChange={(e) => setChapterActivityDraft({ ...chapterActivityDraft, description: e.target.value })}
                placeholder="Activity description"
                rows={4}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-cyan/50 resize-none"
              />

              <input
                type="url"
                value={chapterActivityDraft.learnMoreUrl || ''}
                onChange={(e) => setChapterActivityDraft({ ...chapterActivityDraft, learnMoreUrl: e.target.value })}
                placeholder="Learn More URL (Facebook, Instagram, X, website, etc.)"
                className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-cyan/50"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={closeChapterActivityEditor}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveChapterActivityDraft}
                disabled={savingChapterActivity}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-blue px-4 py-2 font-semibold text-white transition-colors hover:bg-primary-blue/90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {savingChapterActivity ? 'Saving Activity...' : activeChapterActivityEditor.isNew ? 'Create Activity' : 'Save Activity'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUB-MODAL: Add User (Nested) */}
      {isUserModalOpen && (
        <div className={`fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-sm transition-opacity duration-300 ${isUserModalVisible ? 'opacity-100' : 'opacity-0'}`}>
          <div className={`bg-[#1e293b] border border-white/20 rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 max-w-[95vw] sm:max-w-sm md:max-w-md w-full shadow-2xl max-h-[95vh] overflow-y-auto transition-all duration-300 ${isUserModalVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-95 opacity-0'}`}>
            <h3 className="text-lg sm:text-xl font-bold text-white mb-4 sm:mb-6 flex items-center gap-2">
              <UserPlus className="text-primary-cyan flex-shrink-0 sm:w-6 sm:h-6" size={20} />
              {userModalMode === 'EDIT' ? 'Edit User' : 'Add User'}
            </h3>
            
            <div className="space-y-3 sm:space-y-4">
               <div>
                 <label className="block text-xs font-bold text-white/60 mb-1 uppercase">Username</label>
                 <div className="relative">
                   <Users size={16} className="absolute left-3 top-2.5 text-white/40" />
                   <input 
                      value={userEditorForm.username}
                      onChange={e => setUserEditorForm({ ...userEditorForm, username: e.target.value })}
                      className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-xs sm:text-sm text-white focus:border-primary-cyan focus:outline-none focus:ring-1 focus:ring-primary-cyan/50"
                      placeholder="jdoe"
                   />
                 </div>
               </div>
               
               <div>
                 <label className="block text-xs font-bold text-white/60 mb-1 uppercase">Email</label>
                 <div className="relative">
                   <Mail size={16} className="absolute left-3 top-2.5 text-white/40" />
                   <input 
                      type="email"
                      value={userEditorForm.email}
                      onChange={e => setUserEditorForm({ ...userEditorForm, email: e.target.value })}
                      className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-xs sm:text-sm text-white focus:border-primary-cyan focus:outline-none focus:ring-1 focus:ring-primary-cyan/50"
                      placeholder="user@dyesabel.org"
                   />
                 </div>
               </div>
               
               {/* Password Field with Toggle */}
               <div>
                 <label className="block text-xs font-bold text-white/60 mb-1 uppercase">
                   {userModalMode === 'EDIT' ? 'New Password (Optional)' : 'Password'}
                 </label>
                 <div className="relative">
                   <Key size={16} className="absolute left-3 top-2.5 text-white/40" />
                   <input 
                      type={showPassword ? "text" : "password"}
                      value={userEditorForm.password}
                      onChange={e => setUserEditorForm({ ...userEditorForm, password: e.target.value })}
                      className="w-full bg-black/20 border border-white/10 rounded-lg pl-10 pr-10 py-2 text-xs sm:text-sm text-white focus:border-primary-cyan focus:outline-none focus:ring-1 focus:ring-primary-cyan/50"
                      placeholder={userModalMode === 'EDIT' ? 'Leave blank to keep password' : '••••••••'}
                   />
                   <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-white/40 hover:text-white"
                   >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                   </button>
                 </div>
               </div>
               
               {/* Role Selection */}
               <div className="pt-2">
                  <label className="block text-xs font-bold text-white/60 mb-1 uppercase">Role</label>
                  <div className="relative">
                    <Shield size={16} className="absolute left-3 top-3 text-primary-cyan pointer-events-none" />
                    <CustomSelect
                      value={userEditorForm.role}
                      onChange={(nextValue) => setUserEditorForm({
                        ...userEditorForm,
                        role: nextValue,
                        chapterId: nextValue === 'admin' || nextValue === 'pillar_editor' ? '' : userEditorForm.chapterId,
                        pillarId: nextValue === 'pillar_editor' ? userEditorForm.pillarId : ''
                      })}
                      options={allRoleOptions}
                      ariaLabel="Chapter member role"
                      variant="dark"
                      triggerClassName="pl-10"
                    />
                  </div>
               </div>

               {userEditorForm.role !== 'admin' && userEditorForm.role !== 'pillar_editor' && (
                 <div className="pt-2">
                   <label className="block text-xs font-bold text-white/60 mb-1 uppercase">Chapter Assignment</label>
                   <CustomSelect
                     value={userEditorForm.chapterId}
                     onChange={(nextValue) => setUserEditorForm({ ...userEditorForm, chapterId: nextValue })}
                     options={chapters.map(chapter => ({
                       value: chapter.id,
                       label: chapter.name,
                       description: chapter.location || 'No location'
                     }))}
                     ariaLabel="Chapter assignment"
                     variant="dark"
                   />
                 </div>
               )}

               {userEditorForm.role === 'pillar_editor' && (
                 <div className="pt-2">
                   <label className="block text-xs font-bold text-white/60 mb-1 uppercase">Pillar Assignment</label>
                   <CustomSelect
                     value={userEditorForm.pillarId}
                     onChange={(nextValue) => setUserEditorForm({ ...userEditorForm, pillarId: nextValue, chapterId: '' })}
                     options={pillars.map(pillar => ({
                       value: String(pillar.id),
                       label: String(pillar.title || pillar.id),
                       description: 'Only this pillar can be edited'
                     }))}
                     ariaLabel="Pillar assignment"
                     variant="dark"
                   />
                 </div>
               )}
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                onClick={closeUserModal}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-medium py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={userModalMode === 'EDIT' ? handleUpdateUser : handleAddUser}
                disabled={isSavingUser}
                className="flex-1 bg-primary-cyan hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed text-ocean-deep font-bold py-2 rounded-lg transition-colors"
              >
                {isSavingUser ? 'Saving...' : (userModalMode === 'EDIT' ? 'Save Changes' : 'Create Account')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
