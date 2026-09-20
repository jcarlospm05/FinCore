(() => {
  let deferredPrompt = null;
  const installButtons = [
    document.getElementById('installPwaBtn'),
    document.getElementById('installPwaTopBtn')
  ].filter(Boolean);

  const setInstallVisible = visible => {
    installButtons.forEach(btn => btn.classList.toggle('hidden', !visible));
  };

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    if (!isStandalone()) setInstallVisible(true);
  });

  installButtons.forEach(btn => btn.addEventListener('click', async () => {
    if (!deferredPrompt) {
      alert('Para instalar FinCore, abre el menú del navegador y elige “Instalar aplicación” o “Agregar a pantalla principal”.');
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    setInstallVisible(false);
  }));

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstallVisible(false);
  });

  if ('serviceWorker' in navigator && ['http:', 'https:'].includes(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('FinCore: no se pudo registrar el modo offline.', err);
      });
    });
  }

  // Sigue funcionando desde file:// como la versión de PC, pero la instalación PWA
  // y el modo offline requieren HTTPS (o localhost) por seguridad del navegador.
  if (isStandalone()) setInstallVisible(false);
})();
