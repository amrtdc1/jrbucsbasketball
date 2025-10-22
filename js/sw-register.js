export function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    const snackbar = document.getElementById('snackbar');
    const show = (msg) => { snackbar.textContent = msg; snackbar.hidden = false; setTimeout(() => snackbar.hidden = true, 4000); };


    navigator.serviceWorker.register('/sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    show('Update ready — tap to refresh');
                    snackbar.addEventListener('click', () => location.reload());
                }
            });
        });
    }).catch(() => { });
}