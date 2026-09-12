'use client';
// ReadingAnswerForm — the answer form on an Open Readings item page. Posts
// URL-encoded, same origin, to the Netlify Forms target
// (public/__forms/open-reading.html); Netlify's submission-created function
// queues it privately for the owner. Nothing is published automatically;
// contact is never published.
import React, { useState } from 'react';
import { HEBREW_FACE, renderBidi } from './bidi';

const ENDPOINT = process.env.NEXT_PUBLIC_OPEN_READINGS_FORM_ENDPOINT || '/__forms/open-reading.html';
const NOTE_MAX = 1000;

interface Props { collection: string; itemId: string; ourReading: string; comparisonReading: string; language: string; resolved?: boolean; contactEmail: string }
type Letter = 'A' | 'B' | 'C' | 'D';
type Publish = 'publish' | 'author_only';

const input = 'w-full h-10 rounded-md border border-rule bg-card px-3 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-accent/50 disabled:opacity-50';
const label = 'block text-sm mb-2 text-ink';

export function ReadingAnswerForm({ collection, itemId, ourReading, comparisonReading, language, resolved, contactEmail }: Props) {
  const [letter, setLetter] = useState<Letter | ''>('');
  const [reading, setReading] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [credentials, setCredentials] = useState('');
  const [contact, setContact] = useState('');
  const [noContact, setNoContact] = useState(false);
  const [publish, setPublish] = useState<Publish>('publish');
  const [anonymous, setAnonymous] = useState(false);
  const [credPublic, setCredPublic] = useState(true);
  const [ack, setAck] = useState(true);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const rtl = language === 'he' || language === 'ar' || language === 'syc';

  function validate(): string | null {
    if (!letter) return 'Choose one of the four answers.';
    if (letter === 'C' && !reading.trim()) return 'Answer C needs your own reading.';
    if (!noContact && !contact.trim()) return 'Give a way to reach you, or tick "no contact".';
    if (contact.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.trim())) return 'That does not look like an email address.';
    if (note.length > NOTE_MAX) return `The note is limited to ${NOTE_MAX} characters.`;
    return null;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }
    setError(null);
    setState('sending');
    const body = new URLSearchParams({
      'form-name': 'open-reading', item_id: itemId, collection, letter,
      reading: letter === 'C' ? reading.trim() : '', note: note.trim(),
      name: anonymous ? '' : name.trim(), credentials: credentials.trim(),
      contact: noContact ? '' : contact.trim(), no_contact: noContact ? 'on' : '',
      publish_choice: publish, anonymous: anonymous ? 'on' : '', credentials_public: credPublic ? 'on' : '', ack_consent: ack ? 'on' : '',
      page: typeof window !== 'undefined' ? window.location.pathname : '',
      'bot-field': (e.currentTarget.elements.namedItem('bot-field') as HTMLInputElement | null)?.value ?? '',
    });
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setState('sent');
    } catch { setState('failed'); }
  }

  if (state === 'sent') {
    return (
      <div className="bg-well border border-rule border-l-4 border-l-accent rounded-md px-5 py-4 text-sm leading-relaxed">
        <strong>Received.</strong> Your answer is with the author for review. Nothing appears on this page until it has been read; answers marked for the author only stay private. Thank you for reading closely.
      </div>
    );
  }

  const choice = (value: Letter, title: string, body: React.ReactNode) => (
    <label key={value} className={`flex gap-3 items-start rounded-md border p-3 cursor-pointer transition-colors ${letter === value ? 'border-accent bg-accent/10' : 'border-rule bg-card hover:bg-well'}`}>
      <input type="radio" name="letter_ui" value={value} checked={letter === value} onChange={() => setLetter(value)} className="mt-1.5 accent-[#b08d57]" />
      <span className="grid gap-0.5">
        <span className="text-sm text-ink" style={{ fontWeight: 600 }}><span className="font-serif text-accent-ink mr-2 text-[1.1rem]">{value}</span>{title}</span>
        <span className="text-sm text-ink/80">{body}</span>
      </span>
    </label>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-6" noValidate>
      <div className="hidden" aria-hidden="true"><label>Leave this field empty <input type="text" name="bot-field" tabIndex={-1} autoComplete="off" /></label></div>
      {resolved && <p className="text-sm text-muted m-0">This reading has been resolved. Answers are still welcome and go to the author.</p>}

      <fieldset className="grid gap-2 border-0 p-0 m-0">
        <legend className="text-sm text-ink mb-2" style={{ fontWeight: 600 }}>Your answer</legend>
        {choice('A', 'Our reading is right', <span className="font-serif text-base">{renderBidi(ourReading)}</span>)}
        {choice('B', 'The comparison reading is right', <span className="font-serif text-base">{renderBidi(comparisonReading)}</span>)}
        {choice('C', 'I read it differently', 'Give your reading below.')}
        {choice('D', 'The image cannot decide it', 'A higher resolution or the original is needed.')}
      </fieldset>

      {letter === 'C' && (
        <div>
          <label htmlFor="or-reading" className={label}>Your reading</label>
          <input id="or-reading" value={reading} onChange={(e) => setReading(e.target.value)} dir={rtl ? 'rtl' : 'ltr'} lang={rtl ? language : undefined}
            style={rtl ? { fontFamily: HEBREW_FACE, fontSize: '1.25rem' } : undefined} className={input} placeholder={rtl ? 'הקריאה שלך' : 'Your reading'} />
        </div>
      )}

      <div>
        <label htmlFor="or-note" className={label}>Note <span className="text-muted">(optional, {NOTE_MAX} characters)</span></label>
        <textarea id="or-note" value={note} onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))} rows={4} className={`${input} h-auto py-2`} placeholder="What the letter forms, the ink, or a parallel elsewhere in the manuscript tell you." />
        <div className="text-xs text-muted mt-1 text-right">{note.length}/{NOTE_MAX}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="or-name" className={label}>Name</label>
          <input id="or-name" value={name} onChange={(e) => setName(e.target.value)} disabled={anonymous} className={input} placeholder={anonymous ? 'Published as "anonymous reader"' : 'As you would like to be credited'} />
        </div>
        <div>
          <label htmlFor="or-cred" className={label}>Credentials</label>
          <input id="or-cred" value={credentials} onChange={(e) => setCredentials(e.target.value)} className={input} placeholder="Degree, position, institution" />
        </div>
      </div>

      <div>
        <label htmlFor="or-contact" className={label}>Email <span className="text-muted">(never published; for questions and acknowledgement)</span></label>
        <input id="or-contact" type="email" value={contact} onChange={(e) => setContact(e.target.value)} disabled={noContact} className={input} placeholder="you@example.org" />
        <label className="flex items-center gap-2 mt-2 text-sm text-ink/85"><input type="checkbox" checked={noContact} onChange={(e) => setNoContact(e.target.checked)} className="accent-[#b08d57]" /> I would rather not be contacted.</label>
      </div>

      <fieldset className="grid gap-2 border-0 p-0 m-0">
        <legend className="text-sm text-ink mb-2" style={{ fontWeight: 600 }}>Where your answer goes</legend>
        <label className="flex items-center gap-2 text-sm text-ink/85"><input type="radio" name="publish_ui" checked={publish === 'publish'} onChange={() => setPublish('publish')} className="accent-[#b08d57]" /> Publish it on this page, after the author has read it.</label>
        <label className="flex items-center gap-2 text-sm text-ink/85"><input type="radio" name="publish_ui" checked={publish === 'author_only'} onChange={() => setPublish('author_only')} className="accent-[#b08d57]" /> Send it to the author only.</label>
      </fieldset>

      <div className="grid gap-2 text-sm text-ink/85">
        <label className="flex items-center gap-2"><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="accent-[#b08d57]" /> Publish me as &ldquo;anonymous reader&rdquo;.</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={credPublic} onChange={(e) => setCredPublic(e.target.checked)} className="accent-[#b08d57]" /> My credentials may be shown in summary with my answer.</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="accent-[#b08d57]" /> I may be named in the acknowledgements.</label>
      </div>

      {error && <p className="text-sm text-red-800 m-0" role="alert">{error}</p>}
      {state === 'failed' && (
        <p className="text-sm text-red-800 m-0" role="alert">The answer could not be sent. Try again, or email it to <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a> quoting the item id <code className="font-mono">{itemId}</code>.</p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={state === 'sending'} className="inline-flex items-center h-10 px-4 rounded-md bg-ink text-on-ink text-sm hover:bg-ink-2 disabled:opacity-50" style={{ fontWeight: 600 }}>
          {state === 'sending' ? 'Sending…' : 'Send answer'}
        </button>
        <span className="text-xs text-muted">Your email stays with the author. See the Privacy Policy.</span>
      </div>
    </form>
  );
}
