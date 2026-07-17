import React, { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Users as UsersIcon, FileText, Building2, Globe, Heart, UserCircle2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PillarsEditor } from './PillarsEditor';
import { PartnersEditor } from './PartnersEditor';
import { FoundersEditor } from './FoundersEditor';
import { DonationPageEditor } from './DonationPageEditor';
import { ChaptersManagement } from './ChaptersManagement';
import { ChapterEditor } from './ChapterEditor';
import { MyProfileModal } from './MyProfileModal';
import { RoleEditorModal } from './RoleEditorModal';
import { SkeletonBlock, SkeletonCircle } from './Skeleton';
import { DataService } from '../services/DriveService';
import { DonationsService } from '../services/DonationsService';
import { useAppDialog } from '../contexts/AppDialogContext';
import { ExecutiveOfficer, Founder } from '../types';
import { getSessionToken } from '../utils/session';

const initialPartnerCategories = [
  {
    id: 'coalitions',
    title: 'Coalitions',
    icon: <UsersIcon className="w-6 h-6" />,
    partners: []
  },
  {
    id: 'gov',
    title: 'Government Partners',
    icon: <Building2 className="w-6 h-6" />,
    partners: []
  }
];

interface AdminDashboardProps {
  onBack: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const { user } = useAuth();
  const { showAlert } = useAppDialog();
  const isAdmin = user?.role === 'admin';
  const isGlobalEditor = user?.role === 'editor' && !user?.chapterId;
  const isPillarEditor = user?.role === 'pillar_editor' && !!user?.pillarId;
  const isScopedUser = !!user?.chapterId || isPillarEditor;
  const canEdit = isAdmin || isGlobalEditor;
  const canAccessDashboard = canEdit || isScopedUser;
  const canEditPillars = canEdit || isPillarEditor;
  const canEditPartners = canEdit;
  const canEditFounders = isAdmin;
  const canEditDonations = isAdmin;
  const canManageChapters = isAdmin;
  const canOpenOwnChapter = !!user?.chapterId;
  const isScopedDashboard = canAccessDashboard && !canEdit;

  const [activeEditor, setActiveEditor] = useState<string | null>(null);
  const [pillars, setPillars] = useState<any[]>([]);
  const [partners, setPartners] = useState(initialPartnerCategories);
  const [founders, setFounders] = useState<Founder[]>([]);
  const [executiveOfficers, setExecutiveOfficers] = useState<ExecutiveOfficer[]>([]);
  const [chapterCount, setChapterCount] = useState(0);
  const [recentDonationsCount, setRecentDonationsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRoleEditorOpen, setIsRoleEditorOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [pillarsRes, partnersRes, foundersRes, executiveOfficersRes, chaptersRes, donationsRes] = await Promise.all([
          DataService.loadPillars(),
          DataService.loadPartners(),
          DataService.loadFounders(),
          DataService.loadExecutiveOfficers(),
          DataService.listChapters(),
          DonationsService.getPublicDonationData()
        ]);

        if (pillarsRes.success && pillarsRes.pillars?.length > 0) {
          setPillars(pillarsRes.pillars);
        }

        if (partnersRes.success && partnersRes.partners) {
          setPartners(partnersRes.partners);
        }

        if (foundersRes.success && foundersRes.founders?.length > 0) {
          setFounders(foundersRes.founders);
        }

        if (executiveOfficersRes.success && executiveOfficersRes.executiveOfficers) {
          setExecutiveOfficers(executiveOfficersRes.executiveOfficers);
        }

        if (chaptersRes.success && chaptersRes.chapters) {
          setChapterCount(chaptersRes.chapters.length);
        }

        if (donationsRes.success && donationsRes.data?.recentDonations) {
          setRecentDonationsCount(donationsRes.data.recentDonations.length);
        }
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      fetchData();
    }
  }, [user]);

  const handleSavePillars = async (updatedPillars: any) => {
    try {
      const sessionToken = getSessionToken();
      if (!sessionToken) {
        await showAlert('Session expired. Please login again.');
        return;
      }
      const result = await DataService.savePillars(updatedPillars, sessionToken);
      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }
      setPillars(updatedPillars);
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  };

  const handleSavePartners = async (updatedPartners: any) => {
    try {
      const sessionToken = getSessionToken();
      if (!sessionToken) {
        await showAlert('Session expired. Please login again.');
        return;
      }
      setPartners(updatedPartners);
      const result = await DataService.savePartners(updatedPartners, sessionToken);
      if (!result.success) {
        await showAlert('Error saving partners: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      await showAlert('Error saving partners: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  if (!canAccessDashboard) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-ocean-light to-ocean-mint dark:from-ocean-deep dark:to-ocean-dark flex items-center justify-center p-4">
        <div className="text-center text-ocean-deep dark:text-white">
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="mb-4">You don't have permission to access this dashboard.</p>
          <button
            onClick={onBack}
            className="px-6 py-2 bg-primary-blue text-white rounded-lg hover:bg-primary-cyan transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-ocean-light via-[#b2dfdb] to-ocean-mint dark:from-ocean-deep dark:via-[#021017] dark:to-ocean-dark pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="bg-white dark:bg-[#051923] rounded-2xl shadow-lg border border-white/10 p-6">
            <div className="flex items-center gap-4">
              <SkeletonCircle className="h-10 w-10 shrink-0" />
              <div className="flex-1 space-y-3">
                <SkeletonBlock className="h-10 w-80 max-w-[80vw]" />
                <SkeletonBlock className="h-4 w-64 max-w-[55vw]" />
              </div>
            </div>
          </div>

          {!isScopedDashboard && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6">
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="h-12 w-12 rounded-lg shrink-0" />
                    <div className="w-full space-y-3">
                      <SkeletonBlock className="h-7 w-16" />
                      <SkeletonBlock className="h-4 w-24" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-6">
            <SkeletonBlock className="h-8 w-52" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: isScopedDashboard ? 2 : 6 }).map((_, index) => (
                <div key={index} className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <SkeletonBlock className="h-14 w-14 rounded-lg" />
                    <SkeletonBlock className="h-4 w-12 rounded-full" />
                  </div>
                  <SkeletonBlock className="mb-3 h-7 w-40" />
                  <SkeletonBlock className="mb-2 h-4 w-full" />
                  <SkeletonBlock className="mb-3 h-4 w-3/4" />
                  <SkeletonBlock className="h-3 w-28" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-ocean-light via-[#b2dfdb] to-ocean-mint dark:from-ocean-deep dark:via-[#021017] dark:to-ocean-dark pt-24 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-[#051923] rounded-2xl shadow-lg border border-white/10 p-6 mb-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={onBack}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
                >
                  <ArrowLeft className="text-ocean-deep dark:text-white" size={24} />
                </button>
                <div>
                  <h1 className="text-3xl font-black text-ocean-deep dark:text-white">
                    Content Management Dashboard
                  </h1>
                  <p className="text-ocean-deep/60 dark:text-gray-400 mt-1">
                    Welcome back, {user?.username || user?.email || 'Admin'} • Role: {user?.role}
                  </p>
                  {isScopedDashboard && (
                    <p className="text-sm text-ocean-deep/50 dark:text-gray-500 mt-1">
                      Personal dashboard for your account and assigned chapter
                    </p>
                  )}
                </div>
              </div>

            </div>
          </div>

          {!isScopedDashboard && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            {canEditPillars && (
              <div className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary-blue/10 rounded-lg">
                    <BookOpen className="text-primary-blue" size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-ocean-deep dark:text-white">{pillars.length}</p>
                    <p className="text-sm text-ocean-deep/60 dark:text-gray-400">Pillars</p>
                  </div>
                </div>
              </div>
            )}

            {canEditPartners && (
              <div className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary-cyan/10 rounded-lg">
                    <Building2 className="text-primary-cyan" size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-ocean-deep dark:text-white">
                      {partners.reduce((sum, cat) => sum + cat.partners.length, 0)}
                    </p>
                    <p className="text-sm text-ocean-deep/60 dark:text-gray-400">Partners</p>
                  </div>
                </div>
              </div>
            )}

            {canManageChapters && (
              <div className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-teal-500/10 rounded-lg">
                    <Globe className="text-teal-500" size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-ocean-deep dark:text-white">{chapterCount}</p>
                    <p className="text-sm text-ocean-deep/60 dark:text-gray-400">Chapters</p>
                  </div>
                </div>
              </div>
            )}

            {canEditDonations && (
              <div className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-orange-500/10 rounded-lg">
                    <Heart className="text-orange-500" size={24} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-ocean-deep dark:text-white">{recentDonationsCount}</p>
                    <p className="text-sm text-ocean-deep/60 dark:text-gray-400">Recent Donations</p>
                  </div>
                </div>
              </div>
            )}
            </div>
          )}

          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-ocean-deep dark:text-white mb-4">
              {isScopedDashboard ? 'Quick Access' : 'Edit Content Sections'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <button
                onClick={() => setIsProfileOpen(true)}
                className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6 hover:border-sky-500 dark:hover:border-sky-400 transition-all hover:shadow-xl text-left group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-sky-500/10 rounded-lg group-hover:bg-sky-500/20 transition-colors">
                    <UserCircle2 className="text-sky-500" size={28} />
                  </div>
                  <span className="text-sm font-medium text-sky-500">Open</span>
                </div>
                <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-2">
                  My Profile
                </h3>
                <p className="text-sm text-ocean-deep/60 dark:text-gray-400 mb-3">
                  Update your username, email address, and password
                </p>
                <div className="text-xs text-ocean-deep/40 dark:text-gray-500">
                  {user?.email || user?.username || 'Signed-in account'}
                </div>
              </button>

              {canOpenOwnChapter && (
                <button
                  onClick={() => setActiveEditor('our-chapter')}
                  className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6 hover:border-teal-500 dark:hover:border-teal-400 transition-all hover:shadow-xl text-left group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-teal-500/10 rounded-lg group-hover:bg-teal-500/20 transition-colors">
                      <Globe className="text-teal-500" size={28} />
                    </div>
                    <span className="text-sm font-medium text-teal-500">
                      {user?.role === 'member' ? 'Open' : 'Edit'}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-2">
                    Our Chapter
                  </h3>
                  <p className="text-sm text-ocean-deep/60 dark:text-gray-400 mb-3">
                    {user?.role === 'member'
                      ? 'View your assigned chapter in a read-only chapter editor view'
                      : 'Open your assigned chapter editor and manage your chapter content'}
                  </p>
                  <div className="text-xs text-ocean-deep/40 dark:text-gray-500">
                    Chapter ID: {user?.chapterId}
                  </div>
                </button>
              )}

              {canEditPillars && (
                <button
                  onClick={() => setActiveEditor('pillars')}
                  className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6 hover:border-primary-blue dark:hover:border-primary-cyan transition-all hover:shadow-xl text-left group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-primary-blue/10 rounded-lg group-hover:bg-primary-blue/20 transition-colors">
                      <BookOpen className="text-primary-blue" size={28} />
                    </div>
                    <span className="text-sm font-medium text-primary-blue">Edit</span>
                  </div>
                  <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-2">
                    Core Pillars
                  </h3>
                  <p className="text-sm text-ocean-deep/60 dark:text-gray-400 mb-3">
                    {isPillarEditor
                      ? 'Edit only your assigned pillar and its activities'
                      : isGlobalEditor
                        ? 'Manage only the activity entries for each pillar'
                        : 'Edit the 5 core pillars and their activities'}
                  </p>
                  <div className="text-xs text-ocean-deep/40 dark:text-gray-500">
                    {isPillarEditor
                      ? `Assigned pillar: ${pillars.find((pillar: any) => String(pillar.id) === String(user?.pillarId))?.title || user?.pillarId}`
                      : `${pillars.length} pillars | ${pillars.reduce((sum: number, p: any) => sum + (p.activities?.length || 0), 0)} activities`}
                  </div>
                </button>
              )}

              {canEditPartners && (
                <button
                  onClick={() => setActiveEditor('partners')}
                  className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6 hover:border-primary-cyan dark:hover:border-primary-cyan transition-all hover:shadow-xl text-left group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-primary-cyan/10 rounded-lg group-hover:bg-primary-cyan/20 transition-colors">
                      <Building2 className="text-primary-cyan" size={28} />
                    </div>
                    <span className="text-sm font-medium text-primary-cyan">Edit</span>
                  </div>
                  <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-2">
                    Partner Organizations
                  </h3>
                  <p className="text-sm text-ocean-deep/60 dark:text-gray-400 mb-3">
                    Manage partners across all categories
                  </p>
                  <div className="text-xs text-ocean-deep/40 dark:text-gray-500">
                    {partners.reduce((sum, cat) => sum + cat.partners.length, 0)} partners | {partners.length} categories
                  </div>
                </button>
              )}

              {canEditFounders && (
                <button
                  onClick={() => setActiveEditor('founders')}
                  className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6 hover:border-purple-500 dark:hover:border-purple-400 transition-all hover:shadow-xl text-left group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-purple-500/10 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                      <UsersIcon className="text-purple-500" size={28} />
                    </div>
                    <span className="text-sm font-medium text-purple-500">Edit</span>
                  </div>
                  <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-2">
                    Founders & Leadership
                  </h3>
                  <p className="text-sm text-ocean-deep/60 dark:text-gray-400 mb-3">
                    Edit founder profiles and bios
                  </p>
                  <div className="text-xs text-ocean-deep/40 dark:text-gray-500">
                    {founders.length} founders listed
                  </div>
                </button>
              )}

              {canEditDonations && (
                <button
                  onClick={() => setActiveEditor('donations')}
                  className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6 hover:border-orange-500 dark:hover:border-orange-400 transition-all hover:shadow-xl text-left group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-orange-500/10 rounded-lg group-hover:bg-orange-500/20 transition-colors">
                      <FileText className="text-orange-500" size={28} />
                    </div>
                    <span className="text-sm font-medium text-orange-500">Edit</span>
                  </div>
                  <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-2">
                    Donation Page
                  </h3>
                  <p className="text-sm text-ocean-deep/60 dark:text-gray-400 mb-3">
                    Manage payment methods, bank details, allocations, and recent donations
                  </p>
                  <div className="text-xs text-ocean-deep/40 dark:text-gray-500">
                    Public donation page content
                  </div>
                </button>
              )}

              {canManageChapters && (
                <button
                  onClick={() => setIsRoleEditorOpen(true)}
                  className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6 hover:border-indigo-500 dark:hover:border-indigo-400 transition-all hover:shadow-xl text-left group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-indigo-500/10 rounded-lg group-hover:bg-indigo-500/20 transition-colors">
                      <ShieldCheck className="text-indigo-500" size={28} />
                    </div>
                    <span className="text-sm font-medium text-indigo-500">Manage</span>
                  </div>
                  <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-2">
                    Roles & Permissions
                  </h3>
                  <p className="text-sm text-ocean-deep/60 dark:text-gray-400 mb-3">
                    Edit user roles, hierarchy, and chapter or pillar assignments
                  </p>
                  <div className="text-xs text-ocean-deep/40 dark:text-gray-500">
                    Admin-only access control
                  </div>
                </button>
              )}

              {canManageChapters && (
                <button
                  onClick={() => setActiveEditor('chapters')}
                  className="bg-white dark:bg-[#051923] rounded-xl shadow-lg border border-white/10 p-6 hover:border-teal-500 dark:hover:border-teal-400 transition-all hover:shadow-xl text-left group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-teal-500/10 rounded-lg group-hover:bg-teal-500/20 transition-colors">
                      <Globe className="text-teal-500" size={28} />
                    </div>
                    <span className="text-sm font-medium text-teal-500">Manage</span>
                  </div>
                  <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-2">
                    Chapters & Members
                  </h3>
                  <p className="text-sm text-ocean-deep/60 dark:text-gray-400 mb-3">
                    Manage local chapters and their user accounts
                  </p>
                  <div className="text-xs text-ocean-deep/40 dark:text-gray-500">
                    Network & User administration
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeEditor === 'pillars' && (
        <PillarsEditor
          pillars={pillars}
          onSave={handleSavePillars}
          onClose={() => setActiveEditor(null)}
          activitiesOnly={isGlobalEditor}
        />
      )}

      {activeEditor === 'partners' && (
        <PartnersEditor
          categories={partners}
          onSave={handleSavePartners}
          onClose={() => setActiveEditor(null)}
        />
      )}

      {activeEditor === 'founders' && canEditFounders && (
        <FoundersEditor
          founders={founders}
          executiveOfficers={executiveOfficers}
          onSave={({ founders: nextFounders, executiveOfficers: nextExecutiveOfficers }) => {
            setFounders(nextFounders);
            setExecutiveOfficers(nextExecutiveOfficers);
          }}
          onClose={() => setActiveEditor(null)}
        />
      )}

      {activeEditor === 'donations' && canEditDonations && (
        <DonationPageEditor onBack={() => setActiveEditor(null)} />
      )}

      {activeEditor === 'chapters' && canManageChapters && (
        <ChaptersManagement onBack={() => setActiveEditor(null)} />
      )}

      {activeEditor === 'our-chapter' && canOpenOwnChapter && (
        <ChapterEditor onBack={() => setActiveEditor(null)} />
      )}

      <MyProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

      {isAdmin && (
        <RoleEditorModal
          isOpen={isRoleEditorOpen}
          onClose={() => setIsRoleEditorOpen(false)}
        />
      )}
    </>
  );
};
