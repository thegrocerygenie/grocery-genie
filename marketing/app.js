(() => {
  'use strict';

  // ---------------- Waitlist forms ----------------
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const SUCCESS_BUTTON_LABEL = "✓ You're in";
  const SUCCESS_PLACEHOLDER = 'See you at launch.';
  const SUCCESS_NOTE = "Welcome aboard. We'll only email when there's something to ship.";

  function setMessage(form, tone, text) {
    const msg = form.querySelector('.form-message');
    if (!msg) return;
    msg.textContent = text || '';
    if (tone) msg.setAttribute('data-tone', tone);
    else msg.removeAttribute('data-tone');
  }

  async function handleWaitlist(form, event) {
    event.preventDefault();
    if (form.dataset.state === 'loading' || form.dataset.state === 'success') return;

    const input = form.querySelector('input[type="email"]');
    const button = form.querySelector('button[type="submit"]');
    if (!input || !button) return;

    const email = String(input.value || '').trim();
    if (!EMAIL_RE.test(email)) {
      form.dataset.state = 'error';
      setMessage(form, 'error', 'Please enter a valid email address.');
      input.focus();
      return;
    }

    const originalLabel = button.textContent;
    form.dataset.state = 'loading';
    button.disabled = true;
    button.textContent = 'Joining…';
    setMessage(form, null, '');

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          email,
          source: form.dataset.form || 'unknown',
          path: location.pathname,
          referrer: document.referrer || null,
        }),
      });

      let payload = null;
      try { payload = await response.json(); } catch { /* tolerate empty bodies */ }

      if (!response.ok) {
        const message = (payload && payload.error) ||
          (response.status === 429 ? 'Too many attempts. Try again in a minute.' : 'Something went wrong. Please try again.');
        throw new Error(message);
      }

      form.dataset.state = 'success';
      button.textContent = SUCCESS_BUTTON_LABEL;
      input.value = '';
      input.placeholder = SUCCESS_PLACEHOLDER;
      input.blur();
      setMessage(form, 'success', SUCCESS_NOTE);

      // Analytics-friendly hook (no PII): products like Plausible/PostHog/GA listen for events.
      window.dispatchEvent(new CustomEvent('waitlist:join', {
        detail: { source: form.dataset.form || 'unknown', already: !!(payload && payload.already) },
      }));
      if (typeof window.plausible === 'function') {
        window.plausible('Waitlist Join', { props: { source: form.dataset.form || 'unknown' } });
      }
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'waitlist_join', { source: form.dataset.form || 'unknown' });
      }
    } catch (err) {
      form.dataset.state = 'error';
      button.disabled = false;
      button.textContent = originalLabel;
      setMessage(form, 'error', err.message || 'Network error. Please try again.');
    }
  }

  function bindForms() {
    document.querySelectorAll('form.waitlist').forEach((form) => {
      if (form.__bound) return;
      form.__bound = true;
      form.addEventListener('submit', (e) => handleWaitlist(form, e));
    });
  }

  // ---------------- Smooth-scroll for in-page anchors ----------------
  function bindAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (!id || id === '#') return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Move focus to the target for a11y, but only if it can hold focus.
        if (target.hasAttribute('tabindex') === false) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        history.replaceState(null, '', id);
      });
    });
  }

  // ---------------- Init ----------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { bindForms(); bindAnchors(); });
  } else {
    bindForms();
    bindAnchors();
  }
})();
