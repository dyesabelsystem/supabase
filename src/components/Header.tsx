import React, { useEffect, useState } from 'react';
import { Menu, X, Sun, Moon, LogIn, LogOut, LayoutDashboard, Home } from 'lucide-react';
import { NavLink } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAppDialog } from '../contexts/AppDialogContext';
import { APP_CONFIG } from '../config';

const navLinks: NavLink[] = [
  { label: 'Our Pillars', href: '#pillars' },
  { label: 'Chapters', href: '#chapters' },
  { label: 'Partners', href: '#partners' },
  { label: 'Volunteer', href: APP_CONFIG.volunteerUrl },
  { label: 'About Us', href: '#about' },
];

interface HeaderProps {
  theme: string;
  toggleTheme: () => void;
  onHomeClick?: () => void;
  onSignInClick: () => void;
  onOpenDashboard?: () => void;
  isDashboardOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  theme,
  toggleTheme,
  onHomeClick,
  onSignInClick,
  onOpenDashboard,
  isDashboardOpen = false
}) => {
  const { user, logout } = useAuth();
  const { showConfirm } = useAppDialog();
  const isAdmin = user?.role === 'admin';
  const canAccessDashboard = !!user && (
    isAdmin
    || (user.role === 'editor' && !user.chapterId)
    || (user.role === 'pillar_editor' && !!user.pillarId)
    || !!user.chapterId
  );
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLogoClick = (e: React.MouseEvent) => {
    if (onHomeClick) {
      e.preventDefault();
      onHomeClick();
      window.scrollTo(0, 0);
    }
  };

  const handleLogout = async () => {
    const shouldLogout = await showConfirm('Your current session will be ended on this device.', {
      title: 'Log out now?',
      confirmLabel: 'Log out',
      cancelLabel: 'Cancel'
    });

    if (!shouldLogout) {
      return;
    }

    logout();
    setIsMobileMenuOpen(false);
    onHomeClick?.();
  };

  const handleNavigation = (e: React.MouseEvent<HTMLAnchorElement>, link: NavLink) => {
    if (link.href.startsWith('http')) {
      setIsMobileMenuOpen(false);
      return;
    }

    e.preventDefault();
    setIsMobileMenuOpen(false);
    onHomeClick?.();

    setTimeout(() => {
      const element = document.querySelector(link.href);
      if (!element) return;

      const headerOffset = 90;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }, 100);
  };

  const handleDashboardToggle = () => {
    setIsMobileMenuOpen(false);
    if (isDashboardOpen) {
      onHomeClick?.();
    } else {
      onOpenDashboard?.();
    }
  };

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 border-b transition-all duration-500 ${
        isScrolled
          ? 'border-ocean-deep/5 bg-white/90 py-2 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-ocean-deep/90'
          : 'border-transparent bg-transparent py-4'
      }`}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          <div className="group flex flex-shrink-0 cursor-pointer items-center space-x-3" onClick={handleLogoClick}>
            <div className="relative">
              <div className="absolute inset-0 z-0 rounded-full bg-primary-cyan/50 blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <img
                src={APP_CONFIG.logoUrl}
                alt="Dyesabel Philippines Logo"
                fetchPriority="high"
                decoding="async"
                className="relative z-10 h-10 w-10 rounded-full object-contain drop-shadow-md transition-transform duration-300 md:h-12 md:w-12 lg:h-14 lg:w-14"
              />
            </div>

            <div className="flex flex-col">
              <span className={`font-lobster text-lg leading-none tracking-wide transition-colors duration-300 lg:text-2xl ${isScrolled ? 'text-ocean-deep dark:text-white' : 'text-ocean-deep drop-shadow-md dark:text-white'}`}>
                Dyesabel
              </span>
              <span className={`mt-0.5 font-sans text-[10px] font-bold uppercase leading-none tracking-[0.2em] lg:text-xs ${isScrolled ? 'text-gray-600 dark:text-gray-300' : 'text-gray-700 dark:text-gray-200'}`}>
                Philippines, Inc.
              </span>
            </div>
          </div>

          <nav className="hidden items-center md:flex">
            {!user ? (
              <>
                <div className="flex items-center">
                  {navLinks.map((link, index) => (
                    <React.Fragment key={link.label}>
                      <a
                        href={link.href}
                        target={link.href.startsWith('http') ? '_blank' : undefined}
                        rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                        onClick={(e) => handleNavigation(e, link)}
                        className={`whitespace-nowrap text-[10px] font-bold uppercase tracking-wider transition-colors duration-200 lg:text-xs xl:text-sm ${
                          isScrolled
                            ? 'text-ocean-deep hover:text-primary-blue dark:text-gray-200 dark:hover:text-primary-cyan'
                            : 'text-ocean-deep hover:text-primary-blue dark:text-white dark:hover:text-primary-cyan'
                        }`}
                      >
                        {link.label}
                      </a>
                      {index < navLinks.length - 1 ? (
                        <span className={`mx-2 select-none text-[10px] lg:mx-3 lg:text-xs xl:mx-4 ${isScrolled ? 'text-gray-300 dark:text-gray-600' : 'text-ocean-deep/40 dark:text-white/40'}`}>|</span>
                      ) : null}
                    </React.Fragment>
                  ))}
                </div>
                <div className={`mx-3 h-4 w-px lg:mx-5 lg:h-5 ${isScrolled ? 'bg-gray-300 dark:bg-gray-700' : 'bg-ocean-deep/20 dark:bg-white/20'}`} />
              </>
            ) : null}

            {canAccessDashboard ? (
              <button
                onClick={handleDashboardToggle}
                className="mr-2 flex items-center gap-2 whitespace-nowrap rounded-full border border-white/20 bg-primary-cyan px-4 py-1.5 text-[10px] font-bold tracking-wide text-ocean-deep shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-cyan-500/50 lg:px-6 lg:py-2 lg:text-sm"
              >
                {isDashboardOpen ? 'Homepage' : 'Dashboard'}
                {isDashboardOpen ? <Home size={14} className="lg:h-4 lg:w-4" /> : <LayoutDashboard size={14} className="lg:h-4 lg:w-4" />}
              </button>
            ) : null}

            {user ? (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/20 bg-red-500 px-4 py-1.5 text-[10px] font-bold tracking-wide text-white shadow-lg transition-all duration-200 hover:scale-105 hover:bg-red-600 hover:shadow-red-500/50 lg:px-6 lg:py-2 lg:text-sm"
              >
                Log Out
                <LogOut size={14} className="lg:h-4 lg:w-4" />
              </button>
            ) : (
              <button
                onClick={onSignInClick}
                className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/20 bg-gradient-to-r from-primary-blue to-primary-cyan px-4 py-1.5 text-[10px] font-bold tracking-wide text-white shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-primary-cyan/50 lg:px-6 lg:py-2 lg:text-sm"
              >
                Sign In
                <LogIn size={14} className="lg:h-4 lg:w-4" />
              </button>
            )}

            <button
              onClick={toggleTheme}
              className={`ml-2 flex-shrink-0 rounded-full p-1.5 transition-all hover:scale-110 lg:p-2 ${
                isScrolled ? 'bg-gray-200/50 text-ocean-deep dark:bg-white/10 dark:text-yellow-300' : 'bg-white/20 text-ocean-deep backdrop-blur-md dark:text-white'
              }`}
              aria-label="Toggle Dark Mode"
            >
              {theme === 'dark' ? <Sun size={16} className="lg:h-5 lg:w-5" /> : <Moon size={16} className="lg:h-5 lg:w-5" />}
            </button>
          </nav>

          <div className="flex items-center gap-4 md:hidden">
            <button
              onClick={toggleTheme}
              className={`rounded-full p-2 transition-colors ${isScrolled ? 'bg-gray-100 text-ocean-deep dark:bg-white/10 dark:text-yellow-400' : 'bg-white/20 text-ocean-deep backdrop-blur-md dark:text-white'}`}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              className={`${isScrolled ? 'text-ocean-deep dark:text-white' : 'text-ocean-deep dark:text-white'} transition-colors hover:opacity-80 focus:outline-none`}
              onClick={() => setIsMobileMenuOpen((value) => !value)}
            >
              {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      <div
        className={`absolute left-4 right-4 top-full mt-2 origin-top overflow-hidden rounded-2xl border border-ocean-deep/10 bg-white shadow-2xl transition-all duration-300 ease-in-out dark:border-white/10 dark:bg-ocean-deep md:hidden ${
          isMobileMenuOpen ? 'max-h-[32rem] scale-100 opacity-100' : 'max-h-0 scale-95 opacity-0'
        }`}
      >
        <div className="flex flex-col space-y-2 px-4 py-4">
          {!user ? navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.href.startsWith('http') ? '_blank' : undefined}
              rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="block rounded-xl py-3 text-center text-lg font-semibold text-ocean-deep transition-colors hover:bg-gray-100 hover:text-primary-blue dark:text-gray-200 dark:hover:bg-white/5 dark:hover:text-primary-cyan"
              onClick={(e) => handleNavigation(e, link)}
            >
              {link.label}
            </a>
          )) : null}

          {canAccessDashboard ? (
            <button
              onClick={handleDashboardToggle}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-cyan py-3 font-bold text-ocean-deep shadow-lg"
            >
              {isDashboardOpen ? 'Homepage' : 'Dashboard'}
              {isDashboardOpen ? <Home size={18} /> : <LayoutDashboard size={18} />}
            </button>
          ) : null}

          {user ? (
            <button
              onClick={handleLogout}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 py-3 font-bold text-white shadow-lg hover:bg-red-600"
            >
              Log Out
              <LogOut size={18} />
            </button>
          ) : (
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onSignInClick();
              }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary-blue to-primary-cyan py-3 font-bold text-white shadow-lg"
            >
              Sign In
              <LogIn size={18} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
