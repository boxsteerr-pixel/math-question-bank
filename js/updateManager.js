const retryMessage = '暂时无法完成更新，仍可继续使用当前版本。可以稍后重试。';
const messageTimeout = 5000;

function askWorker(worker, type) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => finish(reject, Error('Service Worker 未响应')), messageTimeout);
    function finish(complete, value) {
      clearTimeout(timeout);
      channel.port1.close();
      complete(value);
    }
    channel.port1.onmessage = ({ data }) => finish(resolve, data);
    channel.port1.onmessageerror = error => finish(reject, error);
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch (error) {
      finish(reject, error);
    }
  });
}

export function initPwaUpdates({ getBlockReason = () => '' } = {}) {
  const workers = globalThis.navigator?.serviceWorker;
  if (!workers) return () => {};

  const firstController = workers.controller;
  let registration;
  let candidate;
  let approval;
  let pendingReload;
  let activationTimeout;
  let notice = '';
  let banner;
  let reloading = false;
  let unlockPage;

  function refresh() {
    const update = pendingReload || candidate;
    if (!update && !approval) {
      banner?.remove();
      banner = undefined;
      return;
    }
    if (!banner) {
      banner = document.createElement('section');
      banner.id = 'app-update';
      banner.className = 'update-banner';
      banner.setAttribute('aria-live', 'polite');
      const label = document.createElement('span');
      const button = document.createElement('button');
      button.type = 'button';
      button.onclick = apply;
      banner.append(label, button);
      document.body.append(banner);
    }
    const reason = getBlockReason();
    const version = update?.version ? ' v' + update.version : '';
    banner.firstElementChild.textContent = ['发现新版本' + version, reason, notice].filter(Boolean).join('。');
    const button = banner.lastElementChild;
    button.disabled = Boolean(approval || reason || reloading);
    button.textContent = approval ? '正在更新…' : '立即更新';
    banner.dataset.state = approval ? 'applying' : reason ? 'waiting' : 'ready';
  }

  function finishApproval(message = '') {
    clearTimeout(activationTimeout);
    approval = undefined;
    unlockPage?.();
    unlockPage = undefined;
    notice = message;
    refresh();
  }

  function reloadWhenSafe() {
    if (reloading || getBlockReason()) return false;
    reloading = true;
    location.reload();
    return true;
  }

  async function apply() {
    if ((!candidate && !pendingReload) || approval || reloading || getBlockReason()) return;
    if (pendingReload) {
      reloadWhenSafe();
      return;
    }
    const { worker } = candidate;
    if (registration?.waiting !== worker) {
      showWaiting();
      return;
    }
    const request = {};
    approval = { worker, request };
    notice = '';
    // Prevent a new action from starting while the worker authorizes this page.
    const page = document.querySelector('main');
    if (page) {
      const wasInert = page.inert;
      page.inert = true;
      unlockPage = () => { page.inert = wasInert; };
    }
    refresh();
    try {
      const reply = await askWorker(worker, 'APPLY_SAFE_UPDATE');
      if (approval?.request !== request || reloading) return;
      if (reply?.status === 'blocked' || reply?.status === 'waiting') {
        finishApproval('请保存所有页面的练习，关闭所有数学打卡页面后重新打开');
      } else if (reply?.status === 'activating') {
        activationTimeout = setTimeout(() => finishApproval(retryMessage), messageTimeout);
      } else {
        finishApproval(retryMessage);
      }
    } catch {
      if (approval?.request === request && !reloading) finishApproval(retryMessage);
    }
  }

  async function showVersion(update) {
    try {
      const release = await askWorker(update.worker, 'GET_RELEASE');
      if (typeof release?.appVersion === 'string') {
        update.version = release.appVersion;
        refresh();
      }
    } catch {
      // The queue may have been superseded. The update button remains retryable.
    }
  }

  function showWaiting() {
    const worker = workers.controller && registration?.waiting;
    if (candidate?.worker === worker || (!candidate && !worker)) return;
    candidate = worker ? { worker } : undefined;
    refresh();
    if (candidate) showVersion(candidate);
  }

  function watchInstalling() {
    registration.installing?.addEventListener('statechange', showWaiting);
    showWaiting();
  }

  workers.addEventListener('controllerchange', () => {
    const worker = workers.controller;
    if (!worker || !firstController || worker === firstController) return;
    pendingReload = { worker, version: candidate?.worker === worker ? candidate.version : '' };
    if (approval?.worker === worker && reloadWhenSafe()) {
      clearTimeout(activationTimeout);
      return;
    }
    finishApproval();
    showVersion(pendingReload);
  });

  function attach(found) {
    if (!found) return;
    registration = found;
    registration.addEventListener('updatefound', watchInstalling);
    watchInstalling();
    globalThis.addEventListener('online', () => {
      registration.update().catch(error => console.warn('离线更新检查失败，继续使用当前版本。', error));
    });
  }

  workers.register('./service-worker.js', { updateViaCache: 'none' }).then(attach).catch(async error => {
    console.warn('离线更新检查失败，继续使用当前版本。', error);
    try {
      attach(await workers.getRegistration());
    } catch {
      // There is no usable registration yet.
    }
  });

  return refresh;
}
