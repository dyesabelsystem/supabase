import React from 'react';
import { useAppDialog } from '../contexts/AppDialogContext';

const VOLUNTEER_URL = "https://tinyurl.com/DyesabelVolunteers2026";
const HERO_BACKGROUND_IMAGE = 'https://i.imgur.com/LH9trqH.jpeg';

interface HeroProps {
  onDonateClick: (e: React.MouseEvent) => void;
}

export const Hero: React.FC<HeroProps> = ({ onDonateClick }) => {
  const { showAlert } = useAppDialog();

  const handleJoinClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!VOLUNTEER_URL) {
      e.preventDefault();
      await showAlert('No membership application open yet');
    }
  };

  return (
    <section className="relative h-screen min-h-[700px] flex items-center justify-center overflow-hidden">
      <div
        className="hero-background-image"
        style={{ backgroundImage: `url(${HERO_BACKGROUND_IMAGE})` }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-ocean-deep/5 via-ocean-deep/20 to-ocean-light dark:to-ocean-dark pointer-events-none"
        aria-hidden="true"
      />
      
      <div className="relative z-10 container mx-auto px-4 text-center text-ocean-deep dark:text-white reveal active">
        
        {/* ✅ Title Container: Added padding to prevent cutting off the sides */}
        {/* ✅ Animation: Changed to 'animate-float-y' to stop tilting */}
        <div className="animate-float-y mb-10 md:mb-14 flex justify-center w-full px-2">
          <h1 className="font-lobster tracking-wide drop-shadow-xl bg-clip-text text-transparent bg-gradient-to-b from-ocean-deep to-primary-blue dark:from-white dark:to-primary-cyan py-4 leading-tight
            text-[clamp(3.5rem,11vw,9rem)] /* ✅ Enforces title is always massive relative to viewport */
            whitespace-normal md:whitespace-nowrap /* ✅ Wraps on tiny phones, single line on desktop */
          ">
            Dyesabel Philippines
          </h1>
        </div>
        
        {/* ✅ Description: Increased margin-top and set max-width */}
        <p className="text-lg md:text-xl lg:text-2xl font-light max-w-4xl mx-auto mb-16 text-ocean-deep/90 dark:text-white/90 drop-shadow-sm reveal reveal-delay-200 leading-relaxed px-4">
          <span className="font-semibold text-primary-blue dark:text-primary-cyan">D</span>eveloping the <span className="font-semibold text-primary-blue dark:text-primary-cyan">Y</span>outh with <span className="font-semibold text-primary-blue dark:text-primary-cyan">E</span>nvironmentally <span className="font-semibold text-primary-blue dark:text-primary-cyan">S</span>ustainable <span className="font-semibold text-primary-blue dark:text-primary-cyan">A</span>dvocacies <span className="font-semibold text-primary-blue dark:text-primary-cyan">B</span>uilding and <span className="font-semibold text-primary-blue dark:text-primary-cyan">E</span>mpowering <span className="font-semibold text-primary-blue dark:text-primary-cyan">L</span>ives <span className="font-semibold text-primary-blue dark:text-primary-cyan">Philippines, Inc.</span>
        </p>
        
        <div className="flex flex-col sm:flex-row gap-6 justify-center items-center reveal reveal-delay-300">
          <button 
            onClick={onDonateClick}
            className="bg-gradient-to-r from-primary-cyan to-primary-blue text-white font-black tracking-wide py-4 px-10 rounded-full hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] transition-all transform hover:-translate-y-1 flex items-center justify-center gap-2 group text-lg shadow-lg"
          >
            Donate
          </button>
          
          <a 
            href={VOLUNTEER_URL || '#'}
            onClick={handleJoinClick}
            target={VOLUNTEER_URL ? "_blank" : undefined}
            rel={VOLUNTEER_URL ? "noopener noreferrer" : undefined}
            className="glass text-ocean-deep dark:text-white font-bold tracking-wide py-4 px-10 rounded-full hover:bg-white/20 transition-all hover:shadow-lg transform hover:-translate-y-1 border border-ocean-deep/20 dark:border-white/30 text-lg backdrop-blur-md flex items-center justify-center cursor-pointer"
          >
            Join the Movement
          </a>
        </div>
      </div>
      
      {/* Gradient overlay at bottom to blend into next section */}
      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-ocean-light dark:from-ocean-dark to-transparent pointer-events-none"></div>
    </section>
  );
};
