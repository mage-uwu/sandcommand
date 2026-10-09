/**
 * The installed app (PWA): full screen from the home screen, online only,
 * and always the live build.
 *
 * - **Install.** The manifest (public/manifest.webmanifest) makes the game
 *   installable, to run full screen in landscape. Where the browser offers
 *   an install prompt (Android, desktop Chrome and Edge) the menu shows an
 *   Install button; on iPhone and iPad, which have no prompt, it says how
 *   (Share, then Add to Home Screen). Neither shows once installed.
 * - **Online only.** The service worker (public/sw.js) caches nothing: every
 *   request goes to the network, and offline it says so.
 * - **Always current.** Every file is served to be revalidated on each load,
 *   and each build carries an id (published as /version.json). A running
 *   copy, which an installed app can be for days, checks it when it comes
 *   back to the foreground and every few minutes. When a newer build is live
 *   it reloads onto it at the next safe moment (on the menu, or dead and
 *   waiting), and puts you straight back in.
 */
declare const __BUILD_ID__: string;
export const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/** How often a running copy checks for a newer build (ms). */
const CHECK_EVERY = 3 * 60 * 1000;
/** sessionStorage flag: rejoin straight away after reloading onto a new build. */
const REJOIN_KEY = 'sc.rejoin';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

/** Running as the installed app (home screen, full screen)? */
export function installed(): boolean {
  return matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !isSecureContext) return;
  // (updateViaCache none: the browser fetches sw.js itself fresh every time it checks.)
  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(
    (reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void reg.update().catch(() => {});
      });
    },
    () => {},
  );
}

/** The menu's Install button (where the browser can prompt) or how-to (iOS). */
export function setupInstall(box: HTMLElement, button: HTMLButtonElement, hint: HTMLElement): void {
  if (installed()) return;
  let deferred: InstallPrompt | null = null;
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    button.classList.remove('hidden');
    hint.textContent = 'full screen, from your home screen';
    box.classList.remove('hidden');
  });
  button.addEventListener('click', async () => {
    if (!deferred) return;
    const p = deferred;
    deferred = null;
    await p.prompt();
    await p.userChoice.catch(() => null);
    box.classList.add('hidden');
  });
  addEventListener('appinstalled', () => box.classList.add('hidden'));
  // iPhone / iPad: no prompt; Safari's Share menu does it.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) {
    button.classList.add('hidden');
    hint.textContent = 'Play full screen: tap Share, then "Add to Home Screen".';
    box.classList.remove('hidden');
  }
}

/**
 * Watch for a newer build going live; reload onto it as soon as `safe()`
 * says it won't interrupt a fight. `rejoin` says whether to put the player
 * straight back in after the reload.
 */
export function watchForUpdates(safe: () => boolean, rejoin: () => boolean): void {
  if (BUILD_ID === 'dev') return;
  let newer = false;
  const check = async () => {
    if (newer || !navigator.onLine) return;
    try {
      const r = await fetch('/version.json', { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json()) as { build?: string };
      if (v.build && v.build !== BUILD_ID) newer = true;
    } catch {
      // (Offline or the server's busy: try again later.)
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  setInterval(check, CHECK_EVERY);
  setInterval(() => {
    if (!newer || !safe()) return;
    try {
      if (rejoin()) sessionStorage.setItem(REJOIN_KEY, '1');
    } catch {
      // (No storage: they'll press Deploy themselves.)
    }
    location.reload();
  }, 1000);
}

/** Just reloaded onto a new build mid-session: should we rejoin straight away? (Clears the flag.) */
export function takeRejoin(): boolean {
  try {
    const v = sessionStorage.getItem(REJOIN_KEY) === '1';
    sessionStorage.removeItem(REJOIN_KEY);
    return v;
  } catch {
    return false;
  }
}
