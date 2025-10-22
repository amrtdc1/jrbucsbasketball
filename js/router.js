import { renderHome, renderPractice, renderDrills, renderMentorship, renderRoster, renderAbout } from './ui.js';


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
    const setActive = () => {
        document.querySelectorAll('[data-route]').forEach(a => {
            a.classList.toggle('active', a.getAttribute('href') === location.hash || (location.hash === '' && a.getAttribute('href') === "#/"));
        });
    };
    const render = async () => {
        const hash = location.hash || '#/';
        const view = routes[hash] || routes['#/'];
        app.innerHTML = await view();
        setActive();
        app.focus();
    };
    window.addEventListener('hashchange', render);
    render();
}