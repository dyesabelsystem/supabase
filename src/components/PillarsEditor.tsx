import React, { useEffect, useRef, useState } from 'react';
import { Pillar, PillarActivity } from '../types';
import { X, Save, Plus, Trash2, Upload, BookOpen, Scale, Leaf, Heart, Palette } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAppDialog } from '../contexts/AppDialogContext';
import { convertToCORSFreeLink } from '../services/DriveService';
import { CustomSelect } from './CustomSelect';
import { getSessionToken } from '../utils/session';
import { uploadImageToDrive } from '../utils/driveUpload';

interface PillarsEditorProps {
  pillars: Pillar[];
  onSave: (pillars: Pillar[]) => void | Promise<void>;
  onClose: () => void;
  activitiesOnly?: boolean;
}

function getPillarIcon_(title: string, className: string) {
  switch (title) {
    case 'Research and Education':
      return <BookOpen className={className} />;
    case 'Good Governance':
      return <Scale className={className} />;
    case 'Sustainable Livelihood':
      return <Leaf className={className} />;
    case 'Community Health':
      return <Heart className={className} />;
    case 'Culture and Arts':
      return <Palette className={className} />;
    default:
      return <BookOpen className={className} />;
  }
}

var ACTIVITY_INITIAL_VISIBLE_COUNT = 6;

function truncateText_(value: string, maxLength: number) {
  var text = String(value || '').trim();
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}

function parseImpactAreasInput_(value: string) {
  var seen: Record<string, boolean> = {};
  return String(value || '')
    .split(',')
    .map(function(tag) {
      return tag.trim().replace(/^#+\s*/, '');
    })
    .filter(function(tag) {
      if (!tag) return false;
      var normalized = tag.toLowerCase();
      if (seen[normalized]) return false;
      seen[normalized] = true;
      return true;
    });
}

function toImpactAreasInput_(areas?: string[]) {
  return Array.isArray(areas)
    ? areas
        .map(function(tag) { return String(tag || '').trim().replace(/^#+\s*/, ''); })
        .filter(Boolean)
        .map(function(tag) { return '#' + tag; })
        .join(', ')
    : '';
}

export const PillarsEditor: React.FC<PillarsEditorProps> = ({ pillars, onSave, onClose, activitiesOnly = false }) => {
  const { user } = useAuth();
  const { showAlert, showConfirm } = useAppDialog();
  const assignedPillarIndex = user?.role === 'pillar_editor'
    ? pillars.findIndex((pillar) => String(pillar.id) === String(user.pillarId))
    : -1;
  const isPillarEditor = user?.role === 'pillar_editor' && assignedPillarIndex >= 0;
  const canEdit = !!user && (user.role === 'admin' || (user.role === 'editor' && !user.chapterId) || isPillarEditor);
  const accessiblePillarIndexes = isPillarEditor
    ? [assignedPillarIndex]
    : pillars.map((_, index) => index);
  const [editedPillars, setEditedPillars] = useState<Pillar[]>(pillars);
  const [persistedPillars, setPersistedPillars] = useState<Pillar[]>(pillars);
  const [selectedPillarIndex, setSelectedPillarIndex] = useState<number>(() => assignedPillarIndex >= 0 ? assignedPillarIndex : 0);
  const [impactAreasDraft, setImpactAreasDraft] = useState<string>(() => {
    const initialIndex = assignedPillarIndex >= 0 ? assignedPillarIndex : 0;
    return toImpactAreasInput_(pillars[initialIndex] && pillars[initialIndex].impactAreas);
  });
  const [saving, setSaving] = useState(false);
  const [visibleActivityCount, setVisibleActivityCount] = useState<Record<string, number>>({});
  const [activeActivityEditor, setActiveActivityEditor] = useState<{ pillarIndex: number; activityIndex: number | null; isNew: boolean } | null>(null);
  const [activityDraft, setActivityDraft] = useState<PillarActivity | null>(null);
  const [savingActivity, setSavingActivity] = useState(false);
  const [pendingPillarImages, setPendingPillarImages] = useState<Record<number, { file: File; oldFileId?: string }>>({});
  const [pendingActivityImage, setPendingActivityImage] = useState<{ file: File; oldFileId?: string } | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isActivityEditorVisible, setIsActivityEditorVisible] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const activityEditorCloseTimerRef = useRef<number | null>(null);
  const modalTransitionMs = 300;

  // Check permission
  if (!canEdit) {
    return null;
  }

  useEffect(() => {
    const entryTimer = window.setTimeout(() => setIsModalVisible(true), 10);
    return () => {
      window.clearTimeout(entryTimer);
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current);
      }
      if (activityEditorCloseTimerRef.current != null) {
        window.clearTimeout(activityEditorCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    var current = editedPillars[selectedPillarIndex];
    setImpactAreasDraft(toImpactAreasInput_(current && current.impactAreas));
  }, [selectedPillarIndex]);

  const getVisibleCountForPillar = (pillarIndex: number, totalActivities: number) =>
    Math.min(visibleActivityCount[pillarIndex] || ACTIVITY_INITIAL_VISIBLE_COUNT, totalActivities);

  const updatePillar = (index: number, field: keyof Pillar, value: any) => {
    const updated = [...editedPillars];
    updated[index] = { ...updated[index], [field]: value };
    setEditedPillars(updated);
  };

  const commitImpactAreasDraft_ = (pillarIndex: number, draftValue?: string) => {
    var normalizedDraft = draftValue != null ? draftValue : impactAreasDraft;
    var parsed = parseImpactAreasInput_(normalizedDraft);
    var updated = [...editedPillars];
    if (updated[pillarIndex]) {
      updated[pillarIndex] = { ...updated[pillarIndex], impactAreas: parsed };
      setEditedPillars(updated);
    }
    setImpactAreasDraft(toImpactAreasInput_(parsed));
    return updated;
  };

  const handleSelectPillar_ = (nextIndex: number) => {
    if (Number.isNaN(nextIndex) || nextIndex < 0 || nextIndex >= editedPillars.length) return;
    if (nextIndex !== selectedPillarIndex) {
      commitImpactAreasDraft_(selectedPillarIndex);
      setSelectedPillarIndex(nextIndex);
      return;
    }
    setSelectedPillarIndex(nextIndex);
  };

  const updateActivity = (pillarIndex: number, activityIndex: number, field: keyof PillarActivity, value: string) => {
    const updated = [...editedPillars];
    const activities = [...updated[pillarIndex].activities];
    activities[activityIndex] = { ...activities[activityIndex], [field]: value };
    updated[pillarIndex] = { ...updated[pillarIndex], activities };
    setEditedPillars(updated);
  };

  const addActivity = (pillarIndex: number) => {
    const newActivity: PillarActivity = {
      id: `a${pillarIndex}-${Date.now()}`,
      title: '',
      date: '',
      description: '',
      imageUrl: '',
      learnMoreUrl: '',
      applicationOpen: false,
      applicationUrl: '',
      applicationLabel: 'Join Now',
      applicationNote: ''
    };
    setActiveActivityEditor({ pillarIndex: pillarIndex, activityIndex: null, isNew: true });
    setActivityDraft({ ...newActivity });
    window.setTimeout(() => setIsActivityEditorVisible(true), 10);
  };

  const openActivityEditor = (pillarIndex: number, activityIndex: number) => {
    var activity = editedPillars[pillarIndex].activities[activityIndex];
    if (!activity) return;
    setActiveActivityEditor({ pillarIndex: pillarIndex, activityIndex: activityIndex, isNew: false });
    setActivityDraft({ ...activity });
    window.setTimeout(() => setIsActivityEditorVisible(true), 10);
  };

  const closeActivityEditor = () => {
    if (activityEditorCloseTimerRef.current != null) {
      window.clearTimeout(activityEditorCloseTimerRef.current);
    }
    setIsActivityEditorVisible(false);
    activityEditorCloseTimerRef.current = window.setTimeout(() => {
      setActiveActivityEditor(null);
      setActivityDraft(null);
      setPendingActivityImage(null);
    }, modalTransitionMs);
  };

  const requestClose = () => {
    if (closeTimerRef.current != null) return;
    setIsModalVisible(false);
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, modalTransitionMs);
  };

  const applyActivityToPillars_ = (
    basePillars: Pillar[],
    pillarIndex: number,
    nextActivity: PillarActivity,
    options?: { fallbackIndex?: number | null; prepend?: boolean }
  ) => {
    var nextPillars = basePillars.map(function(pillar) {
      return { ...pillar, activities: Array.isArray(pillar.activities) ? [...pillar.activities] : [] };
    });
    if (!nextPillars[pillarIndex]) return nextPillars;

    var activities = nextPillars[pillarIndex].activities;
    if (options && options.prepend) {
      activities = [nextActivity, ...activities];
      nextPillars[pillarIndex] = { ...nextPillars[pillarIndex], activities: activities };
      return nextPillars;
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

    if (targetIndex < 0) {
      activities.push(nextActivity);
    } else {
      activities[targetIndex] = nextActivity;
    }

    nextPillars[pillarIndex] = { ...nextPillars[pillarIndex], activities: activities };
    return nextPillars;
  };

  const handleSaveSpecificActivity = async () => {
    if (!activeActivityEditor || !activityDraft) return;

    var pillarIndex = activeActivityEditor.pillarIndex;
    var nextActivity = { ...activityDraft };

    if (!String(nextActivity.title || '').trim()) {
      await showAlert('Activity title is required.');
      return;
    }

    var activityOptions = activeActivityEditor.isNew
      ? { prepend: true }
      : { fallbackIndex: activeActivityEditor.activityIndex };

    var updatedEditedPillars = applyActivityToPillars_(editedPillars, pillarIndex, nextActivity, activityOptions);
    var updatedPersistedPillars = applyActivityToPillars_(persistedPillars, pillarIndex, nextActivity, activityOptions);

    setEditedPillars(updatedEditedPillars);
    setSavingActivity(true);
    try {
      if (pendingActivityImage) {
        const sessionToken = getSessionToken();
        if (!sessionToken) throw new Error('Session expired. Please log in again.');
        const upload = await uploadImageToDrive(pendingActivityImage.file, 'pillar-activities', sessionToken, pendingActivityImage.oldFileId);
        if (!upload.success || !upload.url || !upload.fileId) throw new Error(upload.error || 'Activity image upload failed.');
        nextActivity.imageUrl = upload.url;
        nextActivity.imageFileId = upload.fileId;
        updatedEditedPillars = applyActivityToPillars_(editedPillars, pillarIndex, nextActivity, activityOptions);
        updatedPersistedPillars = applyActivityToPillars_(persistedPillars, pillarIndex, nextActivity, activityOptions);
        setEditedPillars(updatedEditedPillars);
      }
      await onSave(updatedPersistedPillars);
      setPersistedPillars(updatedPersistedPillars);
      if (activeActivityEditor.isNew) {
        setVisibleActivityCount((current) => ({
          ...current,
          [pillarIndex]: (current[pillarIndex] || ACTIVITY_INITIAL_VISIBLE_COUNT) + 1
        }));
      }
      await showAlert(activeActivityEditor.isNew ? 'Activity created successfully.' : 'Activity updated successfully.', {
        title: 'Activity Saved'
      });
      closeActivityEditor();
    } catch (error) {
      await showAlert('Error saving activity. Please try again.');
    } finally {
      setSavingActivity(false);
    }
  };

  const removeActivity = async (pillarIndex: number, activityIndex: number) => {
    const shouldRemove = await showConfirm('Are you sure you want to remove this activity?', {
      title: 'Remove Activity',
      confirmLabel: 'Remove'
    });
    if (!shouldRemove) return;
    const updated = [...editedPillars];
    updated[pillarIndex].activities = updated[pillarIndex].activities.filter((_, i) => i !== activityIndex);
    setEditedPillars(updated);
  };

  const handleImageUpload = async (pillarIndex: number, activityIndex: number | null, file: File) => {
    if (!file.type.startsWith('image/')) {
      await showAlert('Please select a valid image file.');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    if (activeActivityEditor && activityDraft) {
      setPendingActivityImage({ file, oldFileId: activityDraft.imageFileId || activityDraft.imageUrl });
      setActivityDraft({ ...activityDraft, imageUrl: previewUrl });
    } else {
      const pillar = editedPillars[pillarIndex];
      setPendingPillarImages((current) => ({
        ...current,
        [pillarIndex]: { file, oldFileId: pillar?.imageFileId || pillar?.imageUrl }
      }));
      updatePillar(pillarIndex, 'imageUrl', previewUrl);
    }
  };

  const handleSave = async () => {
    var pillarsToSave = commitImpactAreasDraft_(selectedPillarIndex);
    setSaving(true);
    try {
      const sessionToken = getSessionToken();
      if (!sessionToken) throw new Error('Session expired. Please log in again.');
      pillarsToSave = pillarsToSave.map((pillar) => ({ ...pillar }));
      for (const [rawIndex, pending] of Object.entries(pendingPillarImages)) {
        const index = Number(rawIndex);
        const upload = await uploadImageToDrive(pending.file, 'pillars', sessionToken, pending.oldFileId);
        if (!upload.success || !upload.url || !upload.fileId) throw new Error(upload.error || 'Pillar image upload failed.');
        pillarsToSave[index] = { ...pillarsToSave[index], imageUrl: upload.url, imageFileId: upload.fileId };
      }
      await onSave(pillarsToSave);
      setEditedPillars(pillarsToSave);
      setPendingPillarImages({});
      setPersistedPillars(pillarsToSave);
      await showAlert('Pillars saved successfully!', { title: 'Pillars Updated' });
      requestClose();
    } catch (error) {
      await showAlert('Error saving pillars. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const currentPillar = editedPillars[selectedPillarIndex];
  const pillarOptions = accessiblePillarIndexes.map(function(index) {
    const pillar = editedPillars[index];
    return {
      value: String(index),
      label: pillar.title || ('Pillar ' + (index + 1)),
      icon: getPillarIcon_(pillar.title || '', 'w-4 h-4 text-primary-blue')
    };
  });
  const visibleActivities = currentPillar.activities.slice(0, getVisibleCountForPillar(selectedPillarIndex, currentPillar.activities.length));
  const hasHiddenActivities = visibleActivities.length < currentPillar.activities.length;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm transition-opacity duration-300 sm:p-3 md:p-4 ${isModalVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div className={`relative flex max-h-[98vh] w-full max-w-[98vw] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-300 dark:border-white/10 dark:bg-gray-900 sm:max-h-[95vh] sm:max-w-6xl sm:rounded-3xl ${isModalVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-95 opacity-0'}`}>
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700 sm:p-5 md:p-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Edit Pillars</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {isPillarEditor
                  ? `Manage your assigned pillar: ${currentPillar.title}`
                  : activitiesOnly
                    ? 'Manage activities for each core pillar'
                    : "Manage your organization's core pillars and activities"}
              </p>
            </div>
            <button
              onClick={requestClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="min-h-0 flex flex-1 flex-col lg:flex-row">
            {/* Sidebar - Pillar Selection */}
            <div className="shrink-0 border-b border-gray-200 p-4 lg:w-64 lg:overflow-y-auto lg:border-b-0 lg:border-r dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase mb-3">
                Select Pillar
              </h3>
              <div className="relative z-20 lg:hidden">
                <CustomSelect
                  value={String(selectedPillarIndex)}
                  onChange={(nextValue) => {
                    var nextIndex = Number(nextValue);
                    if (!Number.isNaN(nextIndex)) handleSelectPillar_(nextIndex);
                  }}
                  options={pillarOptions}
                  ariaLabel="Select pillar"
                  className="w-full"
                  triggerClassName="min-h-[48px] border-gray-300 bg-white text-sm font-semibold text-gray-900 shadow-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  menuClassName="z-[70] border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800"
                />
              </div>

              <div className="hidden space-y-2 lg:block">
                {accessiblePillarIndexes.map((index) => {
                  const pillar = editedPillars[index];
                  return (
                  <button
                    key={pillar.id}
                    onClick={() => handleSelectPillar_(index)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedPillarIndex === index
                        ? 'bg-primary-blue text-white shadow-md'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={selectedPillarIndex === index ? 'text-white' : 'text-primary-blue'}>
                        {getPillarIcon_(pillar.title || '', 'w-5 h-5')}
                      </div>
                      <span className="text-sm font-medium">{pillar.title}</span>
                    </div>
                  </button>
                  );
                })}
              </div>
            </div>

            {/* Main Content */}
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                {!activitiesOnly && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Pillar Cover Image
                  </label>
                  <div className="relative mx-auto aspect-[3/2] w-full max-w-3xl max-h-[360px] rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                    <img
                      src={convertToCORSFreeLink(currentPillar.imageUrl)}
                      alt={`${currentPillar.title || 'Pillar'} cover image preview`}
                      onError={(event) => {
                        event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentPillar.title || 'Pillar')}&background=1e3a8a&color=ffffff&size=512`;
                      }}
                      className="w-full h-full object-contain"
                    />
                    <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && handleImageUpload(selectedPillarIndex, null, e.target.files[0])}
                        className="hidden"
                      />
                      <div className="text-white text-center">
                        <Upload className="w-8 h-8 mx-auto mb-2" />
                        <span className="text-sm font-medium">Change Image</span>
                      </div>
                    </label>
                  </div>
                </div>
                )}

                {!activitiesOnly && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={currentPillar.title}
                    onChange={(e) => updatePillar(selectedPillarIndex, 'title', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                  />
                </div>
                )}

                {!activitiesOnly && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Excerpt (Short Description)
                  </label>
                  <textarea
                    value={currentPillar.excerpt}
                    onChange={(e) => updatePillar(selectedPillarIndex, 'excerpt', e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                  />
                </div>
                )}

                {!activitiesOnly && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Full Description
                  </label>
                  <textarea
                    value={currentPillar.description}
                    onChange={(e) => updatePillar(selectedPillarIndex, 'description', e.target.value)}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                  />
                </div>
                )}

                {!activitiesOnly && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Aim/Goal
                  </label>
                  <textarea
                    value={currentPillar.aim}
                    onChange={(e) => updatePillar(selectedPillarIndex, 'aim', e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                  />
                </div>
                )}

                {!activitiesOnly && (
                <div className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">Impact Areas & Social Links</h4>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Impact Areas (comma separated)
                    </label>
                    <input
                      type="text"
                      value={impactAreasDraft}
                      onChange={(e) => setImpactAreasDraft(e.target.value)}
                      onBlur={() => {
                        commitImpactAreasDraft_(selectedPillarIndex);
                      }}
                      placeholder="#Sustainability, #Youth, #Community"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="url"
                      value={currentPillar.socialLinks?.facebook || ''}
                      onChange={(e) => updatePillar(selectedPillarIndex, 'socialLinks', { ...(currentPillar.socialLinks || {}), facebook: e.target.value })}
                      placeholder="Facebook URL"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <input
                      type="url"
                      value={currentPillar.socialLinks?.instagram || ''}
                      onChange={(e) => updatePillar(selectedPillarIndex, 'socialLinks', { ...(currentPillar.socialLinks || {}), instagram: e.target.value })}
                      placeholder="Instagram URL"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <input
                      type="url"
                      value={currentPillar.socialLinks?.twitter || ''}
                      onChange={(e) => updatePillar(selectedPillarIndex, 'socialLinks', { ...(currentPillar.socialLinks || {}), twitter: e.target.value })}
                      placeholder="X / Twitter URL"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <input
                      type="url"
                      value={currentPillar.socialLinks?.linkedin || ''}
                      onChange={(e) => updatePillar(selectedPillarIndex, 'socialLinks', { ...(currentPillar.socialLinks || {}), linkedin: e.target.value })}
                      placeholder="LinkedIn URL"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <input
                      type="url"
                      value={currentPillar.socialLinks?.youtube || ''}
                      onChange={(e) => updatePillar(selectedPillarIndex, 'socialLinks', { ...(currentPillar.socialLinks || {}), youtube: e.target.value })}
                      placeholder="YouTube URL"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                    <input
                      type="url"
                      value={currentPillar.socialLinks?.website || ''}
                      onChange={(e) => updatePillar(selectedPillarIndex, 'socialLinks', { ...(currentPillar.socialLinks || {}), website: e.target.value })}
                      placeholder="Website URL"
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
                )}

                {!activitiesOnly && (
                <div className="space-y-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">Pillar Join Now</h4>

                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={!!currentPillar.joinNow?.isOpen}
                      onChange={(e) => updatePillar(selectedPillarIndex, 'joinNow', { ...(currentPillar.joinNow || {}), isOpen: e.target.checked })}
                      className="h-4 w-4"
                    />
                    Open pillar application
                  </label>

                  <input
                    type="url"
                    value={currentPillar.joinNow?.url || ''}
                    onChange={(e) => updatePillar(selectedPillarIndex, 'joinNow', { ...(currentPillar.joinNow || {}), url: e.target.value })}
                    placeholder="Application URL"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />

                  <input
                    type="text"
                    value={currentPillar.joinNow?.label || ''}
                    onChange={(e) => updatePillar(selectedPillarIndex, 'joinNow', { ...(currentPillar.joinNow || {}), label: e.target.value })}
                    placeholder="Button label (default: Join Now)"
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />

                  <textarea
                    value={currentPillar.joinNow?.description || ''}
                    onChange={(e) => updatePillar(selectedPillarIndex, 'joinNow', { ...(currentPillar.joinNow || {}), description: e.target.value })}
                    placeholder="Optional short note shown under the button"
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
                )}

                {/* Activities */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Activities
                    </label>
                  </div>

                  <div className="space-y-4">
                    <button
                      type="button"
                      onClick={() => addActivity(selectedPillarIndex)}
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

                    {visibleActivities.map((activity, activityIndex) => {
                      var activityKey = `${selectedPillarIndex}:${activity.id || activityIndex}`;
                      return (
                        <div
                          key={activityKey}
                          className="border border-gray-200 dark:border-gray-700 rounded-xl p-4"
                        >
                          <div className="flex items-start gap-3">
                            <button
                              type="button"
                              onClick={() => openActivityEditor(selectedPillarIndex, activityIndex)}
                              className="flex w-full min-w-0 items-center gap-4 text-left"
                            >
                              <div className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                                <img
                                  src={convertToCORSFreeLink(activity.imageUrl)}
                                  alt={`${activity.title || 'Pillar activity'} preview image`}
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
                                {activity.applicationOpen && (
                                  <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">Application Open</p>
                                )}
                              </div>
                            </button>

                            <button
                              onClick={() => removeActivity(selectedPillarIndex, activityIndex)}
                              className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-red-600 dark:text-red-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {hasHiddenActivities && (
                      <button
                        type="button"
                        onClick={() => setVisibleActivityCount((current) => ({
                          ...current,
                          [selectedPillarIndex]: (current[selectedPillarIndex] || ACTIVITY_INITIAL_VISIBLE_COUNT) + ACTIVITY_INITIAL_VISIBLE_COUNT
                        }))}
                        className="w-full rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        Load More Activities
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
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
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
      </div>

      {activeActivityEditor && activityDraft && (
        <div className={`fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 md:p-6 transition-opacity duration-300 ${isActivityEditorVisible ? 'opacity-100' : 'opacity-0'}`}>
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={closeActivityEditor}
            aria-label="Close activity editor"
          />

          <div className={`relative z-10 w-full max-w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[95vh] sm:max-h-[92vh] overflow-y-auto rounded-2xl sm:rounded-2xl border border-gray-200 bg-white px-4 sm:px-6 md:px-8 py-4 sm:py-6 shadow-2xl transition-all duration-300 dark:border-gray-700 dark:bg-gray-900 ${isActivityEditorVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-95 opacity-0'}`}>
            <button
              type="button"
              onClick={closeActivityEditor}
              aria-label="Close activity editor"
              className="absolute right-3 sm:right-4 top-3 sm:top-4 rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>

            <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white pr-10">{activeActivityEditor.isNew ? 'Add Activity' : 'Edit Activity'}</h3>
            <p className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
              {activeActivityEditor.isNew
                ? 'Complete this panel and save to create a new activity card.'
                : 'Save this panel to update only this activity.'}
            </p>

            <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
              <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                <img
                  src={convertToCORSFreeLink(activityDraft.imageUrl)}
                  alt={`${activityDraft.title || 'Pillar activity'} image preview`}
                  onError={(event) => {
                    event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(activityDraft.title || 'Activity')}&background=0f172a&color=ffffff&size=512`;
                  }}
                  className="w-full h-full object-cover"
                />
                <label className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleImageUpload(activeActivityEditor.pillarIndex, activeActivityEditor.activityIndex, e.target.files[0])}
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
                value={activityDraft.title}
                onChange={(e) => setActivityDraft({ ...activityDraft, title: e.target.value })}
                placeholder="Activity title"
                className="w-full px-3 py-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-cyan/50"
              />

              <input
                type="text"
                value={activityDraft.date}
                onChange={(e) => setActivityDraft({ ...activityDraft, date: e.target.value })}
                placeholder="Date (e.g., 2026-02-28T16:00:00.000Z or March 01, 2026 12:00 PM)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />

              <textarea
                value={activityDraft.description}
                onChange={(e) => setActivityDraft({ ...activityDraft, description: e.target.value })}
                placeholder="Activity description"
                rows={4}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />

              <input
                type="url"
                value={activityDraft.learnMoreUrl || ''}
                onChange={(e) => setActivityDraft({ ...activityDraft, learnMoreUrl: e.target.value })}
                placeholder="Learn More URL (Facebook, Instagram, X, website, etc.)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />

              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={!!activityDraft.applicationOpen}
                  onChange={(e) => setActivityDraft({ ...activityDraft, applicationOpen: e.target.checked })}
                  className="h-4 w-4"
                />
                Open application for this event
              </label>

              <input
                type="url"
                value={activityDraft.applicationUrl || ''}
                onChange={(e) => setActivityDraft({ ...activityDraft, applicationUrl: e.target.value })}
                placeholder="Event application URL"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />

              <input
                type="text"
                value={activityDraft.applicationLabel || ''}
                onChange={(e) => setActivityDraft({ ...activityDraft, applicationLabel: e.target.value })}
                placeholder="Application button label (default: Join Now)"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />

              <textarea
                value={activityDraft.applicationNote || ''}
                onChange={(e) => setActivityDraft({ ...activityDraft, applicationNote: e.target.value })}
                placeholder="Optional short note for this event application"
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={closeActivityEditor}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSpecificActivity}
                disabled={savingActivity}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-blue px-4 py-2 font-semibold text-white transition-colors hover:bg-primary-blue/90 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {savingActivity ? 'Saving Activity...' : activeActivityEditor.isNew ? 'Create Activity' : 'Save Activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

