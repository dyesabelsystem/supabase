import { convertToCORSFreeLink, DriveService, extractDriveFileId } from './DriveService';
import { sendApiRequest } from './apiClient';
import { invalidateLocalCache, withLocalCache } from '../utils/cache';
import { buildDescriptiveImageFileName } from '../utils/imageFileName';

export interface DonationMethod {
  id: string;
  name: string;
  accountName: string;
  accountNumber: string;
  qrImageUrl: string;
  qrImageFileId?: string;
  color?: string;
  isEnabled?: boolean;
  sortOrder?: number;
}

export interface DonationAllocation {
  label: string;
  percentage: number;
  color?: string;
}

export interface DonationBankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  swiftCode: string;
  bankAddress: string;
  currency: string;
}

export interface DonationRecord {
  id: string;
  name: string;
  amount: number;
  currency: string;
  method: string;
  donatedAt: string;
}

export interface DonationContent {
  localMethods: DonationMethod[];
  bankDetails: DonationBankDetails;
  referenceNote: string;
  secRegistrationNumber: string;
  allocations: DonationAllocation[];
  recentDonations: DonationRecord[];
}

interface DonationsApiResponse<T = unknown> {
  success: boolean;
  error?: string;
  message?: string;
  data?: T;
}

interface DonationContentResponse {
  donationContent?: Partial<DonationContent>;
}

interface DonationQrUploadResponse {
  fileId?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
}

interface DonationQrDownloadResponse {
  fileName?: string;
  fileType?: string;
  fileData?: string;
}

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

const DONATION_PUBLIC_CACHE_KEY = 'donations:public-content';
const DONATION_CACHE_TTL_MS = 5 * 60 * 1000;

const normalizeMethod = (method: Partial<DonationMethod>, index: number): DonationMethod => ({
  id: String(method.id || `method-${index + 1}`),
  name: String(method.name || `Method ${index + 1}`),
  accountName: String(method.accountName || ''),
  accountNumber: String(method.accountNumber || ''),
  qrImageUrl: convertToCORSFreeLink(method.qrImageUrl || ''),
  qrImageFileId: String(method.qrImageFileId || ''),
  color: method.color || 'bg-primary-blue',
  isEnabled: method.isEnabled !== false,
  sortOrder: Number.isFinite(method.sortOrder) ? Number(method.sortOrder) : index
});

const normalizeAllocation = (allocation: Partial<DonationAllocation>): DonationAllocation => ({
  label: String(allocation.label || 'Donation Allocation'),
  percentage: Number(allocation.percentage || 0),
  color: allocation.color || 'bg-primary-blue'
});

const normalizeDonation = (donation: Partial<DonationRecord>, index: number): DonationRecord => ({
  id: String(donation.id || `donation-${index + 1}`),
  name: String(donation.name || 'Anonymous'),
  amount: Number(donation.amount || 0),
  currency: String(donation.currency || 'PHP'),
  method: String(donation.method || 'Donation'),
  donatedAt: String(donation.donatedAt || '')
});

const normalizeContent = (content: Partial<DonationContent> | undefined): DonationContent => {
  if (!content) return emptyContent;

  const localMethods = Array.isArray(content.localMethods)
    ? content.localMethods
        .map(normalizeMethod)
        .filter((method) => method.isEnabled)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    : [];

  return {
    localMethods,
    bankDetails: {
      bankName: String(content.bankDetails?.bankName || ''),
      accountName: String(content.bankDetails?.accountName || ''),
      accountNumber: String(content.bankDetails?.accountNumber || ''),
      swiftCode: String(content.bankDetails?.swiftCode || ''),
      bankAddress: String(content.bankDetails?.bankAddress || ''),
      currency: String(content.bankDetails?.currency || '')
    },
    referenceNote: String(content.referenceNote || ''),
    secRegistrationNumber: String(content.secRegistrationNumber || ''),
    allocations: Array.isArray(content.allocations)
      ? content.allocations.map(normalizeAllocation)
      : [],
    recentDonations: Array.isArray(content.recentDonations)
      ? content.recentDonations.map(normalizeDonation)
      : []
  };
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('File processing failed.'));
        return;
      }
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = () => reject(new Error('File processing failed.'));
  });

export const DonationsService = {
  async getPublicDonationData(): Promise<DonationsApiResponse<DonationContent>> {
    const result = await withLocalCache<DonationsApiResponse<DonationContent>>(
      DONATION_PUBLIC_CACHE_KEY,
      DONATION_CACHE_TTL_MS,
      () => sendApiRequest<DonationContent>('donations', { action: 'getPublicDonationData' }),
      (response) => response.success
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Unable to load donation data.'
      };
    }

    return {
      success: true,
      data: normalizeContent(result.data)
    };
  },

  async getEditableDonationContent(sessionToken: string): Promise<DonationsApiResponse<DonationContent>> {
    const result = await sendApiRequest<DonationContentResponse>('main', {
      action: 'getDonationContent',
      sessionToken
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Unable to load donation content.'
      };
    }

    return {
      success: true,
      data: normalizeContent(result.donationContent)
    };
  },

  async saveDonationContent(
    content: DonationContent,
    sessionToken: string
  ): Promise<DonationsApiResponse<DonationContent>> {
    const result = await sendApiRequest<DonationContentResponse>('main', {
      action: 'saveDonationContent',
      sessionToken,
      content
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Unable to save donation content.'
      };
    }

    const normalizedResult = {
      success: true,
      message: result.message,
      data: normalizeContent(result.donationContent)
    };
    invalidateLocalCache(/^donations:/);
    return normalizedResult;
  },

  async uploadDonationQr(
    file: File,
    sessionToken: string,
    oldFileId?: string
  ): Promise<DonationsApiResponse<{ fileId: string; fileUrl: string; thumbnailUrl: string }>> {
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: 'File too large. Maximum size is 5MB.' };
    }

    const base64 = await fileToBase64(file);
    const result = await sendApiRequest<DonationQrUploadResponse>('main', {
      action: 'uploadDonationQr',
      sessionToken,
      fileName: buildDescriptiveImageFileName(file, 'donation-payment-qr'),
      fileType: file.type,
      fileData: base64
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Unable to upload QR image.'
      };
    }

    const newFileId = String(result.fileId || '');
    const normalizedOldFileId = extractDriveFileId(oldFileId || '') || oldFileId;
    if (newFileId && normalizedOldFileId && normalizedOldFileId !== newFileId) {
      const deleteResult = await DriveService.deleteImage(normalizedOldFileId, sessionToken);
      if (!deleteResult.success) {
        await DriveService.deleteImage(newFileId, sessionToken);
        return {
          success: false,
          error: deleteResult.error || 'The new QR image uploaded, but the previous image could not be deleted.'
        };
      }
    }

    return {
      success: true,
      data: {
        fileId: newFileId,
        fileUrl: String(result.fileUrl || ''),
        thumbnailUrl: String(result.thumbnailUrl || result.fileUrl || '')
      }
    };
  },

  async downloadDonationQr(fileId: string): Promise<DonationsApiResponse<{ fileName: string; fileType: string; fileData: string }>> {
    const normalizedFileId = String(fileId || '').trim();
    if (!normalizedFileId) {
      return { success: false, error: 'QR file is missing.' };
    }

    const result = await sendApiRequest<DonationQrDownloadResponse>('donations', {
      action: 'downloadDonationQr',
      fileId: normalizedFileId
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Unable to download QR image.'
      };
    }

    return {
      success: true,
      data: {
        fileName: String(result.fileName || 'donation-qr.png'),
        fileType: String(result.fileType || 'image/png'),
        fileData: String(result.fileData || '')
      }
    };
  },

  async subscribeNewsletter(email: string, source = 'Website Footer'): Promise<DonationsApiResponse> {
    return sendApiRequest('main', {
      action: 'subscribeNewsletter',
      email,
      source
    });
  }
};
