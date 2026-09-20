const FINCORE_PWA_VERSION = '2.0.1';
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
      navigator.serviceWorker.register('./sw.js?v=2.0.1',{updateViaCache:'none'}).catch(err => {
        console.warn('FinCore: no se pudo registrar el modo offline.', err);
      });
    });
  }

  // Sigue funcionando desde file:// como la versión de PC, pero la instalación PWA
  // y el modo offline requieren HTTPS (o localhost) por seguridad del navegador.
  if (isStandalone()) setInstallVisible(false);
})();


// Migrate stale PWA caches once when this version first loads.
(async()=>{
  try{
    const key='fincore-pwa-version';
    const prev=localStorage.getItem(key);
    if(prev!==FINCORE_PWA_VERSION){
      if('caches' in window){
        const keys=await caches.keys();
        await Promise.all(keys.filter(k=>k.startsWith('fincore-')).map(k=>caches.delete(k)));
      }
      localStorage.setItem(key,FINCORE_PWA_VERSION);
      if('serviceWorker' in navigator){
        const reg=await navigator.serviceWorker.getRegistration();
        if(reg) await reg.update();
      }
    }
  }catch(e){}
})();
