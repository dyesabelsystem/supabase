import React, { useState } from 'react';
import { Facebook, Twitter, Instagram, Mail, MapPin, Phone } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { DonationsService } from '../services/DonationsService';
import { PRIVACY_POLICY_PATH, TERMS_OF_SERVICE_PATH } from '../utils/routes';

interface FooterProps {
  onDonateClick?: (e: React.MouseEvent) => void;
  onNavigate: (sectionId: string) => void;
  onLegalNavigate: (path: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onDonateClick, onNavigate, onLegalNavigate }) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus('loading');
    setMessage('');

    try {
      const result = await DonationsService.subscribeNewsletter(email);
      if (!result.success) {
        throw new Error(result.error || 'Subscription failed.');
      }

      setStatus('success');
      setMessage(result.message || 'Subscribed successfully!');
      setEmail('');

      setTimeout(() => {
        setStatus('idle');
        setMessage('');
      }, 3000);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Connection failed.');
    }
  };

  const handleLinkClick = (e: React.MouseEvent, sectionId: string) => {
    e.preventDefault();
    onNavigate(sectionId);
  };

  return (
    <footer data-chatbot-boundary className="relative z-20 border-t border-white/5 bg-ocean-deep/80 pb-10 pt-20 text-white backdrop-blur-xl">
      <div className="container mx-auto px-4">
        <div className="mb-16 grid grid-cols-1 gap-10 md:grid-cols-4">
          <div className="col-span-1 reveal md:col-span-1">
            <div className="group mb-6 flex items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary-cyan blur-md opacity-20 transition-opacity duration-500 group-hover:opacity-60" />
                <img
                  src={APP_CONFIG.logoUrl}
                  alt="Dyesabel Philippines Logo"
                  loading="lazy"
                  decoding="async"
                  className="relative h-14 w-14 rounded-full object-contain ring-2 ring-white/10 transition-transform duration-500 hover:rotate-12"
                />
              </div>
              <span className="bg-gradient-to-r from-white to-primary-cyan bg-clip-text font-sans text-2xl font-black tracking-tighter text-transparent">
                DYESABEL PH
              </span>
            </div>
            <p className="mb-8 text-sm font-medium leading-relaxed text-gray-400">
              Developing the Youth with Environmentally Sustainable Advocacies Building and Empowering Lives.
            </p>
            <div className="flex space-x-5">
              <a href="https://www.facebook.com/dyesabel.ph" target="_blank" rel="noopener noreferrer" className="text-gray-400 transition-colors duration-300 hover:-translate-y-1 hover:scale-110 hover:text-primary-cyan">
                <Facebook size={22} />
              </a>
              <a href="#" className="text-gray-400 transition-colors duration-300 hover:-translate-y-1 hover:scale-110 hover:text-primary-cyan">
                <Twitter size={22} />
              </a>
              <a href="https://www.instagram.com/dyesabel.ph/" target="_blank" rel="noopener noreferrer" className="text-gray-400 transition-colors duration-300 hover:-translate-y-1 hover:scale-110 hover:text-primary-cyan">
                <Instagram size={22} />
              </a>
            </div>
          </div>

          <div className="reveal reveal-delay-100">
            <h4 className="mb-8 font-sans text-lg font-bold tracking-wide text-white">Quick Links</h4>
            <ul className="space-y-4 text-sm font-medium text-gray-400">
              <li><a href="#home" onClick={(e) => handleLinkClick(e, 'home')} className="inline-block transition-colors duration-300 hover:translate-x-2 hover:text-primary-cyan">Home</a></li>
              <li><a href="#pillars" onClick={(e) => handleLinkClick(e, 'pillars')} className="inline-block transition-colors duration-300 hover:translate-x-2 hover:text-primary-cyan">Our Pillars</a></li>
              <li><a href="#about" onClick={(e) => handleLinkClick(e, 'about')} className="inline-block transition-colors duration-300 hover:translate-x-2 hover:text-primary-cyan">About Us</a></li>
              <li><a href={APP_CONFIG.volunteerUrl} target="_blank" rel="noopener noreferrer" className="inline-block transition-colors duration-300 hover:translate-x-2 hover:text-primary-cyan">Volunteer</a></li>
              <li>
                <a
                  href="#donate"
                  onClick={(e) => {
                    if (onDonateClick) {
                      e.preventDefault();
                      onDonateClick(e);
                    }
                  }}
                  className="inline-block transition-colors duration-300 hover:translate-x-2 hover:text-primary-cyan"
                >
                  Donate
                </a>
              </li>
            </ul>
          </div>

          <div className="reveal reveal-delay-200">
            <h4 className="mb-8 font-sans text-lg font-bold tracking-wide text-white">Contact Us</h4>
            <ul className="space-y-5 text-sm font-medium text-gray-400">
              <li className="group flex cursor-pointer items-start gap-4">
                <MapPin size={20} className="mt-0.5 flex-shrink-0 text-primary-blue transition-colors group-hover:text-primary-cyan" />
                <span className="transition-colors group-hover:text-white">{APP_CONFIG.supportLocation}</span>
              </li>
              {APP_CONFIG.supportPhone ? (
                <li className="group flex cursor-pointer items-center gap-4">
                  <Phone size={20} className="flex-shrink-0 text-primary-blue transition-colors group-hover:text-primary-cyan" />
                  <span className="transition-colors group-hover:text-white">{APP_CONFIG.supportPhone}</span>
                </li>
              ) : null}
              <li className="group flex cursor-pointer items-center gap-4">
                <Mail size={20} className="flex-shrink-0 text-primary-blue transition-colors group-hover:text-primary-cyan" />
                <span className="transition-colors group-hover:text-white">{APP_CONFIG.supportEmail}</span>
              </li>
            </ul>
          </div>

          <div className="reveal reveal-delay-300">
            <h4 className="mb-8 font-sans text-lg font-bold tracking-wide text-white">Newsletter</h4>
            <p className="mb-6 text-sm font-medium text-gray-400">Subscribe to our newsletter for eco-updates.</p>

            <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Your email address"
                disabled={status === 'loading' || status === 'success'}
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-white transition-all placeholder-gray-500 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary-cyan disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={status === 'loading' || status === 'success'}
                className="transform rounded-lg bg-gradient-to-r from-primary-cyan to-primary-blue px-5 py-3 font-bold text-white transition-all hover:from-primary-blue hover:to-primary-cyan hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === 'loading' ? 'Subscribing...' : status === 'success' ? 'Subscribed!' : 'Subscribe'}
              </button>

              {message ? (
                <p className={`text-xs font-medium ${status === 'error' ? 'text-red-400' : 'text-primary-cyan'}`}>
                  {message}
                </p>
              ) : null}
            </form>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-center text-sm font-medium text-gray-500 sm:flex-row sm:text-left">
          <p>&copy; {new Date().getFullYear()} Dyesabel Philippines, Inc. All rights reserved.</p>
          <nav aria-label="Legal" className="flex items-center gap-5">
            <a href={PRIVACY_POLICY_PATH} onClick={(event) => { event.preventDefault(); onLegalNavigate(PRIVACY_POLICY_PATH); }} className="transition-colors hover:text-primary-cyan">Privacy Policy</a>
            <a href={TERMS_OF_SERVICE_PATH} onClick={(event) => { event.preventDefault(); onLegalNavigate(TERMS_OF_SERVICE_PATH); }} className="transition-colors hover:text-primary-cyan">Terms of Service</a>
          </nav>
        </div>
      </div>
    </footer>
  );
};
