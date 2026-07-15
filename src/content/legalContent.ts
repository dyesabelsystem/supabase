export interface LegalSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export interface LegalDocument {
  title: string;
  shortTitle: string;
  description: string;
  effectiveDate: string;
  introduction: string[];
  sections: LegalSection[];
}

const organization = 'Developing the Youth with Environmentally Sustainable Advocacies Building and Empowering Lives Philippines, Inc. (DYESABEL PH Inc.)';
const supportEmail = 'projectdyesabel@gmail.com';

// This content is intentionally isolated from the page component so it can be
// replaced by a legal-content API without changing the presentation layer.
export const privacyPolicy: LegalDocument = {
  title: 'Privacy Policy',
  shortTitle: 'Privacy',
  description: 'How DYESABEL PH Inc. collects, uses, shares, stores, and protects personal data through its website and related services.',
  effectiveDate: 'July 15, 2026',
  introduction: [
    `${organization} respects your privacy and processes personal data in accordance with Republic Act No. 10173, or the Data Privacy Act of 2012, its Implementing Rules and Regulations, and other applicable Philippine laws.`,
    'This Policy applies to dyesabelph.org, its account and support features, newsletter subscription, chatbot, donation information page, and forms or services that this website links to or operates. It does not apply to an unrelated third party’s independent practices.'
  ],
  sections: [
    {
      title: '1. Personal data we collect',
      items: [
        'Account and profile data: email address, username, assigned role, chapter or pillar assignment, account identifiers, authentication records, and profile changes.',
        'Authentication and security data: sign-in method, session tokens, password-reset activity, and a limited device fingerprint made from browser, language, platform, screen size, and time-zone information. Passwords are handled by the authentication service and are not displayed to DYESABEL administrators.',
        'Newsletter data: email address, subscription status, source, and subscription timestamps.',
        'Chatbot and support data: questions, conversation messages, email address when a support ticket is submitted, ticket number and status, timestamps, and relevant website context supplied with the conversation.',
        'Donation-related data: the public donation page does not collect card or online-banking credentials. If a donation is confirmed or acknowledged separately, authorized staff may record and publish a donor name, amount, currency, method, and date. A donor may be shown as Anonymous.',
        'Technical and local data: requests and diagnostic information needed to operate and secure the service, plus preferences and temporary application state stored in your browser, such as theme, page position, cached public content, and sign-in session data.',
        'Information submitted through linked services: volunteer applications and some other activities may use Google Forms or another identified third-party service. The information requested on those forms is also governed by the notice shown with that service.'
      ]
    },
    {
      title: '2. How and why we use personal data',
      items: [
        'Provide, authenticate, secure, and administer approved website accounts and role-based dashboards.',
        'Deliver password resets, account notices, newsletter updates, support confirmations, donation acknowledgments, partnership messages, and other requested communications.',
        'Answer chatbot questions, create and manage support tickets, and improve incomplete website knowledge from questions the chatbot could not answer.',
        'Publish organization content, chapter information, activities, partners, officers, donation information, and other material authorized for public display.',
        'Prevent abuse, enforce rate limits, diagnose failures, maintain audit records, and protect the website, its users, and DYESABEL PH Inc.',
        'Meet legal, regulatory, accounting, safeguarding, and organizational obligations, and establish or defend legal claims.'
      ],
      paragraphs: [
        'Depending on the activity, processing is based on your consent, steps taken at your request, the performance of an agreement, compliance with law, or the legitimate interests of operating and protecting DYESABEL PH Inc. and its services. Where consent is the basis, you may withdraw it without affecting processing already performed lawfully.'
      ]
    },
    {
      title: '3. Chatbot and automated processing',
      paragraphs: [
        'The chatbot sends your question, recent conversation, and relevant public website context to Google’s Gemini service through a protected Google Apps Script or Supabase function. Do not enter passwords, one-time codes, financial credentials, government identifiers, health information, or other sensitive personal data. Chatbot answers may be incomplete or incorrect and are not professional advice.',
        'If you choose to create a support ticket, the submitted email, conversation, and context are stored for review by authorized DYESABEL personnel. A chatbot client identifier may also be used temporarily to enforce request limits.'
      ]
    },
    {
      title: '4. When we share data',
      paragraphs: [
        'We share personal data only as reasonably necessary with authorized DYESABEL officers, staff, chapter personnel, and service providers acting for us; when you direct us to do so; or when required by law or needed to protect rights, safety, and security.'
      ],
      items: [
        'Supabase provides database, authentication, and server-function infrastructure.',
        'Google provides OAuth sign-in, Forms, Apps Script, Drive image hosting, email delivery, and Gemini chatbot processing where those features are used.',
        'Vercel hosts and delivers the website.',
        'Links to Facebook, Instagram, Google Forms, and other external sites take you to services with their own privacy practices.'
      ]
    },
    {
      title: '5. Storage, security, and retention',
      paragraphs: [
        'We use role-based access, authentication, row-level database controls, protected server secrets, encrypted HTTPS connections, request limits, and audit records designed to reduce unauthorized access. No online system can guarantee absolute security.',
        'We retain data only for as long as needed for the purposes described above, including operational, legal, accounting, dispute-resolution, and security needs. Account records remain while the account is active or required for administration; support and audit records are kept as needed to resolve requests and protect the service; newsletter data remains until you unsubscribe or request deletion. Browser session data is generally removed when you sign out, close the session, or clear site data. Backups may retain deleted data for a limited recovery period.'
      ]
    },
    {
      title: '6. Your privacy rights',
      paragraphs: [
        'Subject to applicable law, you may request access to or a copy of your personal data, correction of inaccurate data, objection to or restriction of processing, deletion or blocking, data portability where applicable, withdrawal of consent, and information about processing. You may also lodge a complaint with the National Privacy Commission and may have rights to damages where provided by law.',
        `To exercise a right, unsubscribe, or report a privacy concern, email ${supportEmail}. We may verify your identity before acting on a request. We will respond within the period required by applicable law.`
      ]
    },
    {
      title: '7. Children and young people',
      paragraphs: [
        'Our advocacy serves young people, but the website is not intended to collect a child’s personal data without appropriate notice and the consent or other lawful authorization required by Philippine law. A parent, guardian, or participant who believes a child’s data was submitted improperly should contact us promptly.'
      ]
    },
    {
      title: '8. Changes and contact',
      paragraphs: [
        `We may update this Policy when our services or legal obligations change. The effective date above identifies the current version. Material changes will be announced through the website or another appropriate channel. Questions may be sent to ${supportEmail} or addressed to DYESABEL PH Inc., Davao, Philippines. SEC Registration ID: 2023040094046-98.`
      ]
    }
  ]
};

export const termsOfService: LegalDocument = {
  title: 'Terms of Service',
  shortTitle: 'Terms',
  description: 'The rules that apply when using the DYESABEL PH Inc. website, accounts, chatbot, donation information, and linked services.',
  effectiveDate: 'July 15, 2026',
  introduction: [
    `These Terms govern your use of dyesabelph.org and the online services made available by ${organization}. By accessing or using the website, you agree to these Terms and the Privacy Policy. If you do not agree, do not use the service.`,
    'Additional written terms, notices, safeguarding rules, or consent forms may apply to a specific program, event, membership, volunteer activity, partnership, or donation. Those specific terms control if they conflict with these general Terms.'
  ],
  sections: [
    {
      title: '1. Website purpose and eligibility',
      paragraphs: [
        'The website provides information about DYESABEL PH Inc., its environmental and youth advocacies, chapters, partners, activities, opportunities, and ways to support the organization. You must be legally capable of accepting these Terms. A minor must use features that submit personal data or create commitments only with the involvement and permission required from a parent or legal guardian.'
      ]
    },
    {
      title: '2. Accounts and access',
      items: [
        'Dashboard accounts are intended for users authorized by DYESABEL PH Inc. Account creation or access does not grant membership, employment, an officer position, or authority to represent the organization.',
        'You must provide accurate information, protect your credentials and one-time codes, use only your own account, and promptly report suspected unauthorized access.',
        'Roles and permissions are assigned by DYESABEL PH Inc. We may suspend, restrict, or remove access when authorization ends, security is at risk, these Terms are violated, or action is reasonably necessary to protect the organization or another person.',
        'You remain responsible for activity performed through your account except to the extent caused by a failure for which DYESABEL PH Inc. is legally responsible.'
      ]
    },
    {
      title: '3. Acceptable use',
      paragraphs: ['You agree not to:'],
      items: [
        'Break the law, violate another person’s rights or privacy, impersonate another person, or falsely claim authority from DYESABEL PH Inc.',
        'Upload, publish, or send material that is unlawful, deceptive, defamatory, threatening, discriminatory, exploitative, infringing, malicious, or inappropriate for a youth- and community-focused organization.',
        'Attempt to bypass authentication, permissions, rate limits, or security controls; probe for vulnerabilities without written permission; introduce malware; scrape excessively; or disrupt the service.',
        'Use the chatbot or support tools for spam, automated abuse, harassment, sensitive credential submission, or instructions intended to override system safeguards.',
        'Copy, alter, sell, sublicense, or commercially exploit website content except as allowed by law or with written permission from the rights holder.'
      ]
    },
    {
      title: '4. Content and intellectual property',
      paragraphs: [
        'The website, branding, design, text, graphics, photos, videos, and organization-created materials are owned by or licensed to DYESABEL PH Inc. and are protected by applicable intellectual-property laws. You may view and share public page links for personal, educational, and non-commercial purposes, provided you do not remove attribution or imply endorsement.',
        'You retain ownership of material you submit. You grant DYESABEL PH Inc. a non-exclusive, worldwide, royalty-free license to host, reproduce, format, and display that material only as needed to operate the service and carry out the activity for which it was submitted. You confirm that you have the rights and permissions required to submit it, including consent for identifiable people shown in media.'
      ]
    },
    {
      title: '5. Donations',
      paragraphs: [
        'The donation page currently publishes payment instructions and account or QR details; the website itself does not process payment-card or online-banking credentials. A donation is completed through the payment provider or financial institution you choose and may also be subject to that provider’s terms and fees.',
        'Unless DYESABEL PH Inc. expressly agrees otherwise or applicable law requires it, donations are voluntary and non-refundable after receipt. Contact us promptly about an error or unauthorized transfer. Any description of intended allocations reflects current plans and may change reasonably to meet program needs, donor restrictions accepted in writing, legal requirements, or urgent organizational priorities. Tax treatment depends on applicable law and your circumstances; no tax result is promised.',
        'Donor recognition is published only when authorized. You may ask to be identified as Anonymous or request correction or removal of a public recognition entry.'
      ]
    },
    {
      title: '6. Volunteers, programs, and external services',
      paragraphs: [
        'A form submission, inquiry, application, or website sign-up does not guarantee acceptance into a program, chapter, partnership, volunteer role, event, or benefit. DYESABEL PH Inc. may apply reasonable eligibility, safeguarding, capacity, conduct, and verification requirements.',
        'The website links to third-party services such as Google Forms, Google sign-in, social networks, payment providers, and partner sites. Their services are governed by their own terms and privacy practices. Links are provided for convenience and do not make DYESABEL PH Inc. responsible for independent third-party content or conduct.'
      ]
    },
    {
      title: '7. Chatbot and informational content',
      paragraphs: [
        'The chatbot uses automated technology and may produce incomplete, outdated, or incorrect answers. Website and chatbot content is general information, not legal, medical, financial, safety, or other professional advice. Verify important information with an authorized DYESABEL representative before relying on it. Do not use the chatbot for emergencies; contact the appropriate emergency service or authority.'
      ]
    },
    {
      title: '8. Availability and disclaimers',
      paragraphs: [
        'We aim to keep the service accurate and available, but it is provided on an “as is” and “as available” basis to the extent permitted by law. We do not promise uninterrupted access, error-free operation, permanent storage, or that every item of public content is current. We may correct, remove, suspend, or change features and content at any time. Nothing in these Terms excludes a warranty or right that cannot lawfully be excluded.'
      ]
    },
    {
      title: '9. Responsibility and liability',
      paragraphs: [
        'To the maximum extent permitted by law, DYESABEL PH Inc. and its officers, volunteers, chapters, and service providers are not liable for indirect, incidental, special, consequential, or punitive loss arising from use of the service, external services, or reliance on general website content. This limitation does not apply to fraud, willful misconduct, gross negligence, violation of data-subject rights, or another liability that applicable law does not allow us to limit.',
        'You are responsible for loss caused by your unlawful use, infringement, submitted content, or material breach of these Terms, subject to applicable law.'
      ]
    },
    {
      title: '10. Changes, governing law, and contact',
      paragraphs: [
        `We may update these Terms as the service changes. The effective date above identifies the current version. Continued use after an updated version takes effect means you accept it, except where separate consent is legally required. These Terms are governed by the laws of the Republic of the Philippines. The parties should first try in good faith to resolve a dispute by contacting ${supportEmail}; any unresolved dispute will be submitted to the courts or authorities with jurisdiction under applicable Philippine law.`,
        `If part of these Terms is unenforceable, the remaining parts continue in effect. A delay in enforcing a term is not a waiver. Questions may be sent to ${supportEmail} or addressed to DYESABEL PH Inc., Davao, Philippines. SEC Registration ID: 2023040094046-98.`
      ]
    }
  ]
};
