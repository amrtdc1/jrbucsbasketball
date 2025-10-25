// js/router.js
import {
  renderHome,
  renderPractice,
  renderDrills,
  renderMentorship,
  renderRoster,
  renderAbout,
} from './ui.js';

const routes = {
  '#/': renderHome,
  '#/practice': renderPractice,
  '#/drills': renderDrills,
  '#/mentorship': renderMentorship,
  '#/roster': renderRoster,
  '#/about': renderAbout,
};

export function initRouter() {
  const app = document.getElementById('app');

  // 1) Stop the browser from restoring previous scroll on hash navigation
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  const setActive = () => {
    document.querySelectorAll('[data-route]').forEach((a) => {
      const href = a.getAttribute('href');
      const isActive =
        (location.hash === '' && href === '#/') || href === location.hash;
      a.classList.toggle('active', isActive);
    });
  };

  async function render() {
    const hash = location.hash || '#/';
    const view = routes[hash] || routes['#/'];

    // Render the view
    app.innerHTML = await view();
    setActive();

    // 2) Focus main region for accessibility, but don't let it scroll the page
    try {
      app.focus({ preventScroll: true });
    } catch {
      // Older browsers: focus may scroll. We'll correct below.
      app.focus();
    }

    // 3) Ensure we're at the very top (so content isn't hidden under the sticky header)
    // Use rAF so this happens after layout/paint of the new content.
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  window.addEventListener('hashchange', render, { passive: true });
  render();
}
