import React, { Suspense, lazy, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { Hero } from './components/Hero';
import { Slogan } from './components/Slogan';
import { Pillars } from './components/Stories';
import { Chapters } from './components/Chapters';
import { Partners } from './components/Partners';
import { Founders } from './components/Founders';
import { Footer } from './components/Footer';
import { BackgroundBubbles } from './components/BackgroundBubbles';
import { LoadingScreen } from './components/LoadingScreen';
import { DonatePage } from './components/DonatePage';
import { PillarDetail } from './components/PillarDetail';
import { ChapterDetail } from './components/ChapterDetail';
import { ChatbotWidget } from './components/ChatbotWidget';
import { LegalPage } from './components/LegalPage';
import { useAuth } from './contexts/AuthContext';
import { AppView, patchPersistedAppState, readPersistedAppState } from './utils/appState';
import { Chapter, ExecutiveOfficer, Pillar, User } from './types';
import { DataService, getImageDebugInfo } from './services/DriveService';
import { getSessionToken, getSessionUser } from './utils/session';
import { BookOpen, Heart, Leaf, Palette, Scale } from 'lucide-react';
import PortalInfo from './components/PortalInfo';
import { APP_CONFIG } from './config';
import {
  buildDashboardPath,
  buildChapterPath,
  buildPillarPath,
  canUserAccessDashboard,
  DONATE_PATH,
  getDefaultAuthenticatedPath,
  HOME_PATH,
  isChapterRouteForChapter,
  isDashboardRouteForUser,
  isPillarRouteForPillar,
  LOGIN_PATH,
  parseAppPath,
  PRIVACY_POLICY_PATH,
  TERMS_OF_SERVICE_PATH
} from './utils/routes';

const LoginModal = lazy(() => import('./components/LoginModal').then((module) => ({ default: module.LoginModal })));
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage').then((module) => ({ default: module.ResetPasswordPage })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const ChapterEditor = lazy(() => import('./components/ChapterEditor').then((module) => ({ default: module.ChapterEditor })));
const LandingPageEditor = lazy(() => import('./components/LandingPageEditor').then((module) => ({ default: module.LandingPageEditor })));
const PillarsEditor = lazy(() => import('./components/PillarsEditor').then((module) => ({ default: module.PillarsEditor })));
const PartnersEditor = lazy(() => import('./components/PartnersEditor').then((module) => ({ default: module.PartnersEditor })));
const FoundersEditor = lazy(() => import('./components/FoundersEditor').then((module) => ({ default: module.FoundersEditor })));

const getIconForIndex = (index: number) => {
  const icons = [
    <BookOpen className="w-6 h-6 text-white" />,
    <Scale className="w-6 h-6 text-white" />,
    <Leaf className="w-6 h-6 text-white" />,
    <Heart className="w-6 h-6 text-white" />,
    <Palette className="w-6 h-6 text-white" />
  ];

  return icons[index % icons.length];
};

const readStoredTheme = () => {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem('theme') || 'dark';
};

const SEO_SITE_ORIGIN = 'https://www.dyesabelph.org';
const SEO_HOME_PATH = '/home';
const SEO_DEFAULT_IMAGE = `${SEO_SITE_ORIGIN}/icons/social-preview-image.png`;
const SEO_DEFAULT_DESCRIPTION =
  'Empowering communities through youth environmental advocacy, sustainable development, and education as a non-profit organization in the Philippines, with active programs in Davao City and nearby communities.';
const ENABLE_IMAGE_DIAGNOSTICS = import.meta.env.DEV && import.meta.env.VITE_ENABLE_IMAGE_DIAGNOSTICS === 'true';
const SEO_BASE_KEYWORDS = [
  'Dyesabel Philippines',
  'Dyesabel PH',
  'youth environmental advocacy',
  'non-profit organization in the Philippines',
  'environmental education Philippines',
  'community development Philippines',
  'sustainable development Philippines',
  'Davao City youth organization',
  'Davao City environmental advocacy',
  'non-profit organization in Davao City',
  'volunteer opportunities Davao City',
  'eco advocacy Mindanao'
];

const normalizeSeoPath = (path: string): string => {
  if (!path || path === '/') return SEO_HOME_PATH;
  return path.startsWith('/') ? path : `/${path}`;
};

const toTitleCaseFromSlug = (value: string): string => {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
};

const joinSeoKeywords = (...groups: Array<Array<string | undefined | null>>): string => {
  const unique = Array.from(
    new Set(
      groups
        .flat()
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
  return unique.join(', ');
};

const ensureMetaTag = (attribute: 'name' | 'property', value: string): HTMLMetaElement => {
  const selector = `meta[${attribute}="${value}"]`;
  const existing = document.head.querySelector(selector);
  if (existing instanceof HTMLMetaElement) return existing;
  const tag = document.createElement('meta');
  tag.setAttribute(attribute, value);
  document.head.appendChild(tag);
  return tag;
};

const setMetaTag = (attribute: 'name' | 'property', value: string, content: string) => {
  ensureMetaTag(attribute, value).setAttribute('content', content);
};

const setCanonicalTag = (href: string) => {
  const selector = 'link[rel="canonical"]';
  const existing = document.head.querySelector(selector);
  const link = existing instanceof HTMLLinkElement ? existing : document.createElement('link');
  link.setAttribute('rel', 'canonical');
  link.setAttribute('href', href);
  if (!(existing instanceof HTMLLinkElement)) {
    document.head.appendChild(link);
  }
};

function AppContent() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isGlobalEditor = user?.role === 'editor' && !user?.chapterId;
  const isScopedDashboardUser = !!user?.chapterId || (user?.role === 'pillar_editor' && !!user?.pillarId);
  const canAccessDashboard = isAdmin || isGlobalEditor || isScopedDashboardUser;

  const [theme, setTheme] = useState(readStoredTheme);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [selectedPillarId, setSelectedPillarId] = useState<string | null>(null);
  const [isChapterEditorOpen, setIsChapterEditorOpen] = useState(false);
  const [isPillarEditorOpen, setIsPillarEditorOpen] = useState(false);
  const [isPartnersEditorOpen, setIsPartnersEditorOpen] = useState(false);
  const [isFoundersEditorOpen, setIsFoundersEditorOpen] = useState(false);
  const [isLandingEditorOpen, setIsLandingEditorOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isDonatePageOpen, setIsDonatePageOpen] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [pathname, setPathname] = useState(() => window.location.pathname || '/');
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [founders, setFounders] = useState<any[]>([]);
  const [executiveOfficers, setExecutiveOfficers] = useState<ExecutiveOfficer[]>([]);

  const hasRestoredAppState = useRef(false);
  const hasHydratedNavigationState = useRef(false);
  const currentViewRef = useRef<AppView>('home');
  const scrollSaveTimer = useRef<number | null>(null);
  const currentRoute = parseAppPath(pathname);
  const isLegalPage = currentRoute.type === 'privacy-policy' || currentRoute.type === 'terms-of-service';

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => String(chapter.id) === String(selectedChapterId)) || null,
    [chapters, selectedChapterId]
  );
  const selectedPillar = useMemo(
    () => pillars.find((pillar) => String(pillar.id) === String(selectedPillarId)) || null,
    [pillars, selectedPillarId]
  );
  const displayPillars = useMemo(
    () => pillars.map((pillar, index) => ({ ...pillar, icon: getIconForIndex(index) })),
    [pillars]
  );

  const isScopedEditorForSelectedChapter =
    !!user && !!selectedChapter && user.role === 'editor' && user.chapterId === selectedChapter.id;
  const isChapterHeadForSelectedChapter =
    !!user && !!selectedChapter && user.role === 'chapter_head' && user.chapterId === selectedChapter.id;
  const canEditSelectedChapter =
    !!user &&
    !!selectedChapter &&
    (user.role === 'admin' || isScopedEditorForSelectedChapter || isChapterHeadForSelectedChapter);

  const currentPageLabel = useMemo(() => {
    if (isLoginModalOpen) return 'Login';
    if (showDashboard) return user ? `${user.username} ${user.role.replace('_', ' ')}` : 'Dashboard';
    if (isDonatePageOpen) return 'Donate';
    if (currentRoute.type === 'privacy-policy') return 'Privacy Policy';
    if (currentRoute.type === 'terms-of-service') return 'Terms of Service';
    if (selectedChapter) return selectedChapter.name;
    if (selectedPillar) return selectedPillar.title;
    return 'Home';
  }, [currentRoute.type, isDonatePageOpen, isLoginModalOpen, selectedChapter, selectedPillar, showDashboard, user]);

  const seoMetadata = useMemo(() => {
    const routePath = normalizeSeoPath(pathname || SEO_HOME_PATH);
    const canonicalUrl = `${SEO_SITE_ORIGIN}${routePath}`;
    const routeType = currentRoute.type;
    const organization = APP_CONFIG.organizationName || 'DYESABEL PH Inc.';

    const metadata = {
      title: `${currentPageLabel} - Dyesabel Philippines`,
      description: SEO_DEFAULT_DESCRIPTION,
      canonicalUrl,
      image: SEO_DEFAULT_IMAGE,
      imageAlt: 'Dyesabel Philippines social preview image',
      keywords: joinSeoKeywords(SEO_BASE_KEYWORDS),
      robots: 'index,follow',
      ogType: 'website'
    };

    if (routeType === 'donate') {
      metadata.title = `Donate - Dyesabel Philippines`;
      metadata.description = 'Support Dyesabel projects for youth environmental advocacy, education, and sustainable community development in Davao City and across the Philippines.';
      metadata.keywords = joinSeoKeywords(
        SEO_BASE_KEYWORDS,
        ['donate to non-profit Philippines', 'donate Davao City', 'support youth advocacy Philippines']
      );
      return metadata;
    }

    if (routeType === 'privacy-policy') {
      metadata.title = 'Privacy Policy - Dyesabel Philippines';
      metadata.description = 'Learn how DYESABEL PH Inc. collects, uses, shares, stores, and protects personal data through its website and related services.';
      metadata.keywords = joinSeoKeywords(SEO_BASE_KEYWORDS, ['DYESABEL privacy policy', 'data privacy Philippines']);
      return metadata;
    }

    if (routeType === 'terms-of-service') {
      metadata.title = 'Terms of Service - Dyesabel Philippines';
      metadata.description = 'Read the terms that apply to the DYESABEL PH Inc. website, accounts, chatbot, donation information, and linked services.';
      metadata.keywords = joinSeoKeywords(SEO_BASE_KEYWORDS, ['DYESABEL terms of service', 'website terms Philippines']);
      return metadata;
    }

    if (routeType === 'chapter') {
      const chapterNameFromRoute = toTitleCaseFromSlug(currentRoute.chapterSlug);
      const chapterName = selectedChapter?.name || chapterNameFromRoute || 'Chapter';
      const chapterDescription =
        selectedChapter?.description ||
        `Explore ${chapterName} Chapter programs on youth environmental advocacy, sustainability education, and community action in the Philippines.`;
      const chapterLocation = selectedChapter?.location || '';
      metadata.title = `${chapterName} Chapter - Dyesabel Philippines`;
      metadata.description = chapterDescription;
      metadata.image = selectedChapter?.imageUrl || selectedChapter?.image || selectedChapter?.logo || SEO_DEFAULT_IMAGE;
      metadata.imageAlt = `${chapterName} Chapter - Dyesabel Philippines`;
      metadata.keywords = joinSeoKeywords(
        SEO_BASE_KEYWORDS,
        [
          `${chapterName} chapter`,
          `${chapterName} environmental advocacy`,
          chapterLocation ? `${chapterLocation} non-profit` : undefined,
          chapterLocation ? `${chapterLocation} youth organization` : undefined
        ]
      );
      metadata.ogType = 'article';
      return metadata;
    }

    if (routeType === 'pillar') {
      const pillarTitleFromRoute = toTitleCaseFromSlug(currentRoute.pillarSlug);
      const pillarTitle = selectedPillar?.title || pillarTitleFromRoute || 'Pillar';
      const pillarDescription =
        selectedPillar?.excerpt ||
        selectedPillar?.description ||
        `Learn about the ${pillarTitle} pillar of Dyesabel Philippines focused on youth, environment, and sustainable communities.`;
      metadata.title = `${pillarTitle} - Dyesabel Philippines`;
      metadata.description = pillarDescription;
      metadata.image = selectedPillar?.imageUrl || SEO_DEFAULT_IMAGE;
      metadata.imageAlt = `${pillarTitle} - Dyesabel Philippines`;
      metadata.keywords = joinSeoKeywords(
        SEO_BASE_KEYWORDS,
        [`${pillarTitle} Dyesabel`, `${pillarTitle} Philippines`, 'youth sustainability programs']
      );
      metadata.ogType = 'article';
      return metadata;
    }

    if (routeType === 'dashboard' || routeType === 'login' || routeType === 'reset-password') {
      metadata.robots = 'noindex,nofollow';
      return metadata;
    }

    metadata.title = `${organization} - Youth Environmental Advocacy in the Philippines`;
    metadata.keywords = joinSeoKeywords(
      SEO_BASE_KEYWORDS,
      [
        'Davao City non-profit organization',
        'Philippines environmental NGO',
        'youth empowerment Davao City',
        'community outreach Philippines'
      ]
    );
    return metadata;
  }, [currentPageLabel, currentRoute.type, pathname, selectedChapter, selectedPillar]);

  const currentView: AppView = isLegalPage
    ? 'legal'
    : showDashboard
    ? 'dashboard'
    : isDonatePageOpen
      ? 'donate'
      : selectedPillarId
        ? 'pillar'
        : selectedChapterId
          ? 'chapter'
          : 'home';

  const restoreScrollForView = (view: AppView) => {
    const persistedState = readPersistedAppState();
    const nextScrollY = Math.max(0, Math.floor(persistedState.scrollPositions[view] || 0));

    window.requestAnimationFrame(() => {
      window.scrollTo(0, nextScrollY);
    });
  };

  const syncPathname = () => {
    setPathname(window.location.pathname || '/');
  };

  const navigateTo = (nextPath: string, options?: { replace?: boolean }) => {
    const normalizedNextPath = nextPath || HOME_PATH;
    const currentPath = window.location.pathname || '/';

    if (currentPath === normalizedNextPath) {
      syncPathname();
      return;
    }

    const historyMethod = options?.replace ? 'replaceState' : 'pushState';
    window.history[historyMethod](null, '', normalizedNextPath);
    syncPathname();
  };

  useEffect(() => {
    currentViewRef.current = currentView;
    if (!hasHydratedNavigationState.current) return;
    patchPersistedAppState({
      view: currentView,
      selectedChapterId,
      selectedPillarId
    });
  }, [currentView, selectedChapterId, selectedPillarId]);

  useEffect(() => {
    const handlePopState = () => syncPathname();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    setIsLoginModalOpen(currentRoute.type === 'login');

    if (currentRoute.type === 'home' || currentRoute.type === 'root' || currentRoute.type === 'unknown') {
      startTransition(() => {
        setIsDonatePageOpen(false);
        setShowDashboard(false);
        setSelectedChapterId(null);
        setSelectedPillarId(null);
      });
      return;
    }

    if (currentRoute.type === 'privacy-policy' || currentRoute.type === 'terms-of-service') {
      startTransition(() => {
        setIsDonatePageOpen(false);
        setShowDashboard(false);
        setSelectedChapterId(null);
        setSelectedPillarId(null);
      });
      return;
    }

    if (currentRoute.type === 'donate') {
      startTransition(() => {
        setIsDonatePageOpen(true);
        setShowDashboard(false);
        setSelectedChapterId(null);
        setSelectedPillarId(null);
      });
      return;
    }

    if (currentRoute.type === 'chapter') {
      startTransition(() => {
        setIsDonatePageOpen(false);
        setShowDashboard(false);
        setSelectedChapterId(currentRoute.chapterId);
        setSelectedPillarId(null);
      });
      return;
    }

    if (currentRoute.type === 'pillar') {
      startTransition(() => {
        setIsDonatePageOpen(false);
        setShowDashboard(false);
        setSelectedChapterId(null);
        setSelectedPillarId(currentRoute.pillarId);
      });
      return;
    }

    if (currentRoute.type === 'dashboard') {
      startTransition(() => {
        setIsDonatePageOpen(false);
        setShowDashboard(true);
        setSelectedChapterId(null);
        setSelectedPillarId(null);
      });
    }
  }, [currentRoute]);

  useEffect(() => {
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    const timeoutId = window.setTimeout(() => {
      document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
    }, 100);

    return () => {
      window.clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [displayPillars, chapters, selectedChapterId, selectedPillarId, isDonatePageOpen, isLegalPage, showDashboard, isLoading]);

  useEffect(() => {
    const loadAllData = async () => {
      setIsLoading(true);

      try {
        const [pillarsRes, chaptersRes, partnersRes, foundersRes, executiveOfficersRes] = await Promise.all([
          DataService.loadPillars(),
          DataService.listChapters(),
          DataService.loadPartners(),
          DataService.loadFounders(),
          DataService.loadExecutiveOfficers()
        ]);

        if (pillarsRes.success && Array.isArray(pillarsRes.pillars)) {
          const imageDiagnostics = pillarsRes.pillars.map((pillar) => ({
            pillarId: pillar.id,
            pillarTitle: pillar.title,
            ...getImageDebugInfo(pillar.imageUrl)
          }));

          if (ENABLE_IMAGE_DIAGNOSTICS) {
            console.log('[App] Loaded pillars image diagnostics', imageDiagnostics);

            const invalidImageEntries = imageDiagnostics.filter((entry) => !entry.hasUrl);
            if (invalidImageEntries.length) {
              console.warn('[App] Pillars with missing image URLs', invalidImageEntries);
            }
          }

          setPillars(pillarsRes.pillars);
        } else {
          console.error('[App] Failed to load pillars data', pillarsRes);
        }

        if (chaptersRes.success && Array.isArray(chaptersRes.chapters)) {
          const chapterLogoDiagnostics = chaptersRes.chapters.map((chapter) => {
            const rawLogo = String(chapter.logo || chapter.logoUrl || '').trim();
            return {
              chapterId: chapter.id,
              chapterName: chapter.name,
              logoRaw: rawLogo,
              logoMatchesChapterId: rawLogo !== '' && rawLogo === String(chapter.id || ''),
              availableLogoFields: Object.keys(chapter).filter((key) => /logo/i.test(key)),
              ...getImageDebugInfo(rawLogo)
            };
          });

          if (ENABLE_IMAGE_DIAGNOSTICS) {
            console.log('[App] Loaded chapters logo diagnostics', chapterLogoDiagnostics);

            const chaptersWithMissingLogo = chapterLogoDiagnostics.filter((entry) => !entry.hasUrl);
            if (chaptersWithMissingLogo.length) {
              console.warn('[App] Chapters with missing logo URLs', chaptersWithMissingLogo);
            }

            const chaptersWithSuspiciousLogo = chapterLogoDiagnostics.filter((entry) => entry.logoMatchesChapterId);
            if (chaptersWithSuspiciousLogo.length) {
              console.warn('[App] Chapters with suspicious logo values (same as chapter id)', chaptersWithSuspiciousLogo);
            }
          }

          setChapters(chaptersRes.chapters);
        } else {
          console.error('[App] Failed to load chapters data', chaptersRes);
        }

        if (partnersRes.success && partnersRes.partners) {
          setPartners(partnersRes.partners);
        }

        if (foundersRes.success && foundersRes.founders) {
          setFounders(foundersRes.founders);
        }

        if (executiveOfficersRes.success && executiveOfficersRes.executiveOfficers) {
          setExecutiveOfficers(executiveOfficersRes.executiveOfficers);
        }
      } catch (error) {
        console.error('[App] Unhandled homepage data load error', error);
      } finally {
        window.setTimeout(() => setIsLoading(false), 300);
      }
    };

    void loadAllData();
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    window.localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.title = seoMetadata.title;
    setCanonicalTag(seoMetadata.canonicalUrl);

    setMetaTag('name', 'description', seoMetadata.description);
    setMetaTag('name', 'keywords', seoMetadata.keywords);
    setMetaTag('name', 'robots', seoMetadata.robots);

    setMetaTag('property', 'og:type', seoMetadata.ogType);
    setMetaTag('property', 'og:title', seoMetadata.title);
    setMetaTag('property', 'og:description', seoMetadata.description);
    setMetaTag('property', 'og:url', seoMetadata.canonicalUrl);
    setMetaTag('property', 'og:image', seoMetadata.image);
    setMetaTag('property', 'og:image:alt', seoMetadata.imageAlt);

    setMetaTag('name', 'twitter:title', seoMetadata.title);
    setMetaTag('name', 'twitter:description', seoMetadata.description);
    setMetaTag('name', 'twitter:image', seoMetadata.image);
  }, [seoMetadata]);

  useEffect(() => {
    if (isLoading || hasRestoredAppState.current) return;

    const persistedState = readPersistedAppState();
    hasRestoredAppState.current = true;
    hasHydratedNavigationState.current = true;

    const routeDrivenView: AppView =
      currentRoute.type === 'privacy-policy' || currentRoute.type === 'terms-of-service'
        ? 'legal'
        : currentRoute.type === 'donate'
        ? 'donate'
        : currentRoute.type === 'dashboard'
          ? 'dashboard'
          : currentRoute.type === 'chapter'
            ? 'chapter'
            : currentRoute.type === 'pillar'
              ? 'pillar'
          : 'home';

    const isChapterRoute = currentRoute.type === 'chapter';
    const isPillarRoute = currentRoute.type === 'pillar';
    const shouldUsePersistedDetailView = !isChapterRoute && !isPillarRoute && routeDrivenView === 'home';

    startTransition(() => {
      setSelectedChapterId(
        isChapterRoute ? currentRoute.chapterId : shouldUsePersistedDetailView ? persistedState.selectedChapterId : null
      );
      setSelectedPillarId(
        isPillarRoute ? currentRoute.pillarId : shouldUsePersistedDetailView ? persistedState.selectedPillarId : null
      );
      setIsDonatePageOpen(currentRoute.type === 'donate');
      setShowDashboard(currentRoute.type === 'dashboard');
      setIsLoginModalOpen(currentRoute.type === 'login');
    });

    restoreScrollForView(shouldUsePersistedDetailView ? persistedState.view : routeDrivenView);
  }, [currentRoute.type, isLoading]);

  useEffect(() => {
    if (isAuthLoading) return;

    if (currentRoute.type === 'reset-password') return;

    if (currentRoute.type === 'root' || (currentRoute.type === 'unknown' && pathname !== '/portal-info')) {
      navigateTo(HOME_PATH, { replace: true });
      return;
    }

    if (currentRoute.type === 'login' && user) {
      navigateTo(getDefaultAuthenticatedPath(user), { replace: true });
      return;
    }

    if (currentRoute.type === 'chapter') {
      if (isLoading) return;

      const matchedChapter = chapters.find((chapter) => String(chapter.id) === String(currentRoute.chapterId));
      if (!matchedChapter) {
        navigateTo(HOME_PATH, { replace: true });
        return;
      }

      if (!isChapterRouteForChapter(currentRoute, matchedChapter)) {
        navigateTo(buildChapterPath(matchedChapter), { replace: true });
      }
      return;
    }

    if (currentRoute.type === 'pillar') {
      if (isLoading) return;

      const matchedPillar = pillars.find((pillar) => String(pillar.id) === String(currentRoute.pillarId));
      if (!matchedPillar) {
        navigateTo(HOME_PATH, { replace: true });
        return;
      }

      if (!isPillarRouteForPillar(currentRoute, matchedPillar)) {
        navigateTo(buildPillarPath(matchedPillar), { replace: true });
      }
      return;
    }

    if (currentRoute.type !== 'dashboard') return;

    if (!user) {
      navigateTo(LOGIN_PATH, { replace: true });
      return;
    }

    if (!canUserAccessDashboard(user)) {
      navigateTo(HOME_PATH, { replace: true });
      return;
    }

    if (!isDashboardRouteForUser(currentRoute, user)) {
      navigateTo(buildDashboardPath(user), { replace: true });
    }
  }, [chapters, currentRoute, isAuthLoading, isLoading, pillars, user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const persistScrollPosition = () => {
      patchPersistedAppState({
        scrollPositions: {
          [currentViewRef.current]: window.scrollY
        }
      });
    };

    const handleScroll = () => {
      if (scrollSaveTimer.current !== null) {
        window.clearTimeout(scrollSaveTimer.current);
      }

      scrollSaveTimer.current = window.setTimeout(persistScrollPosition, 120);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    persistScrollPosition();

    return () => {
      if (scrollSaveTimer.current !== null) {
        window.clearTimeout(scrollSaveTimer.current);
      }
      persistScrollPosition();
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (isLoading || !hasRestoredAppState.current) return;
    restoreScrollForView(currentView);
  }, [currentView, isLoading]);

  const toggleTheme = () => setTheme((previousTheme) => previousTheme === 'light' ? 'dark' : 'light');

  const closeEditors = () => {
    setIsChapterEditorOpen(false);
    setIsPillarEditorOpen(false);
    setIsPartnersEditorOpen(false);
    setIsFoundersEditorOpen(false);
    setIsLandingEditorOpen(false);
  };

  const resetToHome = (restorePreviousScroll: boolean) => {
    closeEditors();

    startTransition(() => {
      setSelectedChapterId(null);
      setSelectedPillarId(null);
      setIsLoginModalOpen(false);
      setIsDonatePageOpen(false);
      setShowDashboard(false);
    });

    navigateTo(HOME_PATH);
    patchPersistedAppState({
      view: 'home',
      selectedChapterId: null,
      selectedPillarId: null
    });

    if (restorePreviousScroll) {
      window.setTimeout(() => restoreScrollForView('home'), 0);
      return;
    }

    patchPersistedAppState({
      scrollPositions: { home: 0 }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleHeaderHomeClick = () => {
    resetToHome(false);
  };

  const handleBackToHome = () => {
    resetToHome(true);
  };

  const handleOpenDashboard = () => {
    if (!user) return;

    closeEditors();
    startTransition(() => {
      setIsLoginModalOpen(false);
      setIsDonatePageOpen(false);
      setSelectedChapterId(null);
      setSelectedPillarId(null);
      setShowDashboard(true);
    });
    navigateTo(buildDashboardPath(user));
    patchPersistedAppState({
      view: 'dashboard',
      selectedChapterId: null,
      selectedPillarId: null,
      scrollPositions: { dashboard: 0 }
    });
    window.scrollTo(0, 0);
  };

  const handleDonateClick = (event?: React.MouseEvent) => {
    event?.preventDefault();
    closeEditors();
    startTransition(() => {
      setIsLoginModalOpen(false);
      setIsDonatePageOpen(true);
      setSelectedChapterId(null);
      setSelectedPillarId(null);
      setShowDashboard(false);
    });
    navigateTo(DONATE_PATH);
    patchPersistedAppState({
      view: 'donate',
      selectedChapterId: null,
      selectedPillarId: null,
      scrollPositions: { donate: 0 }
    });
    window.scrollTo(0, 0);
  };

  const handleSelectPillar = (pillar: Pillar) => {
    closeEditors();
    startTransition(() => {
      setSelectedPillarId(pillar.id);
      setSelectedChapterId(null);
      setIsDonatePageOpen(false);
      setShowDashboard(false);
    });
    navigateTo(buildPillarPath(pillar));
    patchPersistedAppState({
      view: 'pillar',
      selectedChapterId: null,
      selectedPillarId: pillar.id,
      scrollPositions: { pillar: 0 }
    });
    window.scrollTo(0, 0);
  };

  const handleSelectChapter = (chapter: Chapter) => {
    closeEditors();
    startTransition(() => {
      setSelectedChapterId(chapter.id);
      setSelectedPillarId(null);
      setIsDonatePageOpen(false);
      setShowDashboard(false);
    });
    navigateTo(buildChapterPath(chapter));
    patchPersistedAppState({
      view: 'chapter',
      selectedChapterId: chapter.id,
      selectedPillarId: null,
      scrollPositions: { chapter: 0 }
    });
    window.scrollTo(0, 0);
  };

  const handleFooterNavigation = (sectionId: string) => {
    resetToHome(false);

    window.setTimeout(() => {
      if (sectionId === 'home') {
        patchPersistedAppState({ scrollPositions: { home: 0 } });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const element = document.getElementById(sectionId);
      if (!element) return;

      const headerOffset = 90;
      const offsetPosition = element.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }, 100);
  };

  const handleLoginSuccess = () => {
    setIsLoginModalOpen(false);

    const storedUser: User | null = user || getSessionUser();

    if (!storedUser) return;

    if (
      storedUser.role === 'admin' ||
      (storedUser.role === 'editor' && !storedUser.chapterId) ||
      (storedUser.role === 'pillar_editor' && !!storedUser.pillarId) ||
      !!storedUser.chapterId
    ) {
      handleOpenDashboard();
      return;
    }

    navigateTo(HOME_PATH, { replace: true });
    if (storedUser.role !== 'member' && storedUser.chapterId) {
      const matchedChapter = chapters.find((chapter) => chapter.id === storedUser?.chapterId);
      if (matchedChapter) {
        handleSelectChapter(matchedChapter);
      }
    }
  };

  const handleLegalNavigation = (path: string) => {
    const legalPath = path === TERMS_OF_SERVICE_PATH ? TERMS_OF_SERVICE_PATH : PRIVACY_POLICY_PATH;
    closeEditors();
    startTransition(() => {
      setIsLoginModalOpen(false);
      setIsDonatePageOpen(false);
      setSelectedChapterId(null);
      setSelectedPillarId(null);
      setShowDashboard(false);
    });
    navigateTo(legalPath);
    patchPersistedAppState({
      view: 'legal',
      selectedChapterId: null,
      selectedPillarId: null,
      scrollPositions: { legal: 0 }
    });
    window.scrollTo(0, 0);
  };

  if (currentRoute.type === 'reset-password') {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <ResetPasswordPage />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen relative text-ocean-deep dark:text-white transition-colors duration-500 overflow-x-hidden">
      {isLoading && <LoadingScreen />}
      <BackgroundBubbles />

      <Header
        theme={theme}
        toggleTheme={toggleTheme}
        onHomeClick={handleHeaderHomeClick}
        onSignInClick={() => navigateTo(LOGIN_PATH)}
        onOpenDashboard={canAccessDashboard ? handleOpenDashboard : undefined}
        isDashboardOpen={showDashboard}
      />

      <main className="relative">
        <Suspense fallback={<LoadingScreen />}>
          {isLandingEditorOpen ? (
            <LandingPageEditor onBack={() => setIsLandingEditorOpen(false)} />
          ) : isPartnersEditorOpen ? (
            <PartnersEditor
              categories={partners}
              onSave={(nextPartners) => {
                setPartners(nextPartners);
                setIsPartnersEditorOpen(false);
              }}
              onClose={() => setIsPartnersEditorOpen(false)}
            />
          ) : isFoundersEditorOpen ? (
            <FoundersEditor
              founders={founders}
              executiveOfficers={executiveOfficers}
              onSave={({ founders: nextFounders, executiveOfficers: nextExecutiveOfficers }) => {
                setFounders(nextFounders);
                setExecutiveOfficers(nextExecutiveOfficers);
                setIsFoundersEditorOpen(false);
              }}
              onClose={() => setIsFoundersEditorOpen(false)}
            />
          ) : isPillarEditorOpen ? (
            <PillarsEditor
              pillars={displayPillars}
              onSave={async (nextPillars) => {
                const sessionToken = getSessionToken();
                if (!sessionToken) throw new Error('Session expired. Please log in again.');
                const result = await DataService.savePillars(nextPillars, sessionToken);
                if (!result.success) throw new Error(result.error || 'Unable to save pillars.');
                setPillars(nextPillars);
                setIsPillarEditorOpen(false);
              }}
              onClose={() => setIsPillarEditorOpen(false)}
            />
          ) : isChapterEditorOpen ? (
            <ChapterEditor
              chapter={selectedChapter || undefined}
              onBack={() => setIsChapterEditorOpen(false)}
            />
          ) : showDashboard && isAuthenticated ? (
            canAccessDashboard ? (
              <AdminDashboard onBack={handleBackToHome} />
            ) : (
              <div className="pt-32 text-center">
                <h2 className="text-2xl font-bold">Access Denied</h2>
              </div>
            )
          ) : pathname === '/portal-info' ? (
            <PortalInfo />
          ) : currentRoute.type === 'privacy-policy' ? (
            <LegalPage type="privacy" onBack={handleBackToHome} onNavigate={handleLegalNavigation} />
          ) : currentRoute.type === 'terms-of-service' ? (
            <LegalPage type="terms" onBack={handleBackToHome} onNavigate={handleLegalNavigation} />
          ) : isDonatePageOpen ? (
            <DonatePage onBack={handleBackToHome} />
          ) : selectedPillar ? (
            <PillarDetail
              pillar={selectedPillar}
              onBack={handleBackToHome}
              onEdit={() => setIsPillarEditorOpen(true)}
            />
          ) : selectedChapter ? (
            <ChapterDetail
              chapter={selectedChapter}
              onBack={handleBackToHome}
              onEdit={canEditSelectedChapter ? () => setIsChapterEditorOpen(true) : undefined}
            />
          ) : (
            <>
              <Hero onDonateClick={handleDonateClick} />
              <Slogan />
              <Pillars
                pillars={displayPillars}
                isLoading={isLoading}
                onSelectPillar={handleSelectPillar}
              />
              <Chapters
                chapters={chapters}
                isLoading={isLoading}
                onSelectChapter={handleSelectChapter}
              />
              <Partners
                partners={partners}
                isLoading={isLoading}
                onEdit={() => setIsPartnersEditorOpen(true)}
              />
              <Founders
                founders={founders}
                executiveOfficers={executiveOfficers}
                isLoading={isLoading}
                onEdit={() => setIsFoundersEditorOpen(true)}
              />
            </>
          )}
        </Suspense>
      </main>

      {!isDonatePageOpen && !showDashboard && !isLandingEditorOpen && !isChapterEditorOpen && !isPillarEditorOpen && !isPartnersEditorOpen && !isFoundersEditorOpen && (
        <Footer onDonateClick={handleDonateClick} onNavigate={handleFooterNavigation} onLegalNavigate={handleLegalNavigation} />
      )}

      <ChatbotWidget
        chapters={chapters}
        pillars={pillars}
        founders={founders.map((founder: any) => ({
          name: String(founder?.name || ''),
          role: String(founder?.role || ''),
          bio: String(founder?.bio || ''),
          imageUrl: String(founder?.imageUrl || founder?.image || '')
        }))}
        executiveOfficers={executiveOfficers.map((officer: any) => ({
          name: String(officer?.name || ''),
          role: String(officer?.role || ''),
          imageUrl: String(officer?.imageUrl || officer?.image || '')
        }))}
        activeContext={
          selectedPillar
            ? {
                type: 'pillar',
                id: String(selectedPillar.id || ''),
                title: String(selectedPillar.title || ''),
                excerpt: String(selectedPillar.excerpt || ''),
                description: String(selectedPillar.description || '')
              }
            : selectedChapter
              ? {
                  type: 'chapter',
                  id: String(selectedChapter.id || ''),
                  title: String(selectedChapter.name || ''),
                  description: String(selectedChapter.description || ''),
                  location: String(selectedChapter.location || '')
                }
              : isDonatePageOpen
                ? { type: 'donate', title: 'Donate' }
                : { type: 'home', title: 'Home' }
        }
        hidden={
          !(currentView === 'home' || currentView === 'chapter' || currentView === 'pillar') ||
          isLandingEditorOpen ||
          isChapterEditorOpen ||
          isPillarEditorOpen ||
          isPartnersEditorOpen ||
          isFoundersEditorOpen ||
          isLoginModalOpen
        }
      />

      <Suspense fallback={null}>
        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => navigateTo(HOME_PATH, { replace: true })}
          onLoginSuccess={handleLoginSuccess}
        />
      </Suspense>
    </div>
  );
}

export default AppContent;
