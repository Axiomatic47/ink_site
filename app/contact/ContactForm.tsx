// ContactForm — "Get in touch" (owner 2026-09-15): a message form on a
// Netlify Forms backend, the same mechanism as the Open Readings answer form.
// Posts URL-encoded, same origin, to public/__forms/contact.html; Netlify
// keeps the submission in the Forms dashboard and e-mails the owner (the
// notification address is set in the Netlify UI). The submission-created
// function ignores every form but open-reading, so nothing lands in the
// readings queue. Honeypot "bot-field"; no data leaves the site's origin.
'use client';

import { useState } from 'react';
import { Send, Loader2, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const ENDPOINT = '/__forms/contact.html';
const field = 'w-full min-h-11 rounded-md border border-rule bg-card px-3 py-2 text-base text-ink placeholder:text-muted/70 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25';
const label = 'block text-xs uppercase tracking-[0.08em] text-muted mb-1.5';

export function ContactForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body = new URLSearchParams();
    body.set('form-name', 'contact');
    for (const k of ['bot-field', 'name', 'email', 'subject', 'message']) body.set(k, String(fd.get(k) ?? ''));
    body.set('page', typeof location !== 'undefined' ? location.pathname : '/contact');
    setState('sending'); setError(null);
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      if (!res.ok) throw new Error(`The form service answered ${res.status}.`);
      setState('sent');
      form.reset();
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (state === 'sent') {
    return (
      <div className="rounded-lg border border-rule bg-card shadow-card p-6 flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 text-accent mt-0.5 shrink-0" aria-hidden />
        <div>
          <p className="font-serif text-lg text-ink" style={{ fontWeight: 600 }}>Thank you — your message has been sent.</p>
          <p className="text-sm text-ink/80 mt-1">I read everything that arrives here and reply by e-mail.</p>
          <button type="button" onClick={() => setState('idle')} className="mt-3 inline-flex items-center min-h-11 lg:min-h-0 text-sm text-accent-ink underline">Send another message</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} name="contact" method="POST" action={ENDPOINT} className="rounded-lg border border-rule bg-card shadow-card p-6 grid gap-4" aria-label="Contact form">
      <input type="hidden" name="form-name" value="contact" />
      <div className="hidden" aria-hidden="true"><label>Leave this field empty <input type="text" name="bot-field" tabIndex={-1} autoComplete="off" /></label></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className={label}>Name</label>
          <input id="c-name" name="name" type="text" required autoComplete="name" className={field} />
        </div>
        <div>
          <label htmlFor="c-email" className={label}>E-mail</label>
          <input id="c-email" name="email" type="email" required autoComplete="email" className={field} />
        </div>
      </div>
      <div>
        <label htmlFor="c-subject" className={label}>Subject</label>
        <input id="c-subject" name="subject" type="text" required className={field} placeholder="Publishing, funding, collaboration, a question about the work" />
      </div>
      <div>
        <label htmlFor="c-message" className={label}>Message</label>
        <textarea id="c-message" name="message" required rows={7} className={cn(field, 'resize-y min-h-[9rem]')} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Sent to my inbox through the site\u2019s form service; nothing is stored beyond the message itself.</p>
        <button type="submit" disabled={state === 'sending'} className="inline-flex items-center gap-2 min-h-11 lg:min-h-0 rounded-md bg-ink text-on-ink px-4 py-2 text-sm hover:bg-ink-2 disabled:opacity-60" style={{ fontWeight: 600 }}>
          {state === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Send message
        </button>
      </div>
      {state === 'error' && <p role="alert" className="text-sm text-red-700 dark:text-red-400">The message could not be sent ({error}). Please e-mail instead.</p>}
    </form>
  );
}
