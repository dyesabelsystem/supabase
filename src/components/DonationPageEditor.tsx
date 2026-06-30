import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CreditCard,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Wallet,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  DonationAllocation,
  DonationContent,
  DonationMethod,
  DonationRecord,
  DonationsService
} from '../services/DonationsService';
import { convertToCORSFreeLink } from '../services/DriveService';
import { getSessionToken } from '../utils/session';
import { CustomSelect, CustomSelectOption } from './CustomSelect';
import { SkeletonBlock } from './Skeleton';

interface DonationPageEditorProps {
  onBack: () => void;
}

const MANILA_TIME_ZONE = 'Asia/Manila';
const DONATION_EDITOR_CACHE_PREFIX = 'dyesabel:donation-editor:content-cache:v1';

interface DonationEditorCacheRecord {
  content: DonationContent;
  cachedAt: number;
}

const createStableJson_ = (value: unknown): string => {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) {
      return input.map(normalize);
    }

    if (input && typeof input === 'object') {
      const keys = Object.keys(input as Record<string, unknown>).sort();
      const normalized: Record<string, unknown> = {};
      keys.forEach((key) => {
        normalized[key] = normalize((input as Record<string, unknown>)[key]);
      });
      return normalized;
    }

    return input;
  };

  return JSON.stringify(normalize(value));
};

const readDonationEditorCache_ = (cacheKey: string): DonationEditorCacheRecord | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DonationEditorCacheRecord;
    if (!parsed || typeof parsed !== 'object' || !parsed.content) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeDonationEditorCache_ = (cacheKey: string, content: DonationContent): void => {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(cacheKey, JSON.stringify({ content, cachedAt: Date.now() }));
  } catch {
    // Ignore storage write failures to avoid blocking editor usage.
  }
};

const formatToManilaInputValue = (value?: string): string => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const lookup = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${lookup('year')}-${lookup('month')}-${lookup('day')}T${lookup('hour')}:${lookup('minute')}`;
};

const parseManilaInputToIso = (value?: string): string => {
  if (!value) return new Date().toISOString();

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return new Date(value).toISOString();

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);

  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute)).toISOString();
};

const formatManilaDisplay = (value?: string): string => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Invalid Manila time';

  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
};

const createMethod = (index: number): DonationMethod => ({
  id: `method-${Date.now()}-${index}`,
  name: `Method ${index + 1}`,
  accountName: '',
  accountNumber: '',
  qrImageUrl: '',
  color: 'bg-primary-blue',
  isEnabled: true,
  sortOrder: index
});

const createAllocation = (): DonationAllocation => ({
  label: '',
  percentage: 0,
  color: 'bg-primary-blue'
});

const createDonation = (): DonationRecord => ({
  id: `donation-${Date.now()}`,
  name: 'Anonymous',
  amount: 0,
  currency: 'PHP',
  method: 'Donation',
  donatedAt: new Date().toISOString()
});

const emptyContent: DonationContent = {
  localMethods: [],
  bankDetails: {
    bankName: '',
    accountName: '',
    accountNumber: '',
    swiftCode: '',
    bankAddress: '',
    currency: ''
  },
  referenceNote: '',
  secRegistrationNumber: '',
  allocations: [],
  recentDonations: []
};

const colorOptions: CustomSelectOption[] = [
  { value: 'bg-primary-blue', label: 'Primary Blue', description: 'Core brand accent', previewClassName: 'bg-primary-blue' },
  { value: 'bg-primary-cyan', label: 'Primary Cyan', description: 'Bright ocean highlight', previewClassName: 'bg-primary-cyan' },
  { value: 'bg-emerald-500', label: 'Emerald', description: 'Clean donation success tone', previewClassName: 'bg-emerald-500' },
  { value: 'bg-pink-500', label: 'Pink', description: 'Warm campaign highlight', previewClassName: 'bg-pink-500' },
  { value: 'bg-orange-500', label: 'Orange', description: 'Strong attention color', previewClassName: 'bg-orange-500' },
  { value: 'bg-purple-500', label: 'Purple', description: 'Deep contrast accent', previewClassName: 'bg-purple-500' }
];

export const DonationPageEditor: React.FC<DonationPageEditorProps> = ({ onBack }) => {
  const { user } = useAuth();
  const canEdit = !!user && (user.role === 'admin' || (user.role === 'editor' && !user.chapterId));
  const donationEditorCacheKey = `${DONATION_EDITOR_CACHE_PREFIX}:${user?.id || 'anonymous'}`;
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [content, setContent] = useState<DonationContent>(emptyContent);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localQrPreviews, setLocalQrPreviews] = useState<Record<string, string>>({});
  const [pendingQrFiles, setPendingQrFiles] = useState<Record<string, File>>({});
  const closeTimerRef = useRef<number | null>(null);
  const modalTransitionMs = 300;

  const requestClose = () => {
    if (saving || closeTimerRef.current != null) return;
    setIsModalVisible(false);
    closeTimerRef.current = window.setTimeout(() => {
      onBack();
    }, modalTransitionMs);
  };

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
    const loadContent = async () => {
      const sessionToken = getSessionToken();
      if (!sessionToken) {
        toast.error('Session expired. Please login again.');
        onBack();
        return;
      }

      const cachedRecord = readDonationEditorCache_(donationEditorCacheKey);
      const cachedContent = cachedRecord?.content;
      const cachedSignature = cachedContent ? createStableJson_(cachedContent) : '';

      if (cachedContent) {
        setContent(cachedContent);
        setLoading(false);
      } else {
        setLoading(true);
      }

      const result = await DonationsService.getEditableDonationContent(sessionToken);
      if (result.success && result.data) {
        const backendSignature = createStableJson_(result.data);
        if (!cachedContent || backendSignature !== cachedSignature) {
          setContent(result.data);
        }
        writeDonationEditorCache_(donationEditorCacheKey, result.data);
      } else {
        if (!cachedContent) {
          toast.error(result.error || 'Unable to load donation page content.');
        }
      }
      setLoading(false);
    };

    if (canEdit) {
      void loadContent();
    }
  }, [canEdit, donationEditorCacheKey, onBack]);

  useEffect(() => {
    return () => {
      Object.values(localQrPreviews).forEach((previewUrl) => {
        URL.revokeObjectURL(previewUrl);
      });
    };
  }, [localQrPreviews]);

  useEffect(() => {
    const activeMethodIds = new Set(content.localMethods.map((method) => method.id));

    setLocalQrPreviews((current) => {
      let changed = false;
      const next: Record<string, string> = {};

      Object.entries(current).forEach(([methodId, previewUrl]) => {
        if (activeMethodIds.has(methodId)) {
          next[methodId] = previewUrl;
          return;
        }

        URL.revokeObjectURL(previewUrl);
        changed = true;
      });

      return changed ? next : current;
    });

    setPendingQrFiles((current) => {
      let changed = false;
      const next: Record<string, File> = {};

      Object.entries(current).forEach(([methodId, file]) => {
        if (activeMethodIds.has(methodId)) {
          next[methodId] = file;
        } else {
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [content.localMethods]);

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
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [requestClose]);

  if (!canEdit) {
    return null;
  }

  const updateMethod = (methodId: string, key: keyof DonationMethod, value: string | number | boolean) => {
    setContent((prev) => ({
      ...prev,
      localMethods: prev.localMethods.map((method) =>
        method.id === methodId ? { ...method, [key]: value } : method
      )
    }));
  };

  const updateAllocation = (index: number, key: keyof DonationAllocation, value: string | number) => {
    setContent((prev) => ({
      ...prev,
      allocations: prev.allocations.map((allocation, currentIndex) =>
        currentIndex === index ? { ...allocation, [key]: value } : allocation
      )
    }));
  };

  const updateRecentDonation = (index: number, key: keyof DonationRecord, value: string | number) => {
    setContent((prev) => ({
      ...prev,
      recentDonations: prev.recentDonations.map((donation, currentIndex) =>
        currentIndex === index ? { ...donation, [key]: value } : donation
      )
    }));
  };

  const handleQrSelection = (methodId: string, file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setLocalQrPreviews((current) => {
      const existingPreview = current[methodId];
      if (existingPreview) {
        URL.revokeObjectURL(existingPreview);
      }
      return {
        ...current,
        [methodId]: previewUrl
      };
    });
    setPendingQrFiles((current) => ({
      ...current,
      [methodId]: file
    }));
  };

  const handleSave = async () => {
    const sessionToken = getSessionToken();
    if (!sessionToken) {
      toast.error('Session expired. Please login again.');
      return;
    }

    setSaving(true);
    try {
      const uploadedQrUrls: Record<string, string> = {};
      const uploadedQrFileIds: Record<string, string> = {};
      for (const [methodId, file] of Object.entries(pendingQrFiles)) {
        const oldMethod = content.localMethods.find((method) => method.id === methodId);
        const oldFileId = oldMethod?.qrImageFileId || oldMethod?.qrImageUrl;
        const uploadResult = await DonationsService.uploadDonationQr(file, sessionToken, oldFileId);
        if (!uploadResult.success || !uploadResult.data?.thumbnailUrl) {
          throw new Error(uploadResult.error || 'Unable to upload QR image.');
        }
        uploadedQrUrls[methodId] = uploadResult.data.thumbnailUrl;
        uploadedQrFileIds[methodId] = uploadResult.data.fileId;
      }

      const normalizedContent: DonationContent = {
        ...content,
        localMethods: content.localMethods.map((method, index) => ({
          ...method,
          name: method.name.trim(),
          accountName: method.accountName.trim(),
          accountNumber: method.accountNumber.trim(),
          qrImageUrl: String(uploadedQrUrls[method.id] || method.qrImageUrl || '').trim(),
          qrImageFileId: String(uploadedQrFileIds[method.id] || method.qrImageFileId || '').trim(),
          sortOrder: index
        })),
        allocations: content.allocations.map((allocation) => ({
          ...allocation,
          label: allocation.label.trim()
        })),
        recentDonations: content.recentDonations.map((donation) => ({
          ...donation,
          name: donation.name.trim(),
          method: donation.method.trim(),
          currency: donation.currency.trim(),
          donatedAt: donation.donatedAt ? parseManilaInputToIso(donation.donatedAt) : new Date().toISOString()
        })),
        referenceNote: content.referenceNote.trim(),
        secRegistrationNumber: content.secRegistrationNumber.trim(),
        bankDetails: {
          bankName: content.bankDetails.bankName.trim(),
          accountName: content.bankDetails.accountName.trim(),
          accountNumber: content.bankDetails.accountNumber.trim(),
          swiftCode: content.bankDetails.swiftCode.trim(),
          bankAddress: content.bankDetails.bankAddress.trim(),
          currency: content.bankDetails.currency.trim()
        }
      };

      const result = await DonationsService.saveDonationContent(normalizedContent, sessionToken);
      if (result.success && result.data) {
        setContent(result.data);
        writeDonationEditorCache_(donationEditorCacheKey, result.data);
        setPendingQrFiles({});
        setLocalQrPreviews((current) => {
          Object.values(current).forEach((previewUrl) => {
            URL.revokeObjectURL(previewUrl);
          });
          return {};
        });
        toast.success(result.message || 'Donation content saved successfully.');
      } else {
        toast.error(result.error || 'Unable to save donation page content.');
      }
    } catch (error) {
      console.error('[DonationPageEditor] Save failed', error);
      toast.error(error instanceof Error ? error.message : 'Unable to save donation page content.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-3 md:p-4 backdrop-blur-sm transition-opacity duration-300 ${isModalVisible ? 'opacity-100' : 'opacity-0'}`}>
      <div className={`flex max-h-[98vh] w-full max-w-[98vw] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition-all duration-300 dark:border-white/10 dark:bg-gray-900 sm:max-h-[95vh] sm:max-w-5xl md:max-w-6xl sm:rounded-3xl ${isModalVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-95 opacity-0'}`}>
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 p-4 dark:border-gray-700 sm:p-5 md:p-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Donation Page Editor</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Manage donation methods, bank details, allocations, and published recent donations
              </p>
            </div>
            <button
              onClick={requestClose}
              className="rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Close donation editor"
            >
              <X className="h-6 w-6 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto bg-gray-50 p-4 dark:bg-gray-950/40 sm:p-5 md:p-6">
            <div className="space-y-6">
              {loading ? (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#051923]">
                    <SkeletonBlock className="mb-6 h-7 w-56" />
                    <div className="space-y-5">
                      {Array.from({ length: 2 }).map((_, index) => (
                        <div key={index} className="rounded-2xl border border-white/10 bg-gray-50 dark:bg-white/5 p-5">
                          <div className="mb-4 flex items-center justify-between gap-4">
                            <SkeletonBlock className="h-6 w-28" />
                            <SkeletonBlock className="h-5 w-5 rounded-md" />
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Array.from({ length: 4 }).map((__, fieldIndex) => (
                              <SkeletonBlock key={fieldIndex} className="h-11 w-full rounded-lg" />
                            ))}
                          </div>
                          <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
                            <div className="space-y-3">
                              <SkeletonBlock className="h-11 w-full rounded-lg" />
                              <SkeletonBlock className="h-5 w-40" />
                            </div>
                            <div className="rounded-xl border border-dashed border-white/10 bg-white/50 dark:bg-black/20 p-4 min-w-[220px]">
                              <SkeletonBlock className="mb-3 h-4 w-24" />
                              <SkeletonBlock className="mx-auto mb-3 h-28 w-28 rounded-lg" />
                              <SkeletonBlock className="h-10 w-full rounded-lg" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    {Array.from({ length: 2 }).map((_, index) => (
                      <div key={index} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#051923]">
                        <SkeletonBlock className="mb-6 h-7 w-52" />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {Array.from({ length: 6 }).map((__, fieldIndex) => (
                            <SkeletonBlock key={fieldIndex} className="h-11 w-full rounded-lg" />
                          ))}
                        </div>
                        <SkeletonBlock className="mt-4 h-24 w-full rounded-lg" />
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#051923]">
                    <SkeletonBlock className="mb-6 h-7 w-44" />
                    <div className="space-y-4">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center rounded-2xl border border-white/10 bg-gray-50 dark:bg-white/5 p-4">
                          {Array.from({ length: 5 }).map((__, fieldIndex) => (
                            <SkeletonBlock key={fieldIndex} className="h-11 w-full rounded-lg" />
                          ))}
                          <SkeletonBlock className="h-5 w-5 rounded-md" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#051923]">
              <div className="flex items-center gap-2 mb-6">
                <Wallet className="text-primary-blue" size={20} />
                <h2 className="text-xl font-bold text-ocean-deep dark:text-white">National Payment Methods</h2>
              </div>

              <div className="space-y-5">
                {content.localMethods.map((method, index) => (
                  <div key={method.id} className="rounded-2xl border border-white/10 bg-gray-50 dark:bg-white/5 p-5">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <h3 className="text-lg font-bold text-ocean-deep dark:text-white">Method {index + 1}</h3>
                      <button
                        onClick={() =>
                          setContent((prev) => ({
                            ...prev,
                            localMethods: prev.localMethods.filter((item) => item.id !== method.id)
                          }))
                        }
                        className="text-red-500 hover:text-red-400"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input
                        type="text"
                        value={method.name}
                        onChange={(e) => updateMethod(method.id, 'name', e.target.value)}
                        placeholder="Method name"
                        className="w-full px-4 py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white"
                      />
                      <input
                        type="text"
                        value={method.accountName}
                        onChange={(e) => updateMethod(method.id, 'accountName', e.target.value)}
                        placeholder="Account name"
                        className="w-full px-4 py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white"
                      />
                      <input
                        type="text"
                        value={method.accountNumber}
                        onChange={(e) => updateMethod(method.id, 'accountNumber', e.target.value)}
                        placeholder="Account number"
                        className="w-full px-4 py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white"
                      />
                      <CustomSelect
                        value={method.color || 'bg-primary-blue'}
                        onChange={(nextValue) => updateMethod(method.id, 'color', nextValue)}
                        options={colorOptions}
                        ariaLabel={`Color for ${method.name || `method ${index + 1}`}`}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-start">
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={method.qrImageUrl}
                          onChange={(e) => updateMethod(method.id, 'qrImageUrl', e.target.value)}
                          placeholder="QR image URL"
                          className="w-full px-4 py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white"
                        />
                        <label className="inline-flex items-center gap-2 text-sm text-ocean-deep dark:text-white">
                          <input
                            type="checkbox"
                            checked={method.isEnabled !== false}
                            onChange={(e) => updateMethod(method.id, 'isEnabled', e.target.checked)}
                          />
                          Enabled on donation page
                        </label>
                      </div>

                      <div className="rounded-xl border border-dashed border-white/10 bg-white/50 dark:bg-black/20 p-4 min-w-[220px]">
                        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-ocean-deep dark:text-white">
                          <ImageIcon size={16} />
                          QR Upload
                        </div>
                        {(localQrPreviews[method.id] || method.qrImageUrl) ? (
                          <img
                            src={localQrPreviews[method.id] || convertToCORSFreeLink(method.qrImageUrl)}
                            alt={`${method.name} donation QR code preview`}
                            referrerPolicy="no-referrer"
                            onError={(event) => {
                              console.error('[DonationPageEditor] QR preview image failed to load', {
                                method,
                                attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src,
                                rawQrImageUrl: method.qrImageUrl,
                                normalizedQrImageUrl: convertToCORSFreeLink(method.qrImageUrl),
                                hasLocalPreview: !!localQrPreviews[method.id]
                              });
                            }}
                            className="w-28 h-28 object-contain mx-auto mb-3 rounded-lg bg-white"
                          />
                        ) : (
                          <div className="w-28 h-28 mx-auto mb-3 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center text-xs text-gray-500 text-center px-2">
                            No QR image yet
                          </div>
                        )}
                        <label className="block">
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handleQrSelection(method.id, file);
                              }
                              e.currentTarget.value = '';
                            }}
                          />
                          <span className="block text-center px-3 py-2 bg-primary-blue hover:bg-primary-cyan text-white rounded-lg cursor-pointer text-sm">
                            {pendingQrFiles[method.id] ? 'QR Selected' : 'Upload QR'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() =>
                    setContent((prev) => ({
                      ...prev,
                      localMethods: [...prev.localMethods, createMethod(prev.localMethods.length)]
                    }))
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-primary-blue/10 text-primary-blue rounded-lg hover:bg-primary-blue/20 transition-colors"
                >
                  <Plus size={18} />
                  Add Payment Method
                </button>
                    </div>
                  </section>

                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#051923]">
                <div className="flex items-center gap-2 mb-6">
                  <CreditCard className="text-primary-cyan" size={20} />
                  <h2 className="text-xl font-bold text-ocean-deep dark:text-white">International Bank Details</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input type="text" value={content.bankDetails.bankName} onChange={(e) => setContent((prev) => ({ ...prev, bankDetails: { ...prev.bankDetails, bankName: e.target.value } }))} placeholder="Bank name" className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                  <input type="text" value={content.bankDetails.accountName} onChange={(e) => setContent((prev) => ({ ...prev, bankDetails: { ...prev.bankDetails, accountName: e.target.value } }))} placeholder="Account name" className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                  <input type="text" value={content.bankDetails.accountNumber} onChange={(e) => setContent((prev) => ({ ...prev, bankDetails: { ...prev.bankDetails, accountNumber: e.target.value } }))} placeholder="Account number" className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                  <input type="text" value={content.bankDetails.swiftCode} onChange={(e) => setContent((prev) => ({ ...prev, bankDetails: { ...prev.bankDetails, swiftCode: e.target.value } }))} placeholder="SWIFT code" className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                  <input type="text" value={content.bankDetails.currency} onChange={(e) => setContent((prev) => ({ ...prev, bankDetails: { ...prev.bankDetails, currency: e.target.value } }))} placeholder="Currency" className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                  <input type="text" value={content.secRegistrationNumber} onChange={(e) => setContent((prev) => ({ ...prev, secRegistrationNumber: e.target.value }))} placeholder="SEC registration number" className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                </div>
                <textarea value={content.bankDetails.bankAddress} onChange={(e) => setContent((prev) => ({ ...prev, bankDetails: { ...prev.bankDetails, bankAddress: e.target.value } }))} placeholder="Bank address" rows={3} className="mt-4 w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                <textarea value={content.referenceNote} onChange={(e) => setContent((prev) => ({ ...prev, referenceNote: e.target.value }))} placeholder="Reference note shown on the donation page" rows={4} className="mt-4 w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                    </section>

                    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#051923]">
                <div className="flex items-center gap-2 mb-6">
                  <ShieldCheck className="text-emerald-500" size={20} />
                  <h2 className="text-xl font-bold text-ocean-deep dark:text-white">Donation Allocations</h2>
                </div>
                <div className="space-y-4">
                  {content.allocations.map((allocation, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_120px_180px_auto] gap-3 items-center">
                      <input
                        type="text"
                        value={allocation.label}
                        onChange={(e) => updateAllocation(index, 'label', e.target.value)}
                        placeholder="Allocation label"
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white"
                      />
                      <input
                        type="number"
                        value={allocation.percentage}
                        onChange={(e) => updateAllocation(index, 'percentage', Number(e.target.value))}
                        placeholder="Percent"
                        className="w-full px-4 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white"
                      />
                      <CustomSelect
                        value={allocation.color || 'bg-primary-blue'}
                        onChange={(nextValue) => updateAllocation(index, 'color', nextValue)}
                        options={colorOptions}
                        ariaLabel={`Allocation color ${index + 1}`}
                      />
                      <button
                        onClick={() =>
                          setContent((prev) => ({
                            ...prev,
                            allocations: prev.allocations.filter((_, currentIndex) => currentIndex !== index)
                          }))
                        }
                        className="text-red-500 hover:text-red-400"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setContent((prev) => ({
                        ...prev,
                        allocations: [...prev.allocations, createAllocation()]
                      }))
                    }
                    className="flex items-center gap-2 px-4 py-2 bg-primary-cyan/10 text-primary-cyan rounded-lg hover:bg-primary-cyan/20 transition-colors"
                  >
                    <Plus size={18} />
                    Add Allocation
                  </button>
                </div>
                    </section>
                  </div>

                  <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#051923]">
              <div className="flex items-center gap-2 mb-6">
                <ImageIcon className="text-pink-500" size={20} />
                <h2 className="text-xl font-bold text-ocean-deep dark:text-white">Recent Donations</h2>
              </div>
              <div className="space-y-4">
                {content.recentDonations.map((donation, index) => (
                  <div key={donation.id} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center rounded-2xl border border-white/10 bg-gray-50 dark:bg-white/5 p-4">
                    <input type="text" value={donation.name} onChange={(e) => updateRecentDonation(index, 'name', e.target.value)} placeholder="Donor name" className="w-full px-4 py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                    <input type="number" value={donation.amount} onChange={(e) => updateRecentDonation(index, 'amount', Number(e.target.value))} placeholder="Amount" className="w-full px-4 py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                    <input type="text" value={donation.currency} onChange={(e) => updateRecentDonation(index, 'currency', e.target.value)} placeholder="Currency" className="w-full px-4 py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                    <input type="text" value={donation.method} onChange={(e) => updateRecentDonation(index, 'method', e.target.value)} placeholder="Method" className="w-full px-4 py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                    <div className="space-y-1">
                      <input type="datetime-local" value={formatToManilaInputValue(donation.donatedAt)} onChange={(e) => updateRecentDonation(index, 'donatedAt', e.target.value)} className="w-full px-4 py-2 bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 rounded-lg text-ocean-deep dark:text-white" />
                      <p className="text-[11px] text-ocean-deep/60 dark:text-gray-400">
                        Manila time: {formatManilaDisplay(parseManilaInputToIso(donation.donatedAt))}
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        setContent((prev) => ({
                          ...prev,
                          recentDonations: prev.recentDonations.filter((_, currentIndex) => currentIndex !== index)
                        }))
                      }
                      className="justify-self-start text-red-500 hover:text-red-400"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    setContent((prev) => ({
                      ...prev,
                      recentDonations: [createDonation(), ...prev.recentDonations]
                    }))
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-pink-500/10 text-pink-500 rounded-lg hover:bg-pink-500/20 transition-colors"
                >
                  <Plus size={18} />
                  Add Recent Donation
                </button>
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-white/90 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/90 sm:px-5 sm:py-4 md:px-6">
            <button
              onClick={requestClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="flex items-center gap-2 rounded-lg bg-primary-blue px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-cyan disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
    </div>
  );
};
