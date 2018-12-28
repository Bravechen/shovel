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
  let len = workingList.length;
  if (len >= config.per) {
    waitingList[waitingList.length] = id;
    return;
  }

  workingList[workingList.length] = id;

  if (!working) {
    setupImgsLoad();
  }
}

function use(opt = {}) {
  config = Object.assign({}, config, {
    per: Number.isInteger(opt.per) && opt.per > 0 ? opt.per : config.per,
    gap: Number.isInteger(opt.gap) && opt.gap >= 0 ? opt.gap : config.gap,
    debug: !!opt.debug
  });
}

//========================================================================
/**
 * @private
 *
 * 启动图片加载
 */
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

/**
 * 检查并启动等待中的图片加载
 */
function checkWaiters() {
  let len = waitingList.length;

  if (len === 0) {
    return;
  }

  if (len < config.per) {
    workingList = waitingList.slice(0);
    waitingList = [];
    setupImgsLoad();
    return;
  }

  workingList = waitingList.slice(0, config.per);
  waitingList = waitingList.slice(config.per);
  setupImgsLoad();
}
/**
 * 加载图片
 * @param {*} list
 */
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
/**
 * 为图片数据添加属性和方法
 * @param {*} id
 */
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
/**
 * 移除图片数据中的属性和方法
 * @param {*} imgData
 */
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
//====================================================
export default {
  add,
  use,
  get inited() {
    return initialized;
  }
};
