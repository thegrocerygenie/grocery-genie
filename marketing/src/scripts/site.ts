// Client behaviour for the marketing page: waitlist submit, analytics events, votes, sticky-nav rule.
// Launch state is decided at build time (PUBLIC_LAUNCH_STATE); this script reads it from <body data-state>.

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    plausible?: (event: string, opts?: { props?: Record<string, unknown> }) => void;
    __GG_HEADLINE?: string;
  }
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
const WAITLIST_ENDPOINT = import.meta.env.PUBLIC_WAITLIST_ENDPOINT || '/api/waitlist';

function safeSession<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function readUtm(): Record<string, string> {
  const qs = new URLSearchParams(location.search);
  const now: Record<string, string> = {};
  UTM_KEYS.forEach((k) => { const v = qs.get(k); if (v) now[k] = v; });
  if (Object.keys(now).length) safeSession(() => sessionStorage.setItem('gg_utm', JSON.stringify(now)), undefined);
  return safeSession(() => JSON.parse(sessionStorage.getItem('gg_utm') || '{}'), now);
}

export function initSite() {
  const state = document.body.dataset.state === 'b' ? 'b' : 'a';
  const headline = window.__GG_HEADLINE || 'a';
  const utm = readUtm();

  function track(event: string, props: Record<string, unknown> = {}) {
    const payload = { state, headline, ...utm, ...props };
    (window.dataLayer = window.dataLayer || []).push({ event, ...payload });
    window.plausible?.(event, { props: payload });
  }

  async function submitWaitlist(email: string, loc: string): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const res = await fetch(WAITLIST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: loc, headline, path: location.pathname, referrer: document.referrer || null, ...utm }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.ok) return { ok: true };
      return { ok: false, error: body?.error || 'Something went wrong. Please try again.' };
    } catch {
      return { ok: false, error: 'Could not reach our servers. Please try again.' };
    }
  }

  function showJoined() {
    const tpl = document.getElementById('joined-tpl') as HTMLTemplateElement | null;
    if (!tpl) return;
    document.querySelectorAll<HTMLElement>('.cta-slot').forEach((slot) => {
      slot.replaceChildren(tpl.content.cloneNode(true));
    });
  }

  function setError(form: HTMLFormElement, message: string | null) {
    const slot = form.closest('.cta-slot');
    if (!slot) return;
    let el = slot.querySelector<HTMLElement>('.cta-error');
    const line = slot.querySelector<HTMLElement>('.cta-line');
    if (!message) { el?.remove(); if (line) line.hidden = false; return; }
    if (!el) {
      el = document.createElement('div');
      el.className = 'cta-error';
      el.setAttribute('role', 'alert');
      form.after(el);
    }
    el.textContent = message;
    if (line) line.hidden = true;
  }

  document.querySelectorAll<HTMLFormElement>('form.waitlist').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const loc = (form.closest('.cta-slot') as HTMLElement | null)?.dataset.loc || 'unknown';
      const input = form.querySelector('input') as HTMLInputElement;
      const button = form.querySelector('button') as HTMLButtonElement;
      button.disabled = true;
      setError(form, null);
      const result = await submitWaitlist(input.value.trim(), loc);
      button.disabled = false;
      if (result.ok) {
        track('waitlist_signup', { loc });
        showJoined();
      } else {
        setError(form, result.error);
      }
    });
  });

  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    if (!target) return;
    const cta = target.closest<HTMLElement>('[data-cta]');
    if (cta && (cta.tagName === 'A' || cta.tagName === 'BUTTON')) track('cta_click', { loc: cta.dataset.cta });
    const store = target.closest<HTMLElement>('[data-appstore]');
    if (store) track('appstore_click', { loc: store.dataset.appstore });
    const vote = target.closest<HTMLButtonElement>('button.vote');
    if (vote) {
      document.querySelectorAll('button.vote').forEach((x) => x.setAttribute('aria-pressed', String(x === vote)));
      track('next_vote', { feature: vote.dataset.vote });
    }
    const summary = target.closest('details[data-track] > summary');
    if (summary) {
      const details = summary.parentElement as HTMLDetailsElement;
      // Fires before the toggle, so "not yet open" means this click opens it.
      if (!details.open) track('faq_open', { id: details.dataset.track });
    }
  });

  const nav = document.getElementById('navwrap');
  const onScroll = () => nav?.classList.toggle('scrolled', scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  track('headline_view');
}
