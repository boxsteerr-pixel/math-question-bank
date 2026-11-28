const retryMessage = '暂时无法完成更新，仍可继续使用当前版本。可以稍后重试。';
const messageTimeout = 5000;

// Show success only when a previous installed shell is actually present.
export async function showUpdateSuccess(){
  try{
    const version=globalThis.MATH_PWA_VERSION?.appVersion,key='grade7-math-update-notice-'+version;
    if(!version||localStorage.getItem(key)||!navigator.serviceWorker?.controller||document.querySelector('#app-update-success'))return;
    const cachesPresent=await caches.keys();
    if(!cachesPresent.includes('grade7-math-v37')||!cachesPresent.includes(globalThis.MATH_PWA_VERSION.cacheVersion))return;
    const prior=await caches.open('grade7-math-v37');
    if(!await prior.match(new URL('./index.html',location.href).href))return;
    const release=await askWorker(navigator.serviceWorker.controller,'GET_RELEASE');
    if(release?.appVersion!==version)return;
    const section=document.createElement('section');section.id='app-update-success';section.className='update-banner';section.setAttribute('role','status');
    section.innerHTML=`<span>更新成功 · 当前版本 v${version}。学习数据读取正常。新增题库覆盖统计与未刷题目查询，优化每日练习和更新反馈。</span><button type="button">知道了</button>`;
    section.querySelector('button').onclick=()=>{localStorage.setItem(key,'dismissed');section.remove()};document.body.append(section);
  }catch(error){console.warn('更新提示暂不可用',error)}
}

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
  let checking = Boolean(firstController);
  let preparing = false;

  function refresh() {
    const update = pendingReload || candidate;
    if (!update && !approval && !checking && !preparing && !notice) {
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
    const headline = pendingReload ? '新版已接管，准备重新载入' : candidate ? '发现新版本' + version + '，新版资源已准备完成' : preparing ? '正在准备新版资源' : checking ? '正在检查更新' : '';
    banner.firstElementChild.textContent = [headline, reason, notice].filter(Boolean).join('。');
    const button = banner.lastElementChild;
    button.disabled = Boolean(approval || reason || reloading || checking || preparing);
    button.textContent = approval ? '正在更新…' : !update ? '重试' : '立即更新';
    banner.dataset.state = approval ? 'applying' : reason ? 'waiting' : preparing ? 'preparing' : checking ? 'checking' : !update ? 'retry' : 'ready';
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
    notice = '正在重新载入';
    refresh();
    location.reload();
    return true;
  }

  async function apply() {
    if (!candidate && !pendingReload && registration && !approval && !getBlockReason()) {
      notice='';checking=true;refresh();
      try { await registration.update(); } catch { notice=retryMessage; }
      checking=false;refresh();return;
    }
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
    const worker=registration.installing;
    preparing=Boolean(firstController && worker && !['installed','activated','redundant'].includes(worker.state));
    worker?.addEventListener('statechange',()=>{
      preparing=Boolean(firstController && !['installed','activated','redundant'].includes(worker.state));
      if(worker.state==='redundant'&&!registration.waiting)notice=retryMessage;
      refresh();showWaiting();
    });
    refresh();
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

  refresh();
  workers.register('./service-worker.js', { updateViaCache: 'none' }).then(found=>{checking=false;attach(found);refresh()}).catch(async error => {
    console.warn('离线更新检查失败，继续使用当前版本。', error);
    checking=false;notice=retryMessage;refresh();
    try {
      attach(await workers.getRegistration());
    } catch {
      // There is no usable registration yet.
    }
  });

  return refresh;
}
