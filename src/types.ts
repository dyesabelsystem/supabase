export interface Story {
  id: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  date: string;
}

export interface Founder {
  id: string;
  name: string;
  role: string;
  bio: string;
  imageUrl: string;
  imageFileId?: string;
}

export interface ExecutiveOfficer {
  id: string;
  name: string;
  role: string;
  imageUrl: string;
  imageFileId?: string;
}

export interface NavLink {
  label: string;
  href: string;
  isButton?: boolean;
}

// New interface for Chapter Activities
export interface ChapterActivity {
  id: number | string;
  title: string;
  description: string;
  date?: string;
  imageUrl?: string;
  imageFileId?: string;
  learnMoreUrl?: string;
}

export interface Chapter {
  id: string;
  name: string;
  location: string;
  logo: string;
  logoUrl?: string; // Backward-compatible alias used by some chapter payloads
  logoFileId?: string; // Google Drive file ID for replacement/deletion
  image?: string; // Cover image for the chapter
  imageUrl?: string; // Backward-compatible alias used by backend responses/components
  imageFileId?: string;
  description?: string;
  email?: string;
  phone?: string;
  facebook?: string;
  
  // Newly added fields
  twitter?: string;
  instagram?: string;
  websiteUrl?: string;
  
  // Leadership fields
  headName?: string;
  headRole?: string;
  headQuote?: string;
  headImageUrl?: string;
  headImageFileId?: string;
  
  // Join CTA fields
  joinUrl?: string;
  joinCtaDescription?: string;
  
  // Activities list
  activities?: ChapterActivity[];
}

export interface PillarActivity {
  id: string;
  title: string;
  date: string;
  description: string;
  imageUrl: string;
  imageFileId?: string;
  learnMoreUrl?: string;
  applicationOpen?: boolean;
  applicationUrl?: string;
  applicationLabel?: string;
  applicationNote?: string;
}

export interface PillarSocialLinks {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  youtube?: string;
  website?: string;
}

export interface PillarJoinNow {
  isOpen?: boolean;
  url?: string;
  label?: string;
  description?: string;
}

export interface Pillar {
  id: string;
  title: string;
  excerpt: string;
  description: string;
  aim: string;
  imageUrl: string;
  imageFileId?: string;
  impactAreas?: string[];
  socialLinks?: PillarSocialLinks;
  joinNow?: PillarJoinNow;
  activities: PillarActivity[];
}

// ==========================================
// USER & AUTHENTICATION TYPES & CONSTANTS
// ==========================================

export type UserRole = 'admin' | 'editor' | 'chapter_head' | 'member';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  chapterId?: string;
}

// Storage keys
export const SESSION_TOKEN_KEY = 'dyesabel_session';
export const USER_STORAGE_KEY = 'dyesabel_user';

// Available user roles (for dropdowns, etc.)
export const USER_ROLES = ['member', 'editor', 'chapter_head', 'admin'] as const;

// Role display labels
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  editor: 'Editor',
  chapter_head: 'Chapter Head',
  member: 'Member'
};

// Role badge colors (Tailwind classes)
export const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'bg-red-500',
  editor: 'bg-blue-500',
  chapter_head: 'bg-green-500',
  member: 'bg-gray-500'
};
