import React, { useEffect } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function PortalInfo() {
  // Ensure the page loads at the top
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#021017] pt-32 pb-16 px-4 font-sans transition-colors duration-500">
      <div className="max-w-4xl mx-auto">
        
        {/* Back Button */}
        <button 
          onClick={() => window.location.href = '/'}
          className="group mb-8 flex w-fit items-center gap-2 text-sm font-bold text-ocean-deep/60 transition-colors hover:text-primary-blue dark:text-white/50 dark:hover:text-primary-cyan"
        >
          <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-1" />
          Return to Main Website
        </button>

        {/* Main Content Card */}
        <div className="bg-white dark:bg-[#051923] rounded-3xl shadow-2xl border border-gray-200 dark:border-white/10 p-8 md:p-12 overflow-hidden relative">
          
          {/* Decorative Background Blob */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-primary-cyan/10 rounded-full blur-3xl pointer-events-none"></div>

          {/* Header */}
          <div className="relative z-10 mb-10 border-b border-gray-200 dark:border-white/10 pb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary-blue/10 dark:bg-primary-cyan/10 flex items-center justify-center text-primary-blue dark:text-primary-cyan">
                <ShieldCheck size={28} />
              </div>
              <h1 className="text-3xl md:text-4xl font-black text-ocean-deep dark:text-white tracking-tight">
                Web Portal Gateway
              </h1>
            </div>
            <p className="text-lg text-ocean-deep/70 dark:text-gray-400 font-medium">
              Official digital access point for Dyesabel Philippines, Inc.
            </p>
          </div>

          {/* Content Section */}
          <div className="relative z-10 space-y-8">
            <section>
              <h2 className="text-xl font-bold text-ocean-deep dark:text-white mb-5 flex items-center gap-3">
                <span className="w-6 h-1 bg-primary-cyan rounded-full"></span>
                App Purpose & Data Usage
              </h2>
              
              <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-6 md:p-8 border border-gray-100 dark:border-white/10 space-y-5">
                <p className="text-base md:text-lg text-ocean-deep/80 dark:text-gray-300 leading-relaxed text-justify">
                  The Dyesabel Philippines Web Portal is an internal management system designed for our organization's registered youth volunteers, chapter officers, and community partners across the Davao Region and beyond.
                </p>
                <p className="text-base md:text-lg text-ocean-deep/80 dark:text-gray-300 leading-relaxed text-justify">
                  By authenticating with their Google accounts, authorized users can securely access our internal tools, manage chapter activities, track volunteer service hours, and coordinate environmental sustainability campaigns. 
                </p>
                <div className="mt-6 p-4 bg-primary-blue/5 dark:bg-primary-cyan/5 border border-primary-blue/20 dark:border-primary-cyan/20 rounded-xl">
                  <p className="text-sm md:text-base text-ocean-deep dark:text-white/90 font-medium leading-relaxed">
                    <strong>Data Privacy Notice:</strong> We request basic profile information strictly to verify user identity and maintain secure access to our organizational resources. We are committed to protecting your data in compliance with our Privacy Policy.
                  </p>
                </div>
              </div>
            </section>
          </div>

        </div>
      </div>
    </div>
  );
}