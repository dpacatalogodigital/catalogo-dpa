import { settings } from './settings.mjs';

// Compatible with the existing Decap external OAuth protocol. Tokens stay in memory.
export function authenticate(win = window, config = settings) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.authEndpoint, config.authOrigin);
    url.search = new URLSearchParams({ provider: 'github', site_id: config.siteId, scope: 'public_repo' });
    let popup, timer, completed = false;
    const finish = (error, token) => {
      if (completed) return;
      completed = true;
      win.removeEventListener('message', receive);
      win.clearInterval(timer);
      popup?.close();
      error ? reject(error) : resolve(token);
    };
    const receive = event => {
      if (event.origin !== config.authOrigin || event.source !== popup || typeof event.data !== 'string') return;
      if (event.data === 'authorizing:github') popup.postMessage(event.data, config.authOrigin);
      const prefix = 'authorization:github:success:';
      if (event.data.startsWith(prefix)) {
        try {
          const result = JSON.parse(event.data.slice(prefix.length));
          if (typeof result.token !== 'string' || result.token.length < 12) throw new Error();
          finish(null, result.token);
        } catch { finish(new Error('La respuesta de inicio de sesión no es válida.')); }
      }
      if (event.data.startsWith('authorization:github:error:')) finish(new Error('No se pudo autorizar el acceso a GitHub.'));
    };
    win.addEventListener('message', receive);
    popup = win.open(url.href, 'dpa-inventory-auth', 'width=960,height=650');
    if (!popup) { finish(new Error('Permití la ventana emergente para iniciar sesión.')); return; }
    const deadline = Date.now() + 120000;
    timer = win.setInterval(() => {
      if (popup.closed || Date.now() > deadline) finish(new Error('El inicio de sesión se cerró o venció. Volvé a intentarlo.'));
    }, 500);
  });
}
