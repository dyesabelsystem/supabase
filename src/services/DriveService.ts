import { User } from '../types';
import { ApiResponse, sendApiRequest } from './apiClient';
import { invalidateLocalCache, withLocalCache } from '../utils/cache';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

const sendRequest = async <T>(payload: object): Promise<ApiResponse<T>> => {
  return sendApiRequest<T>('main', payload);
};

const sendUsersRequest = async <T>(payload: object): Promise<ApiResponse<T>> => {
  return sendApiRequest<T>('users', payload);
};

const inFlightImageUploads = new Map<string, Promise<ApiResponse<{ fileId: string; fileUrl: string; thumbnailUrl: string }>>>();

const buildUploadDedupKey = (file: File, sessionToken: string, customFolderId?: string) => {
  return [
    sessionToken,
    customFolderId || '',
    file.name,
    file.type,
    String(file.size),
    String(file.lastModified)
  ].join('::');
};

const DATA_CACHE_TTL_MS = 5 * 60 * 1000;
const CHAPTER_CACHE_TTL_MS = 3 * 60 * 1000;

const cacheMainRead = <T>(key: string, request: () => Promise<ApiResponse<T>>) => {
  return withLocalCache<ApiResponse<T>>(key, DATA_CACHE_TTL_MS, request, (result) => result.success);
};

const cacheChapterRead = <T>(chapterId: string, request: () => Promise<ApiResponse<T>>) => {
  return withLocalCache<ApiResponse<T>>(
    `main:chapter:${chapterId}`,
    CHAPTER_CACHE_TTL_MS,
    request,
    (result) => result.success
  );
};

const invalidateMainContentCache = () => {
  invalidateLocalCache(/^main:/);
};

export const AuthService = {
  login: async (username: string, password: string, clientFingerprint?: string) => {
    return sendUsersRequest<{ sessionToken: string; user: User }>({
      action: 'login',
      username,
      password,
      clientFingerprint
    });
  },

  register: async (username: string, password: string, email: string) => {
    return sendUsersRequest({
      action: 'register',
      username,
      password,
      email
    });
  },

  logout: async (sessionToken: string) => {
    return sendUsersRequest({
      action: 'logout',
      sessionToken
    });
  },

  validateSession: async (sessionToken: string) => {
    return sendUsersRequest<{ valid: boolean; user: User }>({
      action: 'validateSession',
      sessionToken
    });
  },

  listUsers: async (sessionToken: string) => {
    return sendUsersRequest<{ users: User[] }>({
      action: 'listUsers',
      sessionToken
    });
  },

  createUser: async (sessionToken: string, userData: {
    username: string;
    password: string;
    email: string;
    role: string;
    chapterId?: string;
    pillarId?: string;
  }) => {
    return sendUsersRequest<{ user: User }>({
      action: 'createUser',
      sessionToken,
      ...userData
    });
  },

  updateUser: async (sessionToken: string, userData: {
    userId: string;
    username: string;
    email: string;
    role: string;
    chapterId?: string;
    pillarId?: string;
  }) => {
    return sendUsersRequest<{ user: User }>({
      action: 'updateUser',
      sessionToken,
      ...userData
    });
  },

  updateOwnProfile: async (sessionToken: string, profileData: {
    username: string;
    email: string;
    newPassword?: string;
  }) => {
    return sendUsersRequest<{ user: User; sessionToken?: string; sessionRotated?: boolean }>({
      action: 'updateOwnProfile',
      sessionToken,
      ...profileData
    });
  },

  deleteUser: async (sessionToken: string, userId: string) => {
    return sendUsersRequest({
      action: 'deleteUser',
      sessionToken,
      userId
    });
  },

  updatePassword: async (sessionToken: string, userId: string, newPassword: string) => {
    return sendUsersRequest({
      action: 'updatePassword',
      sessionToken,
      userId,
      newPassword
    });
  },

  sendPasswordReset: async (sessionToken: string, userId: string, redirectTo: string) => {
    return sendUsersRequest({
      action: 'sendPasswordReset',
      sessionToken,
      userId,
      redirectTo
    });
  }
};

export const DriveService = {
  uploadImage: async (
    file: File,
    sessionToken: string,
    customFolderId?: string
  ) => {
    if (file.size > 10 * 1024 * 1024) {
      console.error('[DriveService] Upload blocked by client size limit', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        maxSize: 10 * 1024 * 1024,
        hasCustomFolderId: Boolean(customFolderId)
      });
      return { success: false, error: 'File too large (>10MB)' };
    }

    const dedupKey = buildUploadDedupKey(file, sessionToken, customFolderId);
    const existingUpload = inFlightImageUploads.get(dedupKey);
    if (existingUpload) {
      console.warn('[DriveService] Duplicate upload prevented; reusing in-flight request', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        hasCustomFolderId: Boolean(customFolderId)
      });
      return existingUpload;
    }

    const uploadPromise = (async () => {
      try {
        const base64 = await fileToBase64(file);

        const response = await sendRequest<{ fileId: string; fileUrl: string; thumbnailUrl: string }>({
          action: 'uploadImage',
          sessionToken,
          fileName: file.name,
          fileType: file.type,
          fileData: base64,
          customFolderId
        });

        if (!response.success) {
          console.error('[DriveService] Upload request failed', {
            action: 'uploadImage',
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            hasCustomFolderId: Boolean(customFolderId),
            backendError: response.error,
            backendMessage: response.message
          });
        }

        return response;
      } catch (error) {
        console.error('[DriveService] Upload processing failed before API request', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          hasCustomFolderId: Boolean(customFolderId),
          error: error instanceof Error ? error.message : String(error)
        });
        return { success: false, error: 'File processing failed' };
      } finally {
        inFlightImageUploads.delete(dedupKey);
      }
    })();

    inFlightImageUploads.set(dedupKey, uploadPromise);
    return uploadPromise;
  },

  uploadFromUrl: async (
    imageUrl: string,
    fileName: string,
    sessionToken: string,
    customFolderId?: string
  ) => {
    return sendRequest<{ fileId: string; fileUrl: string }>({
      action: 'uploadImageFromUrl',
      sessionToken,
      imageUrl,
      fileName,
      customFolderId
    });
  },

  createFolder: async (folderName: string, sessionToken: string, parentFolderId?: string) => {
    return sendRequest<{ folderId: string; folderName: string; isNew: boolean }>({
      action: 'createFolder',
      sessionToken,
      folderName,
      parentFolderId
    });
  },

  listImages: async (folderId: string, sessionToken: string) => {
    return sendRequest<{ files: any[] }>({
      action: 'listImages',
      sessionToken,
      customFolderId: folderId
    });
  },

  getImage: async (fileId: string, sessionToken: string) => {
    return sendRequest<{ file: any }>({
      action: 'getImage',
      sessionToken,
      fileId
    });
  },

  updateImage: async (
    fileId: string,
    changes: { fileName?: string; description?: string; makePublic?: boolean },
    sessionToken: string
  ) => {
    return sendRequest<{ file: any }>({
      action: 'updateImage',
      sessionToken,
      fileId,
      ...changes
    });
  },

  replaceImage: async (fileId: string, file: File, sessionToken: string) => {
    if (file.size > 10 * 1024 * 1024) {
      return { success: false, error: 'File too large (>10MB)' };
    }
    const base64 = await fileToBase64(file);
    return sendRequest<{ fileId: string; fileUrl: string; thumbnailUrl: string }>({
      action: 'replaceImage',
      sessionToken,
      fileId,
      fileName: file.name,
      fileType: file.type,
      fileData: base64
    });
  },

  restoreImage: async (fileId: string, sessionToken: string) => {
    return sendRequest<{ file: any }>({
      action: 'restoreImage',
      sessionToken,
      fileId
    });
  },

  deleteImage: async (fileId: string, sessionToken: string) => {
    return sendRequest({
      action: 'deleteImage',
      sessionToken,
      fileId
    });
  }
};

export const DataService = {
  getOrgSettings: async () => {
    return cacheMainRead('main:org-settings', () => sendRequest<{ settings: any }>({
      action: 'getOrgSettings'
    }));
  },

  updateOrgSettings: async (settings: any, sessionToken: string) => {
    const result = await sendRequest({
      action: 'updateOrgSettings',
      sessionToken,
      settings
    });
    if (result.success) invalidateMainContentCache();
    return result;
  },

  deleteChapter: async (chapterId: string, sessionToken: string) => {
    const result = await sendRequest({
      action: 'deleteChapter',
      sessionToken,
      chapterId
    });
    if (result.success) invalidateLocalCache(/^main:(chapter:|chapters|org-settings)/);
    return result;
  },

  saveLandingPageData: async (landingPage: any, sessionToken: string) => {
    const result = await sendRequest({
      action: 'saveLandingPage',
      sessionToken,
      landingPage
    });
    if (result.success) invalidateMainContentCache();
    return result;
  },

  getLandingPageData: async () => {
    return cacheMainRead('main:landing-page', () => sendRequest<{ landingPage: any }>({
      action: 'loadLandingPage'
    }));
  },

  savePillars: async (pillars: any[], sessionToken: string) => {
    const result = await sendRequest({
      action: 'savePillars',
      sessionToken,
      pillars
    });
    if (result.success) invalidateLocalCache(/^main:(pillars|stories)/);
    return result;
  },

  loadPillars: async () => {
    return cacheMainRead('main:pillars', () => sendRequest<{ pillars: any[] }>({
      action: 'loadPillars'
    }));
  },

  listPillars: async () => {
    return cacheMainRead('main:pillars-list', () => sendRequest<{ pillars: any[] }>({
      action: 'listPillars'
    }));
  },

  getPillar: async (pillarId: string) => {
    return cacheMainRead(`main:pillar:${pillarId}`, () => sendRequest<{ pillar: any }>({
      action: 'getPillar',
      pillarId
    }));
  },

  createPillar: async (pillar: any, sessionToken: string) => {
    const result = await sendRequest<{ pillar: any }>({
      action: 'createPillar',
      sessionToken,
      pillar
    });
    if (result.success) invalidateLocalCache(/^main:pillar/);
    return result;
  },

  updatePillar: async (pillar: any, sessionToken: string) => {
    const result = await sendRequest<{ pillar: any }>({
      action: 'updatePillar',
      sessionToken,
      pillar
    });
    if (result.success) invalidateLocalCache(/^main:pillar/);
    return result;
  },

  deletePillar: async (pillarId: string, sessionToken: string) => {
    const result = await sendRequest<{ pillar: any }>({
      action: 'deletePillar',
      sessionToken,
      pillarId
    });
    if (result.success) invalidateLocalCache(/^main:pillar/);
    return result;
  },

  saveChapter: async (chapterId: string, chapterData: any, sessionToken: string) => {
    const result = await sendRequest({
      action: 'saveChapter',
      sessionToken,
      chapterId,
      chapterData
    });
    if (result.success) invalidateLocalCache(/^main:chapter/);
    if (result.success) invalidateLocalCache('main:chapters');
    return result;
  },

  loadChapter: async (chapterId: string) => {
    return cacheChapterRead(chapterId, () => sendRequest<{ chapter: any }>({
      action: 'loadChapter',
      chapterId
    }));
  },

  listChapters: async () => {
    return cacheMainRead('main:chapters', () => sendRequest<{ chapters: any[] }>({
      action: 'listChapters'
    }));
  },

  savePartners: async (partners: any, sessionToken: string) => {
    const result = await sendRequest({
      action: 'savePartners',
      sessionToken,
      partners
    });
    if (result.success) invalidateLocalCache(/^main:partners/);
    return result;
  },

  loadPartners: async () => {
    return cacheMainRead('main:partners', () => sendRequest<{ partners: any }>({
      action: 'loadPartners'
    }));
  },

  listPartnerCategories: async () => {
    return sendRequest<{ partners: any }>({
      action: 'listPartnerCategories'
    });
  },

  getPartnerCategory: async (categoryId: string) => {
    return sendRequest<{ category: any }>({
      action: 'getPartnerCategory',
      categoryId
    });
  },

  createPartnerCategory: async (category: any, sessionToken: string) => {
    const result = await sendRequest<{ category: any }>({
      action: 'createPartnerCategory',
      sessionToken,
      category
    });
    if (result.success) invalidateLocalCache(/^main:partners/);
    return result;
  },

  updatePartnerCategory: async (category: any, sessionToken: string) => {
    const result = await sendRequest<{ category: any }>({
      action: 'updatePartnerCategory',
      sessionToken,
      category
    });
    if (result.success) invalidateLocalCache(/^main:partners/);
    return result;
  },

  deletePartnerCategory: async (categoryId: string, sessionToken: string) => {
    const result = await sendRequest<{ category: any }>({
      action: 'deletePartnerCategory',
      sessionToken,
      categoryId
    });
    if (result.success) invalidateLocalCache(/^main:partners/);
    return result;
  },

  getPartner: async (partnerId: string, categoryId?: string) => {
    return sendRequest<{ partner: any; categoryId: string | null }>({
      action: 'getPartner',
      partnerId,
      categoryId
    });
  },

  createPartner: async (categoryId: string, partner: any, sessionToken: string) => {
    const result = await sendRequest<{ partner: any; categoryId: string }>({
      action: 'createPartner',
      sessionToken,
      categoryId,
      partner
    });
    if (result.success) invalidateLocalCache(/^main:partners/);
    return result;
  },

  updatePartner: async (categoryId: string, partner: any, sessionToken: string) => {
    const result = await sendRequest<{ partner: any; categoryId: string }>({
      action: 'updatePartner',
      sessionToken,
      categoryId,
      partner
    });
    if (result.success) invalidateLocalCache(/^main:partners/);
    return result;
  },

  deletePartner: async (categoryId: string, partnerId: string, sessionToken: string) => {
    const result = await sendRequest<{ partner: any; categoryId: string }>({
      action: 'deletePartner',
      sessionToken,
      categoryId,
      partnerId
    });
    if (result.success) invalidateLocalCache(/^main:partners/);
    return result;
  },

  saveFounders: async (founders: any, sessionToken: string) => {
    const result = await sendRequest({
      action: 'saveFounders',
      sessionToken,
      founders
    });
    if (result.success) invalidateLocalCache(/^main:founders/);
    return result;
  },

  loadFounders: async () => {
    return cacheMainRead('main:founders', () => sendRequest<{ founders: any }>({
      action: 'loadFounders'
    }));
  },

  listFounders: async () => {
    return sendRequest<{ founders: any }>({
      action: 'listFounders'
    });
  },

  getFounder: async (founderId: string) => {
    return sendRequest<{ founder: any }>({
      action: 'getFounder',
      founderId
    });
  },

  createFounder: async (founder: any, sessionToken: string) => {
    const result = await sendRequest<{ founder: any }>({
      action: 'createFounder',
      sessionToken,
      founder
    });
    if (result.success) invalidateLocalCache(/^main:founders/);
    return result;
  },

  updateFounder: async (founder: any, sessionToken: string) => {
    const result = await sendRequest<{ founder: any }>({
      action: 'updateFounder',
      sessionToken,
      founder
    });
    if (result.success) invalidateLocalCache(/^main:founders/);
    return result;
  },

  deleteFounder: async (founderId: string, sessionToken: string) => {
    const result = await sendRequest<{ founder: any }>({
      action: 'deleteFounder',
      sessionToken,
      founderId
    });
    if (result.success) invalidateLocalCache(/^main:founders/);
    return result;
  },

  saveExecutiveOfficers: async (executiveOfficers: any, sessionToken: string) => {
    const result = await sendRequest({
      action: 'saveExecutiveOfficers',
      sessionToken,
      executiveOfficers
    });
    if (result.success) invalidateLocalCache(/^main:executive-officers/);
    return result;
  },

  loadExecutiveOfficers: async () => {
    return cacheMainRead('main:executive-officers', () => sendRequest<{ executiveOfficers: any }>({
      action: 'loadExecutiveOfficers'
    }));
  },

  listExecutiveOfficers: async () => {
    return sendRequest<{ executiveOfficers: any }>({
      action: 'listExecutiveOfficers'
    });
  },

  getExecutiveOfficer: async (executiveOfficerId: string) => {
    return sendRequest<{ executiveOfficer: any }>({
      action: 'getExecutiveOfficer',
      executiveOfficerId
    });
  },

  createExecutiveOfficer: async (executiveOfficer: any, sessionToken: string) => {
    return sendRequest<{ executiveOfficer: any }>({
      action: 'createExecutiveOfficer',
      sessionToken,
      executiveOfficer
    });
  },

  updateExecutiveOfficer: async (executiveOfficer: any, sessionToken: string) => {
    return sendRequest<{ executiveOfficer: any }>({
      action: 'updateExecutiveOfficer',
      sessionToken,
      executiveOfficer
    });
  },

  deleteExecutiveOfficer: async (executiveOfficerId: string, sessionToken: string) => {
    return sendRequest<{ executiveOfficer: any }>({
      action: 'deleteExecutiveOfficer',
      sessionToken,
      executiveOfficerId
    });
  },

  saveStories: async (stories: any, sessionToken: string) => {
    const result = await sendRequest({
      action: 'saveStories',
      sessionToken,
      stories
    });
    if (result.success) invalidateLocalCache(/^main:stories/);
    return result;
  },

  loadStories: async () => {
    return sendRequest<{ stories: any }>({
      action: 'loadStories'
    });
  },

  listStories: async () => {
    return sendRequest<{ stories: any }>({
      action: 'listStories'
    });
  },

  getStory: async (storyId: string) => {
    return sendRequest<{ story: any }>({
      action: 'getStory',
      storyId
    });
  },

  createStory: async (story: any, sessionToken: string) => {
    const result = await sendRequest<{ story: any }>({
      action: 'createStory',
      sessionToken,
      story
    });
    if (result.success) invalidateLocalCache(/^main:stories/);
    return result;
  },

  updateStory: async (story: any, sessionToken: string) => {
    const result = await sendRequest<{ story: any }>({
      action: 'updateStory',
      sessionToken,
      story
    });
    if (result.success) invalidateLocalCache(/^main:stories/);
    return result;
  },

  deleteStory: async (storyId: string, sessionToken: string) => {
    const result = await sendRequest<{ story: any }>({
      action: 'deleteStory',
      sessionToken,
      storyId
    });
    if (result.success) invalidateLocalCache(/^main:stories/);
    return result;
  }
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = error => reject(error);
  });
};

const isLikelyDriveFileId = (value: string): boolean => {
  const normalizedValue = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{25,}$/.test(normalizedValue)) return false;
  // Avoid rewriting known app identifiers (e.g., generated chapter IDs) as Drive links.
  if (/_chapter_|_activity_|_pillar_/i.test(normalizedValue)) return false;
  return true;
};

export const convertToCORSFreeLink = (url: string | undefined): string => {
  if (!url) return '';

  const normalizedUrl = url.trim();
  if (!normalizedUrl) return '';
  if (normalizedUrl.startsWith('data:')) {
    return normalizedUrl;
  }

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    if (isLikelyDriveFileId(normalizedUrl)) {
      return `https://drive.google.com/thumbnail?id=${normalizedUrl}&sz=w4000`;
    }
    return normalizedUrl;
  }

  if (normalizedUrl.includes('drive.google.com/thumbnail')) {
    return normalizedUrl;
  }

  const fileId = extractDriveFileId(normalizedUrl);

  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w4000`;
  }

  return normalizedUrl;
};

export const extractDriveFileId = (url: string | undefined): string => {
  if (!url) return '';

  const normalizedUrl = url.trim();
  if (!normalizedUrl) return '';

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    return isLikelyDriveFileId(normalizedUrl) ? normalizedUrl : '';
  }

  const idMatch =
    normalizedUrl.match(/[?&]id=([a-zA-Z0-9_-]{20,})/) ||
    normalizedUrl.match(/\/d\/([a-zA-Z0-9_-]{20,})/) ||
    normalizedUrl.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);

  if (idMatch?.[1]) return idMatch[1];

  if (!/drive\.google\.com|googleusercontent\.com|uc\?export=view/i.test(normalizedUrl)) {
    return '';
  }

  const fallback = normalizedUrl.match(/[-\w]{25,}/);
  return fallback?.[0] || '';
};

export const getImageDebugInfo = (url: string | undefined) => {
  const rawUrl = String(url || '').trim();
  const fileId = extractDriveFileId(rawUrl);
  const normalizedUrl = convertToCORSFreeLink(rawUrl);
  const isHttpUrl = /^https?:\/\//i.test(rawUrl);
  const looksLikeRawId = /^[a-zA-Z0-9_-]{20,}$/.test(rawUrl);

  return {
    rawUrl,
    normalizedUrl,
    fileId,
    isHttpUrl,
    looksLikeRawId,
    isDriveUrl: /drive\.google\.com|googleusercontent\.com/.test(rawUrl) || isLikelyDriveFileId(rawUrl),
    isDataUrl: rawUrl.startsWith('data:'),
    hasUrl: !!rawUrl
  };
};
