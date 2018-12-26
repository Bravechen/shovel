import { getSysId } from '../utils/util';

let waitingList = [];
let imgs = {};
let workingList = [];
let working = false;
let config = {
  gap: 500, // 每次加载的间隔，单位毫秒
  per: 5, // 每次并行加载多少个图片，默认5个
  debug: false // debug模式
};

let initialized = false;

/**
 * @public
 *
 * @param {*} img
 * @param {*} url
 */
function add(img, url = '', cb) {
  if (!img || !url || img.nodeType !== 1 || img.nodeName !== 'IMG') {
    return;
  }
  let id = getSysId();
  imgs[id] = { id, img, url, cb };
  if (working) {
    waitingList[waitingList.length] = id;
    return;
  }

  workingList[workingList.length] = id;

  if (workingList.length >= 5) {
    setupImgsLoad();
  }
}

function use(opt = {}) {
  config = Object.assign({}, config, {
    per: Number.isInteger(opt.per) ? opt.per : config.per,
    gap: Number.isInteger(opt.gap) ? opt.gap : config.gap,
    debug: !!opt.debug
  });
}

//========================================================================

function setupImgsLoad() {
  if (working) {
    return;
  }
  working = true;
  let timer = setTimeout(function() {
    clearTimeout(timer);
    loadImgs(workingList);
    workingList = [];
    working = false;
    checkWaiters();
  }, config.gap);
}

function checkWaiters() {
  let len = waitingList.length;

  if (len === 0) {
    return;
  }

  if (len < 5) {
    workingList = waitingList.slice(0);
    waitingList = [];
    setupImgsLoad();
    return;
  }

  workingList = waitingList.slice(0, 5);
  waitingList = waitingList.slice(5);
  setupImgsLoad();
}

function loadImgs(list = []) {
  let len = list.length;
  while (len--) {
    let item = list[len];
    if (!item) {
      continue;
    }
    let data = decorateImg(item);
    data.img.src = data.url;
  }
}

function decorateImg(id = '') {
  let item = imgs[id];
  if (!id || !item) {
    return {};
  }
  item.onload = (function(dataId) {
    return function(e) {
      let data = imgs[dataId];
      if (typeof data.cb === 'function') {
        data.cb.call(null, null, e);
      }
      washImg(data);
    };
  })(id);

  item.onerror = (function(dataId) {
    return function(err) {
      let data = imgs[dataId];
      console.error('img load failed===>>', data.url, err);
      if (typeof data.cb === 'function') {
        data.cb.call(null, err, null);
      }
      washImg(item);
    };
  })(id);

  item.img.addEventListener('load', item.onload);
  item.img.addEventListener('error', item.onerror);

  return item;
}

function washImg(imgData = {}) {
  if (!imgData.id) {
    return;
  }

  imgData.img.removeEventListener('load', imgData.onload);
  imgData.img.removeEventListener('error', imgData.onerror);
  imgData.img = null;
  imgData.url = null;
  imgData.cb = null;

  imgData.onload = null;
  imgData.onerror = null;

  imgs[imgData.id] = null;
  imgData.id = null;
  imgData = null;
}

export default {
  add,
  use,
  get inited() {
    return initialized;
  }
};
