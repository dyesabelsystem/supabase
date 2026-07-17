import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Facebook, Twitter, Instagram, Globe, ExternalLink, Edit, Loader, X, Linkedin, Youtube } from 'lucide-react';
import { Chapter, ChapterActivity } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { DataService } from '../services/DriveService';
import { convertToCORSFreeLink, getImageDebugInfo } from '../services/DriveService';

// Add a simple pop-in animation for the modal
const modalStyles = `
@keyframes popIn {
  0% { opacity: 0; transform: scale(0.9); }
  100% { opacity: 1; transform: scale(1); }
}
.animate-pop-in {
  animation: popIn 0.3s ease-out forwards;
}
`;

interface ChapterDetailProps {
  chapter: Chapter;
  onBack: () => void;
  onEdit?: () => void;
}

function formatActivityDateInManila_(rawDate: string) {
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

function truncateDescription_(value: string, maxLength: number) {
  var text = String(value || '').trim();
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}

function getSocialLinkMeta_(url: string) {
  var normalized = normalizeExternalUrl_(url);
  if (!normalized) return { label: 'Learn More', icon: <Globe size={18} /> };
  var host = '';
  try {
    host = new URL(normalized).hostname.replace(/^www\./, '').toLowerCase();
  } catch (error) {
    return { label: 'Learn More', icon: <Globe size={18} /> };
  }

  if (host.indexOf('facebook.com') >= 0 || host.indexOf('fb.com') >= 0) {
    return { label: 'Open on Facebook', icon: <Facebook size={18} /> };
  }
  if (host.indexOf('instagram.com') >= 0) {
    return { label: 'Open on Instagram', icon: <Instagram size={18} /> };
  }
  if (host.indexOf('twitter.com') >= 0 || host.indexOf('x.com') >= 0) {
    return { label: 'Open on X', icon: <Twitter size={18} /> };
  }
  if (host.indexOf('linkedin.com') >= 0) {
    return { label: 'Open on LinkedIn', icon: <Linkedin size={18} /> };
  }
  if (host.indexOf('youtube.com') >= 0 || host.indexOf('youtu.be') >= 0) {
    return { label: 'Open on YouTube', icon: <Youtube size={18} /> };
  }
  return { label: 'Visit Website', icon: <Globe size={18} /> };
}

export const ChapterDetail: React.FC<ChapterDetailProps> = ({ chapter: initialChapter, onBack, onEdit }) => {
  const { user } = useAuth();
  const canEditChapter = !!user && (
    user.role === 'admin' ||
    (user.role === 'editor' && (!user.chapterId || user.chapterId === initialChapter.id)) ||
    (user.role === 'chapter_head' && user.chapterId === initialChapter.id)
  );
  const [chapter, setChapter] = useState<Chapter>(initialChapter);
  const [loading, setLoading] = useState(false);
  const chapterLogo = chapter.logo || chapter.logoUrl || '';
  const chapterLogoDebug = getImageDebugInfo(chapterLogo);
  
  // State for the selected activity (Modal)
  const [selectedActivity, setSelectedActivity] = useState<ChapterActivity | null>(null);
  const [zoomedActivityImageUrl, setZoomedActivityImageUrl] = useState<string | null>(null);
  const selectedActivityLearnMoreUrl = useMemo(
    () => normalizeExternalUrl_(selectedActivity?.learnMoreUrl),
    [selectedActivity?.learnMoreUrl]
  );
  const selectedActivityLinkMeta = useMemo(
    () => getSocialLinkMeta_(selectedActivity?.learnMoreUrl || ''),
    [selectedActivity?.learnMoreUrl]
  );

  const closeActivityModal_ = () => {
    setSelectedActivity(null);
    setZoomedActivityImageUrl(null);
  };

  // Fetch latest chapter data from Backend
  useEffect(() => {
    const fetchChapterData = async () => {
      if (!initialChapter.id) return;
      
      setLoading(true);
      try {
        const result = await DataService.loadChapter(initialChapter.id);
        if (result.success && result.chapter) {
          const backendLogo = result.chapter.logo || result.chapter.logoUrl || '';
          const initialLogo = initialChapter.logo || initialChapter.logoUrl || '';
          // Safeguard: Keep initial logo if backend returns empty
          const safeLogo = backendLogo !== '' ? backendLogo : initialLogo;

          console.log('[ChapterDetail] Loaded chapter diagnostics', {
            chapterId: initialChapter.id,
            chapterName: result.chapter.name || initialChapter.name,
            backendLogo: getImageDebugInfo(backendLogo),
            backendImage: getImageDebugInfo(result.chapter.image || result.chapter.imageUrl),
            initialLogo: getImageDebugInfo(initialLogo),
            mergedLogo: getImageDebugInfo(safeLogo),
            backendFields: Object.keys(result.chapter || {})
          });

          if (!String(safeLogo || '').trim()) {
            console.warn('[ChapterDetail] Chapter logo is empty after merge', {
              chapterId: initialChapter.id,
              chapterName: result.chapter.name || initialChapter.name,
              backendLogo,
              initialLogo
            });
          }

          setChapter({ ...initialChapter, ...result.chapter, logo: safeLogo });
        }
      } catch (error) {
        console.error('Failed to load chapter data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChapterData();
  }, [initialChapter.id]);

  useEffect(() => {
    const logoRaw = String(chapterLogo || '').trim();
    const chapterId = String(chapter.id || '');
    const equalsChapterId = logoRaw !== '' && logoRaw === chapterId;
    if (!logoRaw || equalsChapterId || (!chapterLogoDebug.isHttpUrl && !chapterLogoDebug.isDataUrl)) {
      console.warn('[ChapterDetail] Suspicious chapter logo value before render', {
        chapterId,
        chapterName: chapter.name,
        equalsChapterId,
        ...chapterLogoDebug
      });
    }
  }, [chapter.id, chapter.name, chapterLogo, chapterLogoDebug.hasUrl, chapterLogoDebug.isHttpUrl, chapterLogoDebug.isDataUrl, chapterLogoDebug.normalizedUrl]);

  // Disable body scroll when activity overlays are open
  useEffect(() => {
    if (selectedActivity || zoomedActivityImageUrl) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedActivity, zoomedActivityImageUrl]);

  return (
    <div className="min-h-screen pt-20 pb-10 relative">
      <style>{modalStyles}</style>

      {loading && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-white/80 dark:bg-black/50 px-4 py-2 rounded-full backdrop-blur-md flex items-center gap-2">
          <Loader className="animate-spin w-4 h-4 text-primary-blue" />
          <span className="text-sm font-medium">Loading latest content...</span>
        </div>
      )}

      {/* Floating Back Button */}
      <button 
        onClick={onBack}
        className="fixed top-24 left-4 md:left-8 z-40 flex items-center gap-2 bg-ocean-deep/90 text-white backdrop-blur-md hover:bg-ocean-deep transition-all duration-300 font-medium px-5 py-2.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)] border border-white/10 group"
      >
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
        <span>Back</span>
      </button>

      {/* Edit Button */}
      {onEdit && canEditChapter && (
        <button 
          onClick={onEdit}
          className="fixed top-24 right-4 md:right-8 z-40 flex items-center gap-2 bg-primary-blue/90 text-white backdrop-blur-md hover:bg-primary-cyan transition-all duration-300 font-medium px-5 py-2.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)] border border-white/10 group"
        >
          <Edit size={18} className="group-hover:scale-110 transition-transform" />
          <span>Edit Chapter</span>
        </button>
      )}

      {/* Hero Section */}
      <section className="relative h-[50vh] min-h-[400px] flex items-end pb-12 overflow-hidden mb-12">
        <div className="absolute inset-0 z-0">
          <img 
            src={convertToCORSFreeLink(chapter.image || chapter.imageUrl) || '/icons/social-preview-image.png'}
            alt={`${chapter.name} chapter cover photo`} 
            fetchPriority="high"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(event) => {
              console.error('[ChapterDetail] Hero image failed to load', {
                chapterId: chapter.id,
                chapterName: chapter.name,
                  image: getImageDebugInfo(chapter.image || chapter.imageUrl),
                attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src
              });
              event.currentTarget.src = '/icons/social-preview-image.png';
            }}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ocean-deep via-ocean-deep/60 to-transparent"></div>
        </div>

        <div className="container mx-auto px-4 relative z-10 flex flex-col md:flex-row items-center md:items-end gap-6 md:gap-8 reveal active">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-white/20 bg-white/10 backdrop-blur-md shadow-2xl p-2 flex-shrink-0 overflow-hidden">
            <img 
              src={convertToCORSFreeLink(chapterLogo) || `https://ui-avatars.com/api/?name=${chapter.name}`} 
              alt={`${chapter.name} chapter logo`} 
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(event) => {
                console.error('[ChapterDetail] Logo image failed to load', {
                  chapterId: chapter.id,
                  chapterName: chapter.name,
                  image: chapterLogoDebug,
                  attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src
                });
                event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(chapter.name)}`;
              }}
              className="w-full h-full object-cover rounded-full"
            />
          </div>
          <div className="text-center md:text-left text-white mb-2">
            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-2">{chapter.name}</h1>
            <div className="flex items-center justify-center md:justify-start gap-2 text-white/80 font-medium text-lg">
              <MapPin size={20} className="text-primary-cyan" />
              {chapter.location || 'Location Not Set'}
            </div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-12">
            
            {/* About */}
            <div className="glass-card p-8 rounded-3xl reveal reveal-delay-100">
              <h2 className="text-2xl font-bold text-ocean-deep dark:text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-1 bg-primary-cyan rounded-full"></span>
                About the Chapter
              </h2>
              {/* ✅ ADDED text-justify */}
              <p className="text-lg text-ocean-deep/80 dark:text-gray-300 leading-relaxed whitespace-pre-wrap text-justify">
                {chapter.description || "This chapter is dedicated to environmental sustainability in its local community."}
              </p>
            </div>

            {/* Recent Activities */}
            <div className="reveal reveal-delay-200">
              <h2 className="text-2xl font-bold text-ocean-deep dark:text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-1 bg-primary-blue rounded-full"></span>
                Recent Activities
              </h2>
              
              <div className="bg-white/5 border border-white/10 rounded-2xl p-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                {chapter.activities && chapter.activities.length > 0 ? (
                  <div className="grid gap-6 p-2">
                    {chapter.activities.map((activity, i) => (
                      <button
                        key={activity.id || i}
                        type="button"
                        onClick={() => setSelectedActivity(activity)}
                        className="glass-card rounded-2xl overflow-hidden flex flex-col md:flex-row group hover:bg-white/5 transition-colors border border-white/10 shrink-0 w-full text-left"
                      >
                        <div className="w-full md:w-1/3 h-48 md:h-auto relative overflow-hidden bg-gray-200 dark:bg-white/5">
                          {activity.imageUrl ? (
                            <img
                              src={convertToCORSFreeLink(activity.imageUrl)}
                              alt={`${activity.title || 'Chapter activity'} in ${chapter.name}`}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              onError={(event) => {
                                console.error('[ChapterDetail] Activity image failed to load', {
                                  chapterId: chapter.id,
                                  chapterName: chapter.name,
                                  activityId: activity.id,
                                  activityTitle: activity.title,
                                  attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src
                                });
                              }}
                              className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Image</div>
                          )}

                          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm text-white text-xs font-bold py-1 px-3 rounded-full flex items-center gap-1.5">
                            <Calendar size={12} className="text-primary-cyan" />
                            {formatActivityDateInManila_(activity.date || '')}
                          </div>
                        </div>
                        <div className="p-6 md:p-8 flex flex-col justify-center flex-1">
                          <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-3 group-hover:text-primary-blue dark:group-hover:text-primary-cyan transition-colors">
                            {activity.title || 'Untitled Activity'}
                          </h3>
                          <p className="text-ocean-deep/70 dark:text-gray-400 mb-4 leading-relaxed line-clamp-3 whitespace-pre-line text-justify">
                            {truncateDescription_(activity.description || 'No description provided.', 240)}
                          </p>
                          <div className="flex items-center gap-2 text-sm font-bold text-primary-cyan mt-auto">
                            <span>Completed</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-8 text-gray-500">No recent activities posted yet.</div>
                )}
              </div>
            </div>

          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-8">
            
            {/* Contact Info */}
            <div className="glass-card p-8 rounded-3xl reveal reveal-delay-300 border-t-4 border-primary-cyan">
              <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-6">Get in Touch</h3>
              <ul className="space-y-4">
                {chapter.email && (
                  <li className="flex items-center gap-3 text-ocean-deep/80 dark:text-gray-300">
                    <div className="w-10 h-10 rounded-full bg-primary-blue/10 flex items-center justify-center text-primary-blue dark:text-primary-cyan flex-shrink-0">
                      <Mail size={18} />
                    </div>
                    <a href={`mailto:${chapter.email}`} className="truncate hover:text-primary-cyan transition-colors">{chapter.email}</a>
                  </li>
                )}
                {chapter.phone && (
                  <li className="flex items-center gap-3 text-ocean-deep/80 dark:text-gray-300">
                    <div className="w-10 h-10 rounded-full bg-primary-blue/10 flex items-center justify-center text-primary-blue dark:text-primary-cyan flex-shrink-0">
                      <Phone size={18} />
                    </div>
                    <span>{chapter.phone}</span>
                  </li>
                )}
                {chapter.location && (
                  <li className="flex items-center gap-3 text-ocean-deep/80 dark:text-gray-300">
                    <div className="w-10 h-10 rounded-full bg-primary-blue/10 flex items-center justify-center text-primary-blue dark:text-primary-cyan flex-shrink-0">
                      <MapPin size={18} />
                    </div>
                    <span>{chapter.location}</span>
                  </li>
                )}
                {chapter.websiteUrl && (
                  <li className="flex items-center gap-3 text-ocean-deep/80 dark:text-gray-300">
                    <div className="w-10 h-10 rounded-full bg-primary-blue/10 flex items-center justify-center text-primary-blue dark:text-primary-cyan flex-shrink-0">
                      <Globe size={18} />
                    </div>
                    <a href={chapter.websiteUrl} target="_blank" rel="noopener noreferrer" className="truncate hover:text-primary-cyan transition-colors">
                      Access Our Website
                    </a>
                  </li>
                )}
              </ul>
              
              {/* Social Links */}
              {(chapter.facebook || chapter.twitter || chapter.instagram) && (
                <div className="mt-8 pt-6 border-t border-ocean-deep/10 dark:border-white/10 flex justify-center gap-4">
                  {chapter.facebook && (
                      <a href={chapter.facebook} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full hover:bg-primary-blue hover:text-white transition-all text-ocean-deep/60 dark:text-gray-400">
                          <Facebook size={20} />
                      </a>
                  )}
                  {chapter.twitter && (
                    <a href={chapter.twitter} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full hover:bg-sky-500 hover:text-white transition-all text-ocean-deep/60 dark:text-gray-400">
                      <Twitter size={20} />
                    </a>
                  )}
                  {chapter.instagram && (
                    <a href={chapter.instagram} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full hover:bg-pink-600 hover:text-white transition-all text-ocean-deep/60 dark:text-gray-400">
                      <Instagram size={20} />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Chapter Leadership */}
            {(chapter.headName || chapter.headQuote) && (
              <div className="glass-card p-8 rounded-3xl reveal reveal-delay-400">
                <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-6">Chapter Leadership</h3>
                <div className="flex items-center gap-4 mb-4">
                  <img
                    src={convertToCORSFreeLink(chapter.headImageUrl) || `https://ui-avatars.com/api/?name=${chapter.headName || 'Head'}`}
                    alt={`Portrait of ${chapter.headName || 'chapter head'} of ${chapter.name}`}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      console.error('[ChapterDetail] Head image failed to load', {
                        chapterId: chapter.id,
                        chapterName: chapter.name,
                        attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src
                      });
                      event.currentTarget.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(chapter.headName || 'Head')}`;
                    }}
                    className="w-14 h-14 rounded-full object-cover"
                  />
                  <div>
                    <h4 className="font-bold text-ocean-deep dark:text-white">{chapter.headName || 'Leader'}</h4>
                    <p className="text-xs text-primary-blue dark:text-primary-cyan uppercase font-bold tracking-wider">{chapter.headRole || 'Chapter Head'}</p>
                  </div>
                </div>
                {chapter.headQuote && (
                  <p className="text-sm text-ocean-deep/60 dark:text-gray-400 italic whitespace-pre-wrap text-justify">
                    "{chapter.headQuote}"
                  </p>
                )}
              </div>
            )}

            {/* Join CTA */}
            {chapter.joinUrl && (
              <div className="bg-gradient-to-br from-primary-blue to-primary-cyan rounded-3xl p-8 text-center text-white shadow-xl reveal reveal-delay-500 relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl transform translate-x-1/2 -translate-y-1/2"></div>
                 <h3 className="text-2xl font-black mb-2 relative z-10">Join {chapter.name}</h3>
                 <p className="mb-6 opacity-90 text-sm relative z-10 whitespace-pre-wrap text-justify">
                   {chapter.joinCtaDescription || `Become a volunteer and make a direct impact in ${chapter.location}.`}
                 </p>
                 <a 
                   href={chapter.joinUrl} 
                   target="_blank" 
                   rel="noopener noreferrer"
                   className="block w-full py-3 bg-white text-primary-blue font-bold rounded-xl hover:shadow-lg transform hover:-translate-y-1 transition-all relative z-10"
                 >
                   Sign Up Now
                 </a>
              </div>
            )}

            {chapter.websiteUrl && (
              <div className="glass-card p-6 rounded-3xl reveal reveal-delay-500 border border-white/10">
                <div className="flex items-center gap-3 mb-3 text-ocean-deep dark:text-white">
                  <div className="w-10 h-10 rounded-full bg-primary-blue/10 flex items-center justify-center text-primary-blue dark:text-primary-cyan">
                    <Globe size={18} />
                  </div>
                  <h3 className="text-xl font-bold">Chapter Website</h3>
                </div>
                <a
                  href={chapter.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-blue text-white font-bold px-5 py-3 hover:bg-primary-cyan transition-colors"
                >
                  <span>Access Our Website</span>
                  <ExternalLink size={16} />
                </a>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Activity Detail Modal */}
      {selectedActivity && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 md:p-6">
          <button
            type="button"
            aria-label="Close activity details"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={closeActivityModal_}
          />

          <div className="relative z-10 w-full max-w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[95vh] sm:max-h-[92vh] overflow-y-auto rounded-2xl sm:rounded-3xl border border-white/20 bg-[#07111e] shadow-2xl animate-pop-in">
            <button
              type="button"
              aria-label="Close activity details"
              onClick={closeActivityModal_}
              className="fixed right-4 sm:right-6 top-4 sm:top-6 z-[65] rounded-lg bg-black/45 p-2 text-white transition-colors hover:bg-white/25 hover:text-white"
            >
              <X size={16} className="sm:w-5 sm:h-5" />
            </button>

            <div className="relative h-48 sm:h-64 md:h-80 w-full overflow-hidden bg-gray-200 dark:bg-white/5">
              {selectedActivity.imageUrl ? (
                <button
                  type="button"
                  onClick={() => setZoomedActivityImageUrl(convertToCORSFreeLink(selectedActivity.imageUrl))}
                  className="absolute inset-0 z-0 h-full w-full cursor-zoom-in"
                  aria-label="View full activity image"
                >
                  <img
                    src={convertToCORSFreeLink(selectedActivity.imageUrl)}
                    alt={`${selectedActivity.title || 'Chapter activity'} image`}
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      console.error('[ChapterDetail] Modal activity image failed to load', {
                        chapterId: chapter.id,
                        chapterName: chapter.name,
                        activityId: selectedActivity.id,
                        activityTitle: selectedActivity.title,
                        attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src
                      });
                    }}
                    className="h-full w-full object-cover"
                  />
                </button>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <span className="block text-3xl sm:text-4xl mb-2">No Image</span>
                  </div>
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07111e] via-[#07111e]/40 to-transparent" />
              <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
                <h3 className="max-w-full text-base sm:text-lg md:text-2xl lg:text-[1.7rem] font-bold leading-tight text-white">
                  {selectedActivity.title}
                </h3>
                <div className="inline-flex items-center gap-2 rounded-full bg-black/50 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold text-white whitespace-nowrap">
                  <Calendar size={12} className="sm:w-[13px] sm:h-[13px] text-primary-cyan" />
                  {formatActivityDateInManila_(selectedActivity.date || '')}
                </div>
              </div>
              {selectedActivity.imageUrl && (
                <div className="pointer-events-none absolute left-3 sm:left-4 top-3 sm:top-4 z-10 rounded-full bg-black/45 px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide text-white/90">
                  Tap image to view full size
                </div>
              )}
            </div>

            <div className="space-y-4 sm:space-y-6 p-4 sm:p-6 md:p-8">
              <div>
                <h4 className="mb-2 text-xs sm:text-sm font-bold uppercase tracking-wider text-primary-cyan">Activity Details</h4>
                <p className="text-sm sm:text-base md:text-lg leading-relaxed text-white/85 whitespace-pre-wrap text-justify">{selectedActivity.description || 'No description available.'}</p>
              </div>

              {selectedActivityLearnMoreUrl && (
                <div className="space-y-2">
                  <a
                    href={selectedActivityLearnMoreUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg sm:rounded-xl bg-primary-cyan px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-[#04131a] transition-colors hover:bg-[#7cf0ff]"
                  >
                    {selectedActivityLinkMeta.icon}
                    <span>{selectedActivityLinkMeta.label}</span>
                    <ExternalLink size={14} className="sm:w-4 sm:h-4" />
                  </a>
                  <p className="text-[11px] sm:text-xs text-white/60 break-all whitespace-pre-wrap text-justify">{selectedActivityLearnMoreUrl}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {zoomedActivityImageUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4">
          <button
            type="button"
            aria-label="Close full image"
            className="absolute inset-0"
            onClick={() => setZoomedActivityImageUrl(null)}
          />
          <button
            type="button"
            aria-label="Close full image"
            onClick={() => setZoomedActivityImageUrl(null)}
            className="fixed right-4 sm:right-6 top-4 sm:top-6 z-[75] rounded-lg bg-white/15 p-2 text-white transition-colors hover:bg-white/25"
          >
            <X size={18} />
          </button>
          <img
            src={zoomedActivityImageUrl}
            alt="Full activity image"
            className="relative z-10 max-h-[92vh] max-w-[96vw] rounded-xl object-contain"
          />
        </div>
      )}

    </div>
  );
};
