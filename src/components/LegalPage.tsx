import React from 'react';
import { ArrowLeft, FileText, Mail, ShieldCheck } from 'lucide-react';
import { LegalDocument, privacyPolicy, termsOfService } from '../content/legalContent';
import { PRIVACY_POLICY_PATH, TERMS_OF_SERVICE_PATH } from '../utils/routes';

interface LegalPageProps {
  type: 'privacy' | 'terms';
  onBack: () => void;
  onNavigate: (path: string) => void;
}

const DocumentBody: React.FC<{ document: LegalDocument }> = ({ document }) => (
  <article className="mx-auto max-w-4xl rounded-3xl border border-ocean-deep/10 bg-white/90 p-6 shadow-2xl shadow-ocean-deep/10 backdrop-blur-xl dark:border-white/10 dark:bg-ocean-deep/80 sm:p-10 lg:p-14">
    <div className="mb-10 border-b border-ocean-deep/10 pb-8 dark:border-white/10">
      <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-primary-cyan/15 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-primary-blue dark:text-primary-cyan">
        <ShieldCheck size={16} /> Legal information
      </div>
      <h1 className="text-4xl font-black tracking-tight text-ocean-deep dark:text-white sm:text-5xl">{document.title}</h1>
      <p className="mt-4 max-w-3xl text-base leading-7 text-ocean-deep/70 dark:text-gray-300">{document.description}</p>
      <p className="mt-5 text-sm font-bold text-ocean-deep/60 dark:text-gray-400">Effective date: {document.effectiveDate}</p>
    </div>

    <div className="space-y-5 text-[15px] leading-7 text-ocean-deep/80 dark:text-gray-300">
      {document.introduction.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </div>

    <div className="mt-12 space-y-12">
      {document.sections.map((section) => (
        <section key={section.title}>
          <h2 className="mb-4 text-2xl font-black tracking-tight text-ocean-deep dark:text-white">{section.title}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph} className="mb-4 text-[15px] leading-7 text-ocean-deep/80 dark:text-gray-300">{paragraph}</p>
          ))}
          {section.items ? (
            <ul className="space-y-3 pl-5 text-[15px] leading-7 text-ocean-deep/80 marker:text-primary-blue dark:text-gray-300 dark:marker:text-primary-cyan">
              {section.items.map((item) => <li key={item} className="list-disc pl-2">{item}</li>)}
            </ul>
          ) : null}
        </section>
      ))}
    </div>

    <div className="mt-14 rounded-2xl border border-primary-cyan/30 bg-primary-cyan/10 p-6">
      <div className="flex items-start gap-3">
        <Mail className="mt-1 flex-shrink-0 text-primary-blue dark:text-primary-cyan" size={20} />
        <div>
          <h2 className="font-black text-ocean-deep dark:text-white">Questions or requests?</h2>
          <p className="mt-1 text-sm leading-6 text-ocean-deep/70 dark:text-gray-300">
            Contact <a href="mailto:projectdyesabel@gmail.com" className="font-bold text-primary-blue hover:underline dark:text-primary-cyan">projectdyesabel@gmail.com</a>.
          </p>
        </div>
      </div>
    </div>
  </article>
);

export const LegalPage: React.FC<LegalPageProps> = ({ type, onBack, onNavigate }) => {
  const document = type === 'privacy' ? privacyPolicy : termsOfService;
  const relatedPath = type === 'privacy' ? TERMS_OF_SERVICE_PATH : PRIVACY_POLICY_PATH;
  const relatedLabel = type === 'privacy' ? 'Terms of Service' : 'Privacy Policy';

  return (
    <div className="min-h-screen px-4 pb-20 pt-28 sm:pt-32">
      <div className="mx-auto mb-6 flex max-w-4xl items-center justify-between gap-4">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-full border border-ocean-deep/10 bg-white/80 px-4 py-2 text-sm font-bold text-ocean-deep shadow-sm transition hover:-translate-x-1 hover:border-primary-cyan dark:border-white/10 dark:bg-white/5 dark:text-white">
          <ArrowLeft size={17} /> Back to home
        </button>
        <button onClick={() => onNavigate(relatedPath)} className="inline-flex items-center gap-2 text-sm font-bold text-primary-blue hover:underline dark:text-primary-cyan">
          <FileText size={16} /> {relatedLabel}
        </button>
      </div>
      <DocumentBody document={document} />
    </div>
  );
};
