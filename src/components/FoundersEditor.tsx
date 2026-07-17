import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Save, Search, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppDialog } from '../contexts/AppDialogContext';
import { ExecutiveOfficer, Founder } from '../types';
import { DataService, convertToCORSFreeLink } from '../services/DriveService';
import { getSessionToken } from '../utils/session';
import { uploadImageToDrive } from '../utils/driveUpload';

interface FoundersEditorProps {
  founders: Founder[];
  executiveOfficers: ExecutiveOfficer[];
  onSave: (payload: { founders: Founder[]; executiveOfficers: ExecutiveOfficer[] }) => void;
  onClose: () => void;
}

interface RoleGroup {
  label: string;
  options: string[];
}

const EXECUTIVE_ROLE_GROUPS: RoleGroup[] = [
  {
    label: 'Executive Officers',
    options: [
      'National Executive Director',
      'Internal Deputy Director',
      'External Deputy Director',
      'Chief-of-Staff',
      'National Secretary',
      'National Treasurer',
      'Public Relations Officer',
      'Chairperson, Advisory Council',
      'Chairperson, Board of Trustees',
      'Board Secretary'
    ]
  },
  {
    label: 'Program Directors',
    options: [
      'Program Director, Good Governance',
      'Program Director, Research, Education and Direct Action',
      'Program Director, Culture and Arts',
      'Program Director, Sustainable Livelihood',
      'Program Director, Community Health'
    ]
  },
  {
    label: 'Other Directors',
    options: [
      'Director for Creatives',
      'Director for Partnership',
      'Director for Productions Management',
      'Director for Logistics',
      'Director for Monitoring, Evaluation, and Learning'
    ]
  }
];

const ALL_EXECUTIVE_ROLES = EXECUTIVE_ROLE_GROUPS.flatMap((group) => group.options);

type DropdownDirection = 'up' | 'down';

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

export const FoundersEditor: React.FC<FoundersEditorProps> = ({
  founders,
  executiveOfficers,
  onSave,
  onClose
}) => {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useAppDialog();
  const canEdit = !!user && (user.role === 'admin' || (user.role === 'editor' && !user.chapterId));
  const getAvatarUrl = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0D8ABC&color=fff&size=256&bold=true`;
  const [editedFounders, setEditedFounders] = useState<Founder[]>(founders);
  const [editedExecutiveOfficers, setEditedExecutiveOfficers] = useState<ExecutiveOfficer[]>(executiveOfficers);
  const [saving, setSaving] = useState(false);
  const [pendingProfileImages, setPendingProfileImages] = useState<Record<string, { file: File; oldFileId?: string }>>({});
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [dropdownDirection, setDropdownDirection] = useState<DropdownDirection>('down');
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const [roleSearch, setRoleSearch] = useState('');
  const [customRoleMode, setCustomRoleMode] = useState<Record<string, boolean>>({});
  const [isModalVisible, setIsModalVisible] = useState(false);
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dropdownMenuRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const modalTransitionMs = 300;

  if (!canEdit) {
    return null;
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!openDropdownId) return;
      const container = dropdownRefs.current[openDropdownId];
      const menu = dropdownMenuRef.current;
      const target = event.target as Node;

      if (container && !container.contains(target) && (!menu || !menu.contains(target))) {
        setOpenDropdownId(null);
        setDropdownPosition(null);
        setRoleSearch('');
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdownId(null);
        setDropdownPosition(null);
        setRoleSearch('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openDropdownId]);

  useEffect(() => {
    const entryTimer = window.setTimeout(() => setIsModalVisible(true), 10);

    return () => {
      window.clearTimeout(entryTimer);
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyPaddingRight = document.body.style.paddingRight;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.paddingRight = originalBodyPaddingRight;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    if (!openDropdownId) return;

    const updateDropdownPosition = () => {
      const container = dropdownRefs.current[openDropdownId];
      const rect = container?.getBoundingClientRect();
      if (!rect) return;

      const menuHeight = 360;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const horizontalMargin = 16;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const direction = spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'up' : 'down';
      const width = Math.min(rect.width, viewportWidth - horizontalMargin * 2);
      const left = Math.min(
        Math.max(rect.left, horizontalMargin),
        Math.max(horizontalMargin, viewportWidth - width - horizontalMargin)
      );
      const top = direction === 'up' ? rect.top - 8 : rect.bottom + 8;

      setDropdownDirection(direction);
      setDropdownPosition({ top, left, width });
    };

    updateDropdownPosition();

    const handleWindowScroll = (event: Event) => {
      const target = event.target as Node | null;

      // Ignore scroll events from inside the dropdown menu so its own
      // results list can scroll without constantly re-positioning.
      if (target && dropdownMenuRef.current?.contains(target)) {
        return;
      }

      updateDropdownPosition();
    };

    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', handleWindowScroll, true);

    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', handleWindowScroll, true);
    };
  }, [openDropdownId]);

  const updateFounder = (index: number, field: keyof Founder, value: string) => {
    setEditedFounders((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const updateExecutiveOfficer = (index: number, field: keyof ExecutiveOfficer, value: string) => {
    setEditedExecutiveOfficers((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addFounder = () => {
    setEditedFounders((current) => [
      ...current,
      {
        id: `founder-${Date.now()}`,
        name: '',
        role: '',
        bio: '',
        imageUrl: ''
      }
    ]);
  };

  const addExecutiveOfficer = () => {
    const nextId = `executive-${Date.now()}`;
    setEditedExecutiveOfficers((current) => [
      ...current,
      {
        id: nextId,
        name: '',
        role: '',
        imageUrl: ''
      }
    ]);
    setCustomRoleMode((current) => ({ ...current, [nextId]: false }));
  };

  const removeFounder = async (index: number) => {
    const shouldRemove = await showConfirm('Are you sure you want to remove this founder?', {
      title: 'Remove Founder',
      confirmLabel: 'Remove'
    });
    if (!shouldRemove) return;
    setEditedFounders((current) => current.filter((_, i) => i !== index));
  };

  const removeExecutiveOfficer = async (index: number) => {
    const shouldRemove = await showConfirm('Are you sure you want to remove this executive officer?', {
      title: 'Remove Executive Officer',
      confirmLabel: 'Remove'
    });
    if (!shouldRemove) return;
    const targetId = editedExecutiveOfficers[index]?.id;
    setEditedExecutiveOfficers((current) => current.filter((_, i) => i !== index));
    if (targetId) {
      setCustomRoleMode((current) => {
        const next = { ...current };
        delete next[targetId];
        return next;
      });
      if (openDropdownId === targetId) {
        setOpenDropdownId(null);
        setDropdownPosition(null);
        setRoleSearch('');
      }
    }
  };

  const uploadProfileImage = async (
    file: File,
    key: string,
    oldFileId: string | undefined,
    onPreview: (imageUrl: string) => void
  ) => {
    if (!file.type.startsWith('image/')) {
      await showAlert('Please select a valid image file.');
      return;
    }

    setPendingProfileImages((current) => ({ ...current, [key]: { file, oldFileId } }));
    onPreview(URL.createObjectURL(file));
  };

  const saveContent = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      throw new Error('Session expired. Please log in again.');
    }

    const nextFounders = editedFounders.map((founder) => ({ ...founder }));
    const nextOfficers = editedExecutiveOfficers.map((officer) => ({ ...officer }));
    for (const person of nextFounders) {
      const pending = pendingProfileImages[`founder:${person.id}`];
      if (!pending) continue;
      const upload = await uploadImageToDrive(pending.file, 'profiles', sessionToken, pending.oldFileId);
      if (!upload.success || !upload.url || !upload.fileId) throw new Error(upload.error || 'Founder image upload failed.');
      person.imageUrl = upload.url;
      person.imageFileId = upload.fileId;
    }
    for (const person of nextOfficers) {
      const pending = pendingProfileImages[`officer:${person.id}`];
      if (!pending) continue;
      const upload = await uploadImageToDrive(pending.file, 'profiles', sessionToken, pending.oldFileId);
      if (!upload.success || !upload.url || !upload.fileId) throw new Error(upload.error || 'Officer image upload failed.');
      person.imageUrl = upload.url;
      person.imageFileId = upload.fileId;
    }
    const [foundersResult, executiveOfficersResult] = await Promise.all([
      DataService.saveFounders(nextFounders, sessionToken),
      DataService.saveExecutiveOfficers(nextOfficers, sessionToken)
    ]);

    if (!foundersResult.success) {
      throw new Error(foundersResult.error || 'Failed to save founders');
    }
    if (!executiveOfficersResult.success) {
      throw new Error(executiveOfficersResult.error || 'Failed to save executive officers');
    }
    setEditedFounders(nextFounders);
    setEditedExecutiveOfficers(nextOfficers);
    setPendingProfileImages({});
    return { founders: nextFounders, executiveOfficers: nextOfficers };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveContent();
      onSave(saved);
      await showAlert('Founders and executive officers saved successfully!', { title: 'Founders Updated' });
      requestClose();
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : 'Error saving content. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (closeTimerRef.current != null) return;
    setIsModalVisible(false);
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, modalTransitionMs);
  };

  const toggleRoleDropdown = (officerId: string) => {
    if (openDropdownId === officerId) {
      setOpenDropdownId(null);
      setDropdownPosition(null);
      setRoleSearch('');
      return;
    }
    setOpenDropdownId(officerId);
    setRoleSearch('');
  };

  const selectPresetRole = (index: number, role: string) => {
    updateExecutiveOfficer(index, 'role', role);
    const officerId = editedExecutiveOfficers[index]?.id;
    if (officerId) {
      setCustomRoleMode((current) => ({ ...current, [officerId]: false }));
    }
    setOpenDropdownId(null);
    setDropdownPosition(null);
    setRoleSearch('');
  };

  const enableCustomRole = (officerId: string) => {
    setCustomRoleMode((current) => ({ ...current, [officerId]: true }));
    setOpenDropdownId(null);
    setDropdownPosition(null);
    setRoleSearch('');
  };

  const filteredRoleGroups = useMemo(() => {
    const normalizedSearch = roleSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return EXECUTIVE_ROLE_GROUPS;
    }

    return EXECUTIVE_ROLE_GROUPS
      .map((group) => ({
        ...group,
        options: group.options.filter((option) => option.toLowerCase().includes(normalizedSearch))
      }))
      .filter((group) => group.options.length > 0);
  }, [roleSearch]);

  const totalFilteredRoleCount = useMemo(
    () => filteredRoleGroups.reduce((sum, group) => sum + group.options.length, 0),
    [filteredRoleGroups]
  );

  const openDropdownOfficer = useMemo(
    () => editedExecutiveOfficers.find((entry) => entry.id === openDropdownId) ?? null,
    [editedExecutiveOfficers, openDropdownId]
  );

  const openDropdownOfficerIndex = useMemo(
    () => editedExecutiveOfficers.findIndex((entry) => entry.id === openDropdownId),
    [editedExecutiveOfficers, openDropdownId]
  );

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm transition-opacity duration-300 sm:p-3 md:p-4 ${isModalVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="contents">
        <div className={`flex max-h-[98vh] w-full max-w-[98vw] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-300 dark:border-white/10 dark:bg-gray-900 sm:max-h-[95vh] sm:max-w-6xl sm:rounded-3xl ${isModalVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-95 opacity-0'}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700 sm:p-5 md:p-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">Edit Founders and Executives</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Founders and executive officers are saved in separate sheets in the same workbook.
            </p>
          </div>
          <button
            onClick={requestClose}
            className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-6 w-6 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain bg-gray-50 p-4 dark:bg-gray-950/40 sm:p-5 md:p-6">
          <div className="space-y-8 pb-2">
            <section>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Founders</h3>
                <button
                  onClick={addFounder}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-blue text-white rounded-lg hover:bg-primary-blue/90 transition-colors font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add Founder
                </button>
              </div>

              <div className="space-y-6">
                {editedFounders.map((founder, index) => (
                    <div key={founder.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <h4 className="font-medium text-gray-900 dark:text-white">Founder {index + 1}</h4>
                      <button
                        onClick={() => removeFounder(index)}
                        className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-shrink-0">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Profile Photo
                        </label>
                        <div className="relative w-32 h-32 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                          <img
                            src={convertToCORSFreeLink(founder.imageUrl) || getAvatarUrl(founder.name)}
                            alt={`Portrait preview of ${founder.name}`}
                            referrerPolicy="no-referrer"
                            onError={(event) => {
                              console.error('[FoundersEditor] Founder preview image failed to load', {
                                founder,
                                attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src,
                                rawImageUrl: founder.imageUrl,
                                normalizedImageUrl: convertToCORSFreeLink(founder.imageUrl)
                              });
                              event.currentTarget.src = getAvatarUrl(founder.name);
                            }}
                            className="w-full h-full object-cover"
                          />
                          <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                void uploadProfileImage(
                                  file,
                                  `founder:${founder.id}`,
                                  founder.imageFileId || founder.imageUrl,
                                  (imageUrl) => {
                                    updateFounder(index, 'imageUrl', imageUrl);
                                  }
                                );
                              }}
                              className="hidden"
                            />
                            <div className="text-white text-center">
                              <Upload className="w-6 h-6 mx-auto mb-1" />
                              <span className="text-xs font-medium">Upload</span>
                            </div>
                          </label>
                        </div>
                      </div>

                      <div className="flex-1 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
                          <input
                            type="text"
                            value={founder.name}
                            onChange={(e) => updateFounder(index, 'name', e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Role/Position</label>
                          <input
                            type="text"
                            value={founder.role}
                            onChange={(e) => updateFounder(index, 'role', e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Biography</label>
                          <textarea
                            value={founder.bio}
                            onChange={(e) => updateFounder(index, 'bio', e.target.value)}
                            rows={4}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-blue focus:border-transparent resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {editedFounders.length === 0 && (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <p className="font-medium mb-2">No founders added yet</p>
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Executive Officers</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    Pick from preset executive and program-director positions, or switch to custom.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {editedExecutiveOfficers.map((officer, index) => {
                  const isCustomMode = !!customRoleMode[officer.id];
                  const isDropdownOpen = openDropdownId === officer.id;

                  return (
                    <div key={officer.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-gray-900 dark:text-white">Executive Officer {index + 1}</h4>
                        <button
                          onClick={() => removeExecutiveOfficer(index)}
                          className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-shrink-0">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Profile Photo
                          </label>
                          <div className="relative w-32 h-32 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                            {officer.imageUrl ? (
                              <img
                                src={convertToCORSFreeLink(officer.imageUrl) || getAvatarUrl(officer.name)}
                                alt={`Portrait preview of ${officer.name}`}
                                referrerPolicy="no-referrer"
                                onError={(event) => {
                                  console.error('[FoundersEditor] Executive preview image failed to load', {
                                    officer,
                                    attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src,
                                    rawImageUrl: officer.imageUrl,
                                    normalizedImageUrl: convertToCORSFreeLink(officer.imageUrl)
                                  });
                                  event.currentTarget.src = getAvatarUrl(officer.name);
                                }}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 px-3 text-center">
                                No image
                              </div>
                            )}
                            <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  void uploadProfileImage(
                                    file,
                                    `officer:${officer.id}`,
                                    officer.imageFileId || officer.imageUrl,
                                    (imageUrl) => {
                                      updateExecutiveOfficer(index, 'imageUrl', imageUrl);
                                    }
                                  );
                                }}
                                className="hidden"
                              />
                              <div className="text-white text-center">
                                <Upload className="w-6 h-6 mx-auto mb-1" />
                                <span className="text-xs font-medium">Upload</span>
                              </div>
                            </label>
                          </div>
                        </div>

                        <div className="flex-1 space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full Name</label>
                            <input
                              type="text"
                              value={officer.name}
                              onChange={(e) => updateExecutiveOfficer(index, 'name', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                            />
                          </div>

                          <div ref={(element) => { dropdownRefs.current[officer.id] = element; }} className="relative">
                            <div className="flex items-center justify-between mb-2">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role/Position</label>
                              <button
                                type="button"
                                onClick={() => setCustomRoleMode((current) => ({ ...current, [officer.id]: !isCustomMode }))}
                                className="text-xs font-semibold text-primary-blue hover:text-primary-cyan transition-colors"
                              >
                                {isCustomMode ? 'Use preset list' : 'Add custom role'}
                              </button>
                            </div>

                            {isCustomMode ? (
                              <input
                                type="text"
                                value={officer.role}
                                onChange={(e) => updateExecutiveOfficer(index, 'role', e.target.value)}
                                placeholder="Type a custom role or position"
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                              />
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => toggleRoleDropdown(officer.id)}
                                  className="w-full flex items-center justify-between gap-3 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-left text-gray-900 dark:text-white hover:border-primary-blue dark:hover:border-primary-cyan transition-colors"
                                >
                                  <span className={officer.role ? '' : 'text-gray-400 dark:text-gray-500'}>
                                    {officer.role || 'Select a position'}
                                  </span>
                                  <ChevronDown
                                    className={`w-4 h-4 text-gray-500 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                                  />
                                </button>
                              </>
                            )}

                            {!isCustomMode && officer.role && !ALL_EXECUTIVE_ROLES.includes(officer.role) && (
                              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                                This role is custom. Switch to custom mode to edit it directly.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {editedExecutiveOfficers.length === 0 && (
                  <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                    <p className="font-medium mb-2">No executive officers added yet</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={addExecutiveOfficer}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 p-5 text-left transition-colors hover:border-primary-blue dark:hover:border-primary-cyan hover:bg-primary-blue/5 dark:hover:bg-primary-cyan/5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">Add Executive</h4>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Add another executive officer card to continue the list.
                      </p>
                    </div>
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-blue/10 text-primary-blue dark:bg-primary-cyan/15 dark:text-primary-cyan">
                      <Plus className="w-5 h-5" />
                    </span>
                  </div>
                </button>
              </div>
            </section>
            </div>
          </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-white/90 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/90 sm:px-5 sm:py-4 md:px-6">
          <button
            onClick={requestClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-cyan disabled:opacity-50"
          >
            <Save className="h-[18px] w-[18px]" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
        </div>
      </div>

      {openDropdownId && dropdownPosition && createPortal(
        <div
          ref={dropdownMenuRef}
          className="fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
          style={{
            left: dropdownPosition.left,
            top: dropdownPosition.top,
            width: dropdownPosition.width,
            maxHeight: 320,
            transform: dropdownDirection === 'up' ? 'translateY(-100%)' : undefined
          }}
        >
          <div className="border-b border-gray-200 p-3 dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={roleSearch}
                onChange={(e) => setRoleSearch(e.target.value)}
                placeholder="Search positions"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-primary-blue dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            {filteredRoleGroups.map((group) => (
              <div key={group.label} className="py-2">
                <div className="px-4 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                  {group.label}
                </div>
                {group.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      if (openDropdownOfficerIndex >= 0) {
                        selectPresetRole(openDropdownOfficerIndex, option);
                      }
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-gray-900 transition-colors hover:bg-primary-blue/10 dark:text-white dark:hover:bg-primary-cyan/10"
                  >
                    <span>{option}</span>
                    {openDropdownOfficer?.role === option && <Check className="h-4 w-4 text-primary-blue dark:text-primary-cyan" />}
                  </button>
                ))}
              </div>
            ))}

            {filteredRoleGroups.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No matching preset roles.
              </div>
            )}
          </div>

          <div className="space-y-1 border-t border-gray-200 p-2 dark:border-gray-700">
            {totalFilteredRoleCount > 0 && (
              <div className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400">
                Scroll to see more results.
              </div>
            )}
            <button
              type="button"
              onClick={() => enableCustomRole(openDropdownId)}
              className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-primary-blue transition-colors hover:bg-primary-blue/10 dark:hover:bg-primary-cyan/10"
            >
              Add custom role instead
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
