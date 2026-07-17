import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, Send, X } from 'lucide-react';
import { APP_CONFIG } from '../config';
import {
  askHybridChatbot,
  ChatbotActiveContext,
  ChatbotCitation,
  ChatbotMedia,
  ChatbotPersonSummary,
  ChatbotTicketMessage,
  ChatHistoryItem,
  normalizeChatbotImageUrl,
  runChatbotDiagnostics,
  submitChatbotTicket
} from '../services/ChatbotService';
import { Chapter, Pillar } from '../types';

interface ChatbotWidgetProps {
  chapters: Chapter[];
  pillars: Pillar[];
  founders: ChatbotPersonSummary[];
  executiveOfficers: ChatbotPersonSummary[];
  activeContext: ChatbotActiveContext;
  hidden?: boolean;
}

type UiMessageRole = 'assistant' | 'user';
type TicketStage = 'idle' | 'awaiting-email' | 'collecting';

interface UiMessage {
  id: string;
  role: UiMessageRole;
  content: string;
  media?: ChatbotMedia[];
  sources?: ChatbotCitation[];
}

const MOBILE_BREAKPOINT = 768;
const BASE_QUICK_PROMPTS = ['File a Ticket', 'What is DYESABEL all about?', 'How can I volunteer?', 'How can I contact your team?'];
const TYPING_FRAMES = ['Thinking', 'Thinking.', 'Thinking..', 'Thinking...'];
const MIN_TYPING_DURATION_MS = 850;
const SEND_COOLDOWN_MIN_MS = 3000;
const SEND_COOLDOWN_MAX_MS = 5000;
const CHATBOT_CLIENT_ID_STORAGE_KEY = 'dyesabel.chatbot.client_id';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const FILE_TICKET_TRIGGER = 'file a ticket';
const DIAGNOSTIC_COMMAND = '/dyesabel-debug';

const makeMessageId = () => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const waitFor = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
};

const randomIntBetween = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const createChatbotClientId = (): string => {
  return `cb-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
};

const getOrCreateChatbotClientId = (): string => {
  if (typeof window === 'undefined') return createChatbotClientId();

  try {
    const existing = String(window.localStorage.getItem(CHATBOT_CLIENT_ID_STORAGE_KEY) || '').trim();
    if (existing) return existing;

    const created = createChatbotClientId();
    window.localStorage.setItem(CHATBOT_CLIENT_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return createChatbotClientId();
  }
};

const INLINE_TOKEN_REGEX = /(\*\*[^*]+\*\*|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

const renderInlineContent = (text: string): React.ReactNode[] => {
  const tokens = text.split(INLINE_TOKEN_REGEX).filter(Boolean);

  return tokens.map((token, index) => {
    const isBold = /^\*\*[^*]+\*\*$/.test(token);
    if (isBold) {
      return <strong key={`token-${index}`}>{token.slice(2, -2)}</strong>;
    }

    const isEmail = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(token);
    if (isEmail) {
      return (
        <a key={`token-${index}`} href={`mailto:${token}`} className="font-semibold underline underline-offset-2">
          {token}
        </a>
      );
    }

    return <React.Fragment key={`token-${index}`}>{token}</React.Fragment>;
  });
};

const renderMessageContent = (content: string) => {
  const lines = String(content || '').split('\n');
  const elements: React.ReactNode[] = [];
  let bulletLines: string[] = [];

  const flushBullets = () => {
    if (!bulletLines.length) return;

    const listItems = bulletLines;
    bulletLines = [];

    elements.push(
      <ul key={`bullets-${elements.length}`} className="list-disc space-y-1 pl-5 leading-relaxed">
        {listItems.map((item, index) => (
          <li key={`bullet-${index}`}>{renderInlineContent(item)}</li>
        ))}
      </ul>
    );
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      flushBullets();
      return;
    }

    const bulletMatch = line.match(/^[*-]\s+(.*)$/);
    if (bulletMatch) {
      bulletLines.push(String(bulletMatch[1] || '').trim());
      return;
    }

    flushBullets();
    elements.push(
      <p key={`p-${elements.length}`} className="whitespace-pre-wrap leading-relaxed">
        {renderInlineContent(line)}
      </p>
    );
  });

  flushBullets();

  if (!elements.length) {
    return <p className="whitespace-pre-wrap leading-relaxed">{content}</p>;
  }

  return <div className="space-y-2">{elements}</div>;
};

const renderMessageMedia = (media: ChatbotMedia[] | undefined) => {
  if (!media || !media.length) return null;

  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {media.map((item, index) => (
        <figure key={`${item.url}-${index}`} className="overflow-hidden rounded-xl border border-ocean-deep/10 bg-white/80 dark:border-white/10 dark:bg-white/5">
          <ChatMediaImage url={item.url} alt={item.alt} />
          {item.caption && (
            <figcaption className="px-2 py-1 text-[11px] font-semibold text-ocean-deep/80 dark:text-white/75">
              {item.caption}
            </figcaption>
          )}
        </figure>
      ))}
    </div>
  );
};

const renderMessageSources = (sources: ChatbotCitation[] | undefined) => {
  if (!sources || !sources.length) return null;

  return (
    <div className="mt-2 border-t border-ocean-deep/10 pt-2 dark:border-white/10">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ocean-deep/65 dark:text-white/60">Sources</p>
      <ul className="mt-1 space-y-1">
        {sources.map((source, index) => (
          <li key={`${source.url}-${index}`}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-primary-blue underline decoration-primary-blue/40 underline-offset-2 hover:decoration-primary-blue dark:text-primary-cyan dark:decoration-primary-cyan/40"
            >
              {source.title || source.url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
};

const ChatMediaImage: React.FC<{ url: string; alt: string }> = ({ url, alt }) => {
  const [resolvedUrl, setResolvedUrl] = useState(() => normalizeChatbotImageUrl(url));
  const [isBroken, setIsBroken] = useState(false);

  useEffect(() => {
    setResolvedUrl(normalizeChatbotImageUrl(url));
    setIsBroken(false);
  }, [url]);

  if (isBroken || !resolvedUrl) {
    return (
      <div className="flex h-24 w-full items-center justify-center bg-slate-200/60 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-600 dark:bg-slate-700/50 dark:text-slate-200">
        Image unavailable
      </div>
    );
  }

  return (
    <img
      src={resolvedUrl}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className="h-24 w-full object-cover"
      onError={() => setIsBroken(true)}
    />
  );
};

const normalizePeople = (people: ChatbotPersonSummary[]): ChatbotPersonSummary[] => {
  return (people || [])
    .map((person) => ({
      name: String(person?.name || '').trim(),
      role: String(person?.role || '').trim(),
      bio: String(person?.bio || '').trim(),
      imageUrl: String(person?.imageUrl || '').trim()
    }))
    .filter((person) => person.name);
};

export const ChatbotWidget: React.FC<ChatbotWidgetProps> = ({
  chapters,
  pillars,
  founders,
  executiveOfficers,
  activeContext,
  hidden = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketStage, setTicketStage] = useState<TicketStage>('idle');
  const [ticketEmail, setTicketEmail] = useState('');
  const [ticketMessages, setTicketMessages] = useState<ChatbotTicketMessage[]>([]);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  const [typingFrameIndex, setTypingFrameIndex] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  const [isFooterVisible, setIsFooterVisible] = useState(false);
  const chatbotClientId = useMemo(() => getOrCreateChatbotClientId(), []);
  const cooldownSeconds = Math.max(1, Math.ceil(cooldownRemainingMs / 1000));

  const quickPrompts = useMemo(() => {
    if (activeContext.type === 'pillar') {
      return [
        `What should I know about ${activeContext.title || 'this pillar'}?`,
        'What activities are under this pillar?',
        ...BASE_QUICK_PROMPTS
      ];
    }

    if (activeContext.type === 'chapter') {
      return [
        `Tell me about ${activeContext.title || 'this chapter'}.`,
        'How can I join this chapter?',
        ...BASE_QUICK_PROMPTS
      ];
    }

    return ['What are your core pillars?', 'Who are your founders?', ...BASE_QUICK_PROMPTS];
  }, [activeContext.type, activeContext.title]);

  const [messages, setMessages] = useState<UiMessage[]>(() => [
    {
      id: makeMessageId(),
      role: 'assistant',
      content: `Hello. I am the DYESABEL assistant. Ask me about our chapters, pillars, volunteering, donations, and partnerships. If I cannot find enough data, I will share our official contact at ${APP_CONFIG.supportEmail}.`
    }
  ]);

  const viewportClass = useMemo(() => {
    if (!isOpen) return 'hidden';
    if (isMobileViewport) return 'fixed inset-0 z-[120]';
    return 'fixed bottom-24 right-5 z-[95] h-[min(560px,calc(100vh-7.5rem))] w-[390px] max-w-[calc(100vw-1.5rem)]';
  }, [isMobileViewport, isOpen]);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onResize = () => {
      setIsMobileViewport(window.innerWidth < MOBILE_BREAKPOINT);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const footer = document.querySelector<HTMLElement>('[data-chatbot-boundary]');
    if (!footer) {
      setIsFooterVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setIsFooterVisible(entry.isIntersecting),
      { threshold: 0 }
    );

    observer.observe(footer);
    return () => observer.disconnect();
  }, [hidden]);

  useEffect(() => {
    if (!isOpen || !messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    container.scrollTop = container.scrollHeight;
  }, [isOpen, messages]);

  useEffect(() => {
    if (!isMobileViewport) return;
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileViewport, isOpen]);

  useEffect(() => {
    if (!isSending) {
      setTypingFrameIndex(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      setTypingFrameIndex((previous) => (previous + 1) % TYPING_FRAMES.length);
    }, 350);

    return () => window.clearInterval(intervalId);
  }, [isSending]);

  useEffect(() => {
    if (cooldownRemainingMs <= 0) return;

    const intervalId = window.setInterval(() => {
      setCooldownRemainingMs((previous) => Math.max(0, previous - 250));
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [cooldownRemainingMs]);

  const closePanel = () => {
    setIsOpen(false);
  };

  const normalizedFounders = useMemo(() => normalizePeople(founders), [founders]);
  const normalizedExecutiveOfficers = useMemo(() => normalizePeople(executiveOfficers), [executiveOfficers]);

  const submitQuestion = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isSending || isSubmittingTicket) return;

    if (trimmed.toLowerCase() === DIAGNOSTIC_COMMAND) {
      setMessages((previous) => [
        ...previous,
        { id: makeMessageId(), role: 'user', content: trimmed }
      ]);
      setInput('');
      setIsSending(true);

      try {
        const result = await runChatbotDiagnostics(chatbotClientId);
        const checkLines = result.checks.map((check) =>
          `- ${check.status === 'ok' ? 'OK' : 'ISSUE'} — ${check.name}: ${check.message}`
        );
        const content = [
          `**Chatbot diagnostic: ${result.ok ? 'PASS' : 'ISSUE FOUND'}**`,
          `**Code:** ${result.code}`,
          `**Message:** ${result.message}`,
          `**Latency:** ${result.latencyMs} ms`,
          `**Checked:** ${result.checkedAt}`,
          '',
          ...checkLines
        ].join('\n');

        setMessages((previous) => [
          ...previous,
          { id: makeMessageId(), role: 'assistant', content }
        ]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setMessages((previous) => [
          ...previous,
          {
            id: makeMessageId(),
            role: 'assistant',
            content: `**Chatbot diagnostic: ISSUE FOUND**\n**Code:** CB-299\n**Message:** Unexpected diagnostic error: ${message}`
          }
        ]);
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (ticketStage === 'idle' && trimmed.toLowerCase() === FILE_TICKET_TRIGGER) {
      setMessages((previous) => [
        ...previous,
        {
          id: makeMessageId(),
          role: 'user',
          content: trimmed
        },
        {
          id: makeMessageId(),
          role: 'assistant',
          content: 'Sure. Please provide your email address first so I can open your support ticket draft.'
        }
      ]);
      setInput('');
      setTicketStage('awaiting-email');
      setTicketEmail('');
      setTicketMessages([]);
      return;
    }

    if (ticketStage === 'awaiting-email') {
      setMessages((previous) => [
        ...previous,
        {
          id: makeMessageId(),
          role: 'user',
          content: trimmed
        }
      ]);
      setInput('');

      if (!EMAIL_REGEX.test(trimmed)) {
        setMessages((previous) => [
          ...previous,
          {
            id: makeMessageId(),
            role: 'assistant',
            content: 'That email format looks invalid. Please send a valid email (example: name@email.com).'
          }
        ]);
        return;
      }

      const normalizedEmail = trimmed.toLowerCase();
      setTicketEmail(normalizedEmail);
      setTicketStage('collecting');
      setTicketMessages([]);
      setMessages((previous) => [
        ...previous,
        {
          id: makeMessageId(),
          role: 'assistant',
          content: 'Email received. Now send all ticket details you want to report. When done, press Submit Ticket. Only details sent from now until submit will be included.'
        }
      ]);
      return;
    }

    if (ticketStage === 'collecting') {
      const ticketMessage: ChatbotTicketMessage = {
        content: trimmed,
        sentAt: new Date().toISOString()
      };

      setMessages((previous) => [
        ...previous,
        {
          id: makeMessageId(),
          role: 'user',
          content: trimmed
        },
        {
          id: makeMessageId(),
          role: 'assistant',
          content: 'Ticket note saved. Add more details or press Submit Ticket when ready.'
        }
      ]);
      setInput('');
      setTicketMessages((previous) => [...previous, ticketMessage]);
      return;
    }

    if (cooldownRemainingMs > 0) return;

    const userMessage: UiMessage = {
      id: makeMessageId(),
      role: 'user',
      content: trimmed
    };

    setMessages((previous) => [...previous, userMessage]);
    setInput('');
    setIsSending(true);
    setCooldownRemainingMs(randomIntBetween(SEND_COOLDOWN_MIN_MS, SEND_COOLDOWN_MAX_MS));

    const requestStartedAt = Date.now();
    const ensureMinimumTypingDuration = async () => {
      const elapsed = Date.now() - requestStartedAt;
      const remaining = MIN_TYPING_DURATION_MS - elapsed;
      if (remaining > 0) {
        await waitFor(remaining);
      }
    };

    try {
      const history: ChatHistoryItem[] = [...messages, userMessage].map((message) => ({
        role: message.role,
        content: message.content
      }));

      const response = await askHybridChatbot(trimmed, history, {
        organizationName: APP_CONFIG.organizationName,
        supportEmail: APP_CONFIG.supportEmail,
        clientId: chatbotClientId,
        supportPhone: APP_CONFIG.supportPhone,
        supportLocation: APP_CONFIG.supportLocation,
        volunteerUrl: APP_CONFIG.volunteerUrl,
        activeContext,
        chapters: chapters.map((chapter) => ({
          id: String(chapter.id),
          name: String(chapter.name || ''),
          location: String(chapter.location || ''),
          headName: String(chapter.headName || ''),
          headRole: String(chapter.headRole || ''),
          headQuote: String(chapter.headQuote || ''),
          headImageUrl: String(chapter.headImageUrl || '')
        })),
        pillars: pillars.map((pillar) => ({
          id: String(pillar.id),
          title: String(pillar.title || ''),
          excerpt: String(pillar.excerpt || '')
        })),
        founders: normalizedFounders,
        executiveOfficers: normalizedExecutiveOfficers
      });

      const assistantMessage: UiMessage = {
        id: makeMessageId(),
        role: 'assistant',
        content: response.answer,
        media: response.media,
        sources: response.sources
      };

      await ensureMinimumTypingDuration();

      setMessages((previous) => [...previous, assistantMessage]);
    } catch (error) {
      await ensureMinimumTypingDuration();
      setMessages((previous) => [
        ...previous,
        {
          id: makeMessageId(),
          role: 'assistant',
          content: `I am having trouble connecting right now. Please email us at ${APP_CONFIG.supportEmail} for immediate assistance.`
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const resetTicketDraft = () => {
    setTicketStage('idle');
    setTicketEmail('');
    setTicketMessages([]);
  };

  const handleSubmitTicket = async () => {
    if (isSubmittingTicket || ticketStage !== 'collecting') return;

    if (!ticketEmail) {
      setMessages((previous) => [
        ...previous,
        {
          id: makeMessageId(),
          role: 'assistant',
          content: 'Please provide your email first to continue with ticket submission.'
        }
      ]);
      setTicketStage('awaiting-email');
      return;
    }

    if (!ticketMessages.length) {
      setMessages((previous) => [
        ...previous,
        {
          id: makeMessageId(),
          role: 'assistant',
          content: 'Please add at least one ticket detail before submitting.'
        }
      ]);
      return;
    }

    setIsSubmittingTicket(true);
    try {
      const result = await submitChatbotTicket(ticketEmail, ticketMessages, {
        organizationName: APP_CONFIG.organizationName,
        supportEmail: APP_CONFIG.supportEmail,
        clientId: chatbotClientId,
        supportPhone: APP_CONFIG.supportPhone,
        supportLocation: APP_CONFIG.supportLocation,
        volunteerUrl: APP_CONFIG.volunteerUrl,
        activeContext,
        chapters: chapters.map((chapter) => ({
          id: String(chapter.id),
          name: String(chapter.name || ''),
          location: String(chapter.location || ''),
          headName: String(chapter.headName || ''),
          headRole: String(chapter.headRole || ''),
          headQuote: String(chapter.headQuote || ''),
          headImageUrl: String(chapter.headImageUrl || '')
        })),
        pillars: pillars.map((pillar) => ({
          id: String(pillar.id),
          title: String(pillar.title || ''),
          excerpt: String(pillar.excerpt || '')
        })),
        founders: normalizedFounders,
        executiveOfficers: normalizedExecutiveOfficers
      });

      setMessages((previous) => [
        ...previous,
        {
          id: makeMessageId(),
          role: 'assistant',
          content:
            `Ticket submitted successfully. Tracking Number: **${result.trackingNumber}**.` +
            ` Manila Time: ${result.timestampManila}. We will follow up through ${ticketEmail}.`
        }
      ]);

      resetTicketDraft();
    } catch (error) {
      const rawError = error instanceof Error ? String(error.message || '').trim() : '';
      const normalizedError = rawError.toLowerCase();
      const needsSheetAuthorization =
        normalizedError.includes('spreadsheetapp.openbyid') ||
        normalizedError.includes('authorization') ||
        normalizedError.includes('pahintulot');

      const supportMessage = needsSheetAuthorization
        ? 'Ticket backend is not authorized to access Google Sheets yet. Please ask an admin to re-authorize and redeploy the Apps Script web app.'
        : rawError
          ? `I could not submit your ticket right now. Reason: ${rawError}`
          : `I could not submit your ticket right now. Please try again in a moment or email us at ${APP_CONFIG.supportEmail}.`;

      setMessages((previous) => [
        ...previous,
        {
          id: makeMessageId(),
          role: 'assistant',
          content: supportMessage
        }
      ]);
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitQuestion(input);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void submitQuestion(input);
  };

  if (hidden) return null;

  const footerVisibilityClass = isFooterVisible
    ? 'pointer-events-none translate-y-8 scale-95 opacity-0'
    : 'translate-y-0 scale-100 opacity-100';

  return (
    <>
      <div
        className={`fixed bottom-5 right-5 z-[94] transform-gpu transition-all duration-300 ease-out motion-reduce:transition-none ${footerVisibilityClass}`}
        aria-hidden={isFooterVisible}
        inert={isFooterVisible}
      >
        <button
          type="button"
          onClick={() => setIsOpen((value) => !value)}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full border border-white/40 bg-gradient-to-br from-primary-blue to-primary-cyan text-white shadow-[0_12px_28px_rgba(5,25,35,0.35)] transition-transform duration-200 hover:scale-105"
          aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
        >
          <span className="absolute -inset-1 rounded-full bg-primary-cyan/35 blur-lg transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />
          {isOpen ? <X className="relative z-10 h-6 w-6" /> : <MessageCircle className="relative z-10 h-6 w-6" />}
        </button>
      </div>

      <section
        className={`${viewportClass} transform-gpu transition-all duration-300 ease-out motion-reduce:transition-none ${footerVisibilityClass}`}
        aria-hidden={isFooterVisible || undefined}
        aria-live="polite"
        inert={isFooterVisible}
      >
        {isOpen && (
          <div className="flex h-full w-full flex-col border border-ocean-deep/10 bg-white/95 text-ocean-deep shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#041520]/95 dark:text-white md:overflow-hidden md:rounded-3xl">
            <header className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-ocean-deep to-primary-blue px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                {isMobileViewport && (
                  <button
                    type="button"
                    onClick={closePanel}
                    className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                    aria-label="Back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.14em] text-primary-cyan">DYESABEL Assistant</h2>
                </div>
              </div>

              {!isMobileViewport && (
                <button
                  type="button"
                  onClick={closePanel}
                  className="rounded-lg p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                  aria-label="Close assistant"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </header>

            <div ref={messagesContainerRef} className="custom-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${
                    message.role === 'user'
                      ? 'ml-auto bg-primary-cyan text-[#022536]'
                      : 'mr-auto border border-ocean-deep/10 bg-ocean-deep/[0.04] text-ocean-deep dark:border-white/10 dark:bg-white/5 dark:text-white'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="mb-2 flex items-center gap-2">
                      <img
                        src={APP_CONFIG.logoUrl}
                        alt="DYESABEL logo"
                        loading="lazy"
                        decoding="async"
                        className="h-6 w-6 rounded-full object-contain ring-1 ring-ocean-deep/15 dark:ring-white/20"
                      />
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-primary-blue dark:text-primary-cyan/95">
                        DYESABEL Assistant
                      </p>
                    </div>
                  )}
                  {renderMessageContent(message.content)}
                  {renderMessageMedia(message.media)}
                  {renderMessageSources(message.sources)}
                </article>
              ))}

              {isSending && (
                <div className="mr-auto inline-flex items-center gap-2 rounded-xl border border-ocean-deep/10 bg-ocean-deep/[0.04] px-3 py-2 text-xs text-ocean-deep/80 dark:border-white/10 dark:bg-white/5 dark:text-white/80">
                  <span className="inline-flex items-center gap-0.5" aria-hidden="true">
                    <span className="chatbot-typing-dot" />
                    <span className="chatbot-typing-dot chatbot-typing-dot-delay-1" />
                    <span className="chatbot-typing-dot chatbot-typing-dot-delay-2" />
                  </span>
                  {TYPING_FRAMES[typingFrameIndex]}
                </div>
              )}
            </div>

            <div className="border-t border-ocean-deep/10 bg-ocean-deep/[0.03] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="chatbot-prompt-scroll overflow-x-auto">
                <div className="inline-flex min-w-full flex-nowrap gap-2 pb-1">
                  {quickPrompts.map((prompt) => (
                    <button
                      type="button"
                      key={prompt}
                      onClick={() => void submitQuestion(prompt)}
                      disabled={isSending || isSubmittingTicket || ticketStage !== 'idle' || cooldownRemainingMs > 0}
                      className="shrink-0 whitespace-nowrap rounded-full border border-ocean-deep/15 bg-white px-3 py-1 text-xs font-semibold text-ocean-deep/85 transition-colors hover:bg-primary-cyan/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-white/85 dark:hover:bg-white/10"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
              {ticketStage !== 'idle' && (
                <div className="mt-2 rounded-xl border border-primary-cyan/40 bg-primary-cyan/10 px-3 py-2 text-xs text-[#063444] dark:border-primary-cyan/45 dark:bg-primary-cyan/10 dark:text-primary-cyan">
                  {ticketStage === 'awaiting-email' && 'Ticket mode is active. Send your email to begin collecting ticket details.'}
                  {ticketStage === 'collecting' && `Ticket mode active for ${ticketEmail}. Notes captured: ${ticketMessages.length}.`}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {ticketStage === 'collecting' && (
                      <button
                        type="button"
                        onClick={() => void handleSubmitTicket()}
                        disabled={isSubmittingTicket || !ticketMessages.length}
                        className="rounded-full bg-primary-blue px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white transition-colors hover:bg-[#164a8a] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSubmittingTicket ? 'Submitting...' : 'Submit Ticket'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={resetTicketDraft}
                      disabled={isSubmittingTicket}
                      className="rounded-full border border-ocean-deep/20 bg-white px-3 py-1 text-[11px] font-semibold text-ocean-deep transition-colors hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:bg-white/10 dark:text-white"
                    >
                      Cancel Ticket
                    </button>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleFormSubmit} className="border-t border-ocean-deep/10 bg-ocean-deep/[0.03] px-3 py-3 dark:border-white/10 dark:bg-black/20">
              <div className="flex items-end gap-2 rounded-xl border border-ocean-deep/15 bg-white p-2 dark:border-white/15 dark:bg-white/5">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={
                    ticketStage === 'awaiting-email'
                      ? 'Enter your email address...'
                      : ticketStage === 'collecting'
                        ? 'Type ticket details to save in your draft...'
                        : cooldownRemainingMs > 0
                          ? `Please wait ${cooldownSeconds}s before sending again...`
                          : 'Type your inquiry...'
                  }
                  rows={1}
                  className="max-h-28 min-h-[2.25rem] w-full resize-none bg-transparent px-1 py-1 text-sm text-ocean-deep placeholder:text-ocean-deep/45 focus:outline-none dark:text-white dark:placeholder:text-white/45"
                />
                <button
                  type="submit"
                  disabled={isSending || isSubmittingTicket || (ticketStage === 'idle' && cooldownRemainingMs > 0) || !input.trim()}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary-cyan text-[#062438] transition-colors hover:bg-[#7bf0ff] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              {ticketStage === 'idle' && cooldownRemainingMs > 0 && (
                <p className="mt-2 text-xs font-medium text-ocean-deep/70 dark:text-white/70">
                  Cooldown active. Please wait about {cooldownSeconds} second(s).
                </p>
              )}
            </form>
          </div>
        )}
      </section>
    </>
  );
};

export default ChatbotWidget;
