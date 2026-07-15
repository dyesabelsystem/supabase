import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Target,
  Calendar,
  CheckCircle2,
  Edit,
  X,
  ExternalLink,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  Globe
} from 'lucide-react';
// ✅ FIXED IMPORTS: Changed '../../' to '../'
import { Pillar, PillarActivity } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { convertToCORSFreeLink, getImageDebugInfo } from '../services/DriveService';

interface PillarDetailProps {
  pillar: Pillar;
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

function getDefaultImpactAreas_() {
  return ['Sustainability', 'Youth', 'Community', 'Future'];
}

function getPillarSocialItems_(pillar: Pillar) {
  var links = pillar.socialLinks || {};
  var candidates: Array<{ key: string; label: string; value?: string; icon: React.ReactElement }> = [
    { key: 'facebook', label: 'Facebook', value: links.facebook, icon: <Facebook size={16} /> },
    { key: 'instagram', label: 'Instagram', value: links.instagram, icon: <Instagram size={16} /> },
    { key: 'twitter', label: 'X', value: links.twitter, icon: <Twitter size={16} /> },
    { key: 'linkedin', label: 'LinkedIn', value: links.linkedin, icon: <Linkedin size={16} /> },
    { key: 'youtube', label: 'YouTube', value: links.youtube, icon: <Youtube size={16} /> },
    { key: 'website', label: 'Website', value: links.website, icon: <Globe size={16} /> }
  ];

  return candidates
    .map(function(entry) {
      return {
        key: entry.key,
        label: entry.label,
        url: normalizeExternalUrl_(entry.value),
        icon: entry.icon
      };
    })
    .filter(function(entry) { return !!entry.url; });
}

export const PillarDetail: React.FC<PillarDetailProps> = ({ pillar, onBack, onEdit }) => {
  const { user } = useAuth();
  const [selectedActivity, setSelectedActivity] = useState<PillarActivity | null>(null);
  const [zoomedActivityImageUrl, setZoomedActivityImageUrl] = useState<string | null>(null);
  const pillarImpactAreas = useMemo(
    () => Array.isArray(pillar.impactAreas) && pillar.impactAreas.length > 0 ? pillar.impactAreas : getDefaultImpactAreas_(),
    [pillar.impactAreas]
  );
  const pillarSocialItems = useMemo(() => getPillarSocialItems_(pillar), [pillar]);
  const pillarJoinNowUrl = useMemo(() => normalizeExternalUrl_(pillar.joinNow?.url), [pillar.joinNow?.url]);
  const isPillarJoinOpen = !!pillar.joinNow?.isOpen;
  const pillarJoinFallbackText = useMemo(
    () => String(pillar.joinNow?.description || '').trim() || 'Stay tuned for upcoming application opportunities.',
    [pillar.joinNow?.description]
  );
  const selectedActivityLearnMoreUrl = useMemo(
    () => normalizeExternalUrl_(selectedActivity?.learnMoreUrl),
    [selectedActivity?.learnMoreUrl]
  );
  const selectedActivityLinkMeta = useMemo(
    () => getSocialLinkMeta_(selectedActivity?.learnMoreUrl || ''),
    [selectedActivity?.learnMoreUrl]
  );
  const selectedActivityJoinNow = useMemo(() => {
    var activityOpen = !!selectedActivity?.applicationOpen;
    var activityJoinUrl = normalizeExternalUrl_(selectedActivity?.applicationUrl);
    if (activityOpen && activityJoinUrl) {
      return {
        url: activityJoinUrl,
        label: String(selectedActivity?.applicationLabel || '').trim() || 'Join Now',
        note: String(selectedActivity?.applicationNote || '').trim(),
        pending: false
      };
    }

    if (activityOpen && !activityJoinUrl) {
      return {
        url: '',
        label: '',
        note: String(selectedActivity?.applicationNote || '').trim() || 'Stay tuned for application details.',
        pending: true
      };
    }

    if (isPillarJoinOpen && pillarJoinNowUrl) {
      return {
        url: pillarJoinNowUrl,
        label: String(pillar.joinNow?.label || '').trim() || 'Join Now',
        note: String(pillar.joinNow?.description || '').trim(),
        pending: false
      };
    }

    if (isPillarJoinOpen && !pillarJoinNowUrl) {
      return {
        url: '',
        label: '',
        note: String(pillar.joinNow?.description || '').trim() || 'Stay tuned for application details.',
        pending: true
      };
    }

    return null;
  }, [
    isPillarJoinOpen,
    pillar.joinNow?.description,
    pillar.joinNow?.label,
    pillarJoinNowUrl,
    selectedActivity?.applicationLabel,
    selectedActivity?.applicationNote,
    selectedActivity?.applicationOpen,
    selectedActivity?.applicationUrl
  ]);

  return (
    <div className="min-h-screen pt-20 pb-10">
      {/* Back Button */}
      <button 
        onClick={onBack}
        className="fixed top-24 left-4 md:left-8 z-40 flex items-center gap-2 bg-ocean-deep/90 text-white backdrop-blur-md hover:bg-ocean-deep transition-all duration-300 font-medium px-5 py-2.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)] border border-white/10 group"
      >
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
        <span>Back</span>
      </button>

      {/* Edit Button - Admin only */}
      {onEdit && (
        user?.role === 'admin'
        || (user?.role === 'pillar_editor' && String(user.pillarId) === String(pillar.id))
      ) && (
        <button 
          onClick={onEdit}
          className="fixed top-24 right-4 md:right-8 z-40 flex items-center gap-2 bg-primary-blue/90 text-white backdrop-blur-md hover:bg-primary-cyan transition-all duration-300 font-medium px-5 py-2.5 rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)] border border-white/10 group"
        >
          <Edit size={18} className="group-hover:scale-110 transition-transform" />
          <span>Edit Pillar</span>
        </button>
      )}

      {/* Hero Section */}
      <section className="relative h-[60vh] min-h-[500px] flex items-end pb-16 overflow-hidden mb-12">
        <div className="absolute inset-0 z-0">
          <img 
            src={convertToCORSFreeLink(pillar.imageUrl)} 
            alt={`${pillar.title} pillar cover image`} 
            fetchPriority="high"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(event) => {
              const info = getImageDebugInfo(pillar.imageUrl);
              console.error('[PillarDetail] Hero image failed to load', {
                pillarId: pillar.id,
                pillarTitle: pillar.title,
                attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src,
                ...info
              });
            }}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ocean-deep via-ocean-deep/70 to-transparent"></div>
        </div>

        <div className="container mx-auto px-4 relative z-10 reveal active">
          <div className="max-w-4xl">
            <span className="inline-block py-1 px-3 rounded-full bg-primary-cyan/20 border border-primary-cyan/50 text-primary-cyan font-bold text-sm tracking-widest uppercase mb-4 backdrop-blur-md">
              Core Pillar
            </span>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight text-white mb-6 leading-tight">
              {pillar.title}
            </h1>
            <p className="text-xl md:text-2xl text-white/90 font-light max-w-2xl leading-relaxed whitespace-pre-wrap text-justify">
              {pillar.excerpt}
            </p>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-12">
            
            {/* Description */}
            <div className="reveal reveal-delay-100">
              <h2 className="text-3xl font-bold text-ocean-deep dark:text-white mb-6">Overview</h2>
              <div className="prose prose-lg dark:prose-invert text-ocean-deep/80 dark:text-gray-300 leading-relaxed text-justify">
                <p className="whitespace-pre-wrap text-justify">{pillar.description}</p>
              </div>
            </div>

            {/* Implemented Activities */}
            <div className="reveal reveal-delay-200">
              <h2 className="text-3xl font-bold text-ocean-deep dark:text-white mb-8 flex items-center gap-3">
                <span className="w-2 h-8 bg-primary-cyan rounded-full"></span>
                Implemented Activities
              </h2>
              
              <div className="bg-white/5 border border-white/10 rounded-2xl p-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                <div className="grid gap-6 p-2">
                  {pillar.activities.map((activity) => (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => setSelectedActivity(activity)}
                      className="glass-card rounded-2xl overflow-hidden flex flex-col md:flex-row group hover:bg-white/5 transition-colors border border-white/10 shrink-0 w-full text-left"
                    >
                      <div className="w-full md:w-1/3 h-48 md:h-auto relative overflow-hidden">
                         <img 
                            src={convertToCORSFreeLink(activity.imageUrl)} 
                           alt={`${activity.title || 'Pillar activity'} image for ${pillar.title}`}
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            onError={(event) => {
                              const info = getImageDebugInfo(activity.imageUrl);
                              console.error('[PillarDetail] Activity image failed to load', {
                                pillarId: pillar.id,
                                pillarTitle: pillar.title,
                                activityId: activity.id,
                                activityTitle: activity.title,
                                attemptedSrc: event.currentTarget.currentSrc || event.currentTarget.src,
                                ...info
                              });
                            }}
                            className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700"
                          />
                          <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm text-white text-xs font-bold py-1 px-3 rounded-full flex items-center gap-1.5">
                             <Calendar size={12} className="text-primary-cyan" />
                             {formatActivityDateInManila_(activity.date)}
                          </div>
                      </div>
                      <div className="p-6 md:p-8 flex flex-col justify-center flex-1">
                        <h3 className="text-xl font-bold text-ocean-deep dark:text-white mb-3 group-hover:text-primary-blue dark:group-hover:text-primary-cyan transition-colors">
                          {activity.title}
                        </h3>
                        <p className="text-ocean-deep/70 dark:text-gray-400 mb-4 leading-relaxed line-clamp-3 whitespace-pre-line text-justify">
                          {truncateDescription_(activity.description, 240)}
                        </p>
                        <div className="flex items-center gap-2 text-sm font-bold text-primary-cyan mt-auto">
                          <CheckCircle2 size={16} />
                          <span>Completed</span>
                        </div>
                      </div>
                    </button>
                  ))}

                  {pillar.activities.length === 0 && (
                     <div className="p-8 text-center bg-white/5 rounded-2xl border border-dashed border-white/20">
                        <p className="text-gray-500">Upcoming activities to be announced.</p>
                     </div>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-8">
            
            {/* Our Aim Card */}
            <div className="glass-card p-8 rounded-3xl sticky top-24 border-t-4 border-primary-blue shadow-xl reveal reveal-delay-300">
              <div className="w-14 h-14 bg-primary-blue/10 rounded-full flex items-center justify-center text-primary-blue dark:text-primary-cyan mb-6">
                 <Target size={28} />
              </div>
              <h3 className="text-2xl font-bold text-ocean-deep dark:text-white mb-4">Our Aim</h3>
              <p className="text-lg text-ocean-deep/80 dark:text-gray-300 leading-relaxed font-medium italic whitespace-pre-wrap text-justify">
                "{pillar.aim}"
              </p>
              
              <div className="mt-8 pt-6 border-t border-ocean-deep/10 dark:border-white/10">
                 <h4 className="font-bold text-sm uppercase tracking-wider text-ocean-deep/50 dark:text-gray-500 mb-4">Impact Areas</h4>
                 <div className="flex flex-wrap gap-2">
                    {pillarImpactAreas.map(tag => (
                       <span key={tag} className="text-xs font-bold px-3 py-1 rounded-full bg-white/10 text-ocean-deep dark:text-white border border-white/10">
                          #{tag}
                       </span>
                    ))}
                 </div>
              </div>

              {pillarSocialItems.length > 0 && (
                <div className="mt-6 pt-6 border-t border-ocean-deep/10 dark:border-white/10">
                  <h4 className="font-bold text-sm uppercase tracking-wider text-ocean-deep/50 dark:text-gray-500 mb-4">Social Links</h4>
                  <div className="flex flex-wrap gap-2">
                    {pillarSocialItems.map((item) => (
                      <a
                        key={item.key}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-ocean-deep transition-colors hover:bg-primary-cyan/30 dark:text-white"
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 pt-6 border-t border-ocean-deep/10 dark:border-white/10">
                <h4 className="font-bold text-sm uppercase tracking-wider text-ocean-deep/50 dark:text-gray-500 mb-3">Join Now</h4>
                {isPillarJoinOpen && pillarJoinNowUrl ? (
                  <div className="space-y-2">
                    <a
                      href={pillarJoinNowUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-primary-cyan px-4 py-2 text-sm font-bold text-[#04131a] transition-colors hover:bg-[#7cf0ff]"
                    >
                      <span>{String(pillar.joinNow?.label || '').trim() || 'Join Now'}</span>
                      <ExternalLink size={14} />
                    </a>
                    {!!String(pillar.joinNow?.description || '').trim() && (
                      <p className="text-xs text-ocean-deep/70 dark:text-gray-300 whitespace-pre-wrap text-justify">{pillar.joinNow?.description}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-ocean-deep/60 dark:text-gray-400">{pillarJoinFallbackText}</p>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {selectedActivity && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 md:p-6">
          <button
            type="button"
            aria-label="Close activity details"
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => {
                setSelectedActivity(null);
                setZoomedActivityImageUrl(null);
              }}
          />

          <div className="relative z-10 w-full max-w-[95vw] sm:max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[95vh] sm:max-h-[92vh] overflow-y-auto rounded-2xl sm:rounded-3xl border border-white/20 bg-[#07111e] shadow-2xl animate-pop-in">
            <button
              type="button"
              aria-label="Close activity details"
              onClick={() => {
                setSelectedActivity(null);
                setZoomedActivityImageUrl(null);
              }}
              className="fixed right-4 sm:right-6 top-4 sm:top-6 z-[125] rounded-lg bg-black/45 p-2 text-white transition-colors hover:bg-white/25 hover:text-white"
            >
              <X size={16} className="sm:w-5 sm:h-5" />
            </button>

            <div className="relative h-48 sm:h-64 md:h-80 w-full overflow-hidden">
              {selectedActivity.imageUrl ? (
                <button
                  type="button"
                  onClick={() => setZoomedActivityImageUrl(convertToCORSFreeLink(selectedActivity.imageUrl))}
                  className="absolute inset-0 z-0 h-full w-full cursor-zoom-in"
                  aria-label="View full activity image"
                >
                  <img
                    src={convertToCORSFreeLink(selectedActivity.imageUrl)}
                    alt={`${selectedActivity.title || 'Pillar activity'} image`}
                    className="h-full w-full object-cover"
                  />
                </button>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-200 text-gray-500">
                  No Image
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#07111e] via-[#07111e]/40 to-transparent" />
              <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
                <h3 className="max-w-full text-base sm:text-lg md:text-2xl lg:text-[1.7rem] font-bold leading-tight text-white">
                  {selectedActivity.title}
                </h3>
                <div className="inline-flex items-center gap-2 rounded-full bg-black/50 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold text-white whitespace-nowrap">
                  <Calendar size={12} className="sm:w-[13px] sm:h-[13px] text-primary-cyan" />
                  {formatActivityDateInManila_(selectedActivity.date)}
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

              {selectedActivityJoinNow && (
                <div className="space-y-2 rounded-xl border border-primary-cyan/30 bg-primary-cyan/10 p-3 sm:p-4">
                  <h5 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-primary-cyan">Join This Initiative</h5>
                  {!selectedActivityJoinNow.pending && (
                    <a
                      href={selectedActivityJoinNow.url || ''}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg sm:rounded-xl bg-primary-cyan px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold text-[#04131a] transition-colors hover:bg-[#7cf0ff]"
                    >
                      <span>{selectedActivityJoinNow.label}</span>
                      <ExternalLink size={14} className="sm:w-4 sm:h-4" />
                    </a>
                  )}
                  {!!selectedActivityJoinNow.note && (
                    <p className="text-[11px] sm:text-xs text-white/70 whitespace-pre-wrap text-justify">{selectedActivityJoinNow.note}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {zoomedActivityImageUrl && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/90 p-4">
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
            className="fixed right-4 sm:right-6 top-4 sm:top-6 z-[135] rounded-lg bg-white/15 p-2 text-white transition-colors hover:bg-white/25"
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
