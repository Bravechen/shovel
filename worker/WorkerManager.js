/**
 * 线程管理对象
 * @author Brave Chan on 2018.12
 * @version 0.1.0
 */
//====================================================
import {
  getSysId
} from '../utils/util';
//====================================================
/**
 * 空闲的调度者集合
 *
 * ```js
 * schedulers {
 *  [path]: [scheduler.id, ...]
 * }
 * ```
 */
let schedulers = {};

/**
 * 注册的worker脚本地址集合
 *
 * registers{
 *  [workerKey]: workerScriptPath
 * }
 */
let registers = {};

/**
 * scheduler集合
 * workers{
 *  [scheduler.id]: scheduler
 * }
 */
let workers = {};

/**
 * 工作中的调度者数组
 *
 * ```js
 * workingList[scheduler.id, ...]
 * ```
 */
let workingList = [];

/**
 * 等待分配空闲worker的数据队列
 */
let waitingList = [];
//======================================================================
/**
 * 初始化完成标识
 */
let initialized = false;

// let WM = {
//   initialize
// };

/**
 * @private
 * @description 空闲的调度者集合
 *
 * ```typescript
 * idleWorkerMap:Map<string, Array<string>>
 * ```
 * 
 * ```js
 * idleWorkerMap {
 *  [worker path]: [scheduler.id, ...]
 * }
 * ```
 */
let idleWorkerMap = {};


let debug = false;

let clearCount = 120000; //默认2分钟清理一次
let maxWorkers = 2; // 默认最大2个线程
let wmTimer = null;
//====================================================
const s_methods = {
  add() {

  },
  remove() {

  }
};

function isObj(obj) {
  return obj !== null && typeof obj === 'object';
}

//====================================================
function WM(alias) {
  if (!initialized) {
    init();
  }

  if (typeof alias === 'string') {

  }

  if (isObj(alias)) {

  }

}

/**
 * @public
 * 配置WorkerManager
 * @param {Object} config [optional] 配置
 *
 * ```typescript
 * interface IConfig {
 *   workers: Map<string, string>;
 *   debug: boolean;
 *   clearCount: number;
 *   maxWorkers: number;
 * }
 * ```
 *  解释及例子
 * ```js
 * 
 * config {
 *  // worker 别名集合，注册以后，可以是使用`WM(worker alias).message()`使用worker
 *  workers: {
 *    // [别名]: worker文件地址
 *    [worker name]: workerPath
 *    // ...
 *  },
 *  // debug模式，会有相应运行输出，默认关闭
 *  debug: false, 
 *  // 清理空闲worker的时间间隔，单位毫秒，默认2分钟（120000ms）
 *  clearCount: 120000,
 *  // 同时允许使用的最大worker数量，默认2个
 *  maxWorkers: 2 
 * }
 *
 * ```
 */
WM.config = function (config = {}) {
  return [
    registerAlias,
    setClearTime,
    setMaxWorkers,
    setDebug
  ].refuce(function (prev, item) {
    item(prev);
    return prev;
  }, config);
};

WM.message = function () {

};

/**
 * @public
 * @description 销毁及释放不可再用
 */
WM.destroy = function () {
  schedulers = null;
  registers = null;
  workers = null;
  workingList = null;
  waitingList = null;
  clearCount = null;
  maxWorkers = null;
  if (wmTimer) {
    clearTimeout(wmTimer);
    wmTimer = null;
  }
  WM = null;
};

//====================================================
// 注册worker文件别名
function registerAlias(config) {
  let entries = Object.entries(config.workers || {});
  for (let [key, value] of entries) {
    if (!value) {
      continue;
    }
    // 注册worker别名
    registers[key] = value;
    // 建立worker调度者对象池
    schedulers[value] = [];
  }
}
// 设置清理空闲worker间隔
function setClearTime(config) {
  clearCount = Number.isInteger(config.clearCount) || clearCount;
}
// 设置最大同时运行的worker数量
function setMaxWorkers(config) {
  maxWorkers = Number.isInteger(config.maxWorkers) || maxWorkers;
}
// debug 模式
function setDebug(config) {
  debug = !!config.debug;
}
// 初始化
function init() {
  if (initialized) {
    return;
  }
  registers = {};
  Object.defineProperties(WM, {
    workers: {
      get() {
        return Object.entries(registers);
      },
      configurable: false,
      enumerable: false
    },
    clearCount: {
      get() {
        return clearCount;
      },
      configurable: false,
      enumerable: false
    },
    maxWorkers: {
      get() {
        return maxWorkers;
      },
      configurable: false,
      enumerable: false
    },
    debug: {
      get() {
        return debug;
      },
      configurable: false,
      enumerable: false
    }
  });

  initialized = true;
}
//====================================================
/**
 * worker调度者
 */
class Scheduler {
  /**
   * Scheduler构造函数
   * @param {String} path [required] worker文件地址
   */
  constructor(path) {
    this.id = getSysId();
    // 加入调度者集合
    workers[this.id] = this;
    this.init(path);
  }

  /**
   * @internal
   * 初始化
   * @param {String} path [required] 线程路径
   */
  init(path) {
    this.path = path;
    this.using = false;
    this.worker = new Worker(this.path);
  }

  /**
   * @internal
   * 发送信息
   * @param {Object} data [required] 发往线程的数据
   * @param {Function} cb [required] 结果回调
   */
  message(data = {}, cb) {
    if (typeof cb !== 'function') {
      console.error(`In WorkerManager Scheduler.message(), need a callback that named "cb"`);
      return;
    }

    if (this.using) {
      console.warn(`In WorkerManager Scheduler.message(), the worker is still working, please wait.`);
      return;
    }

    let successHandler = success.bind(this);
    let failedHandler = error.bind(this);

    this.using = true;

    add.call(this);
    // 成功
    function success(e) {
      cb.apply(null, [null, e.data]);

      remove.call(this);

      this.toIdle();
    }
    // 失败
    function error(err) {
      cb.apply(null, [err, null]);

      remove.call(this);

      this.toIdle();
    }
    // 添加事件
    function add() {
      this.worker.addEventListener('message', successHandler);
      this.worker.addEventListener('error', failedHandler);
    }
    // 移除事件，并将自己移入空闲
    function remove() {
      this.worker.removeEventListener('message', successHandler);
      this.worker.removeEventListener('error', failedHandler);
    }

    // send message to worker
    this.worker.postMessage(data);
  }

  /**
   * @private
   * 将自己移入空闲队列
   */
  toIdle() {
    this.using = false;
    backIntoIdle(this.id);
  }

  /**
   * @internal
   * 销毁
   */
  destroy() {
    if (debug) {
      console.warn(
        'The scheduler will destroy and the worker will be terminated',
        this.id
      );
    }

    this.worker.terminate();
    this.handler = null;
    this.errorHandler = null;
    this.path = null;
    this.worker = null;
    workers[this.id] = null;
  }
}

/**
 * @private
 * 返回空闲队列
 * @param {String} schedulerId [required] 调度者id
 */
function backIntoIdle(schedulerId = '') {
  if (!schedulerId || !workers[schedulerId]) {
    return;
  }
  let scheduler = workers[schedulerId];
  // 从工作队列中移除调度者
  workingList.splice(workingList.indexOf(schedulerId), 1);

  // 加入相同类型调度者的等待队列
  let list = schedulers[scheduler.path];
  list.push(schedulerId);

  if (debug) {
    console.warn(
      `The scheduler: ${schedulerId} finished task, now back idle list.`,
      scheduler.path
    );
  }

  // 检查并启动等待中的消息数据
  setupWaitingMsg(waitingList);
}

/**
 * @private
 * 清理空闲的worker
 */
function clearIdle() {
  let paths = Object.keys(schedulers);

  for (let value of paths) {
    let list = schedulers[value];
    if (!value || value.length === 0) {
      continue;
    }
    let count = 0;
    let len = list.length;
    for (let i = 0; i < len; i++) {
      let scheduler = workers[list[i]];
      if (!scheduler) {
        count++;
        continue;
      }

      if (scheduler && !scheduler.using) {
        scheduler.destroy();
        list[i] = null;
        count++;
      }
    }

    if (count === list.length) {
      schedulers[value] = [];
    }
  }
}

/**
 * @private
 * 按照指定的id获取一个调度者
 * @param {String} workerPath [required] worker地址
 *
 * @return { Scheduler }
 */
function getScheduler(workerPath) {
  let list = schedulers[workerPath];
  let scheduler;
  // 没有空闲的调度者，那么创建一个新的
  if (!list || list.length <= 0) {
    scheduler = new Scheduler(workerPath);
    if (debug) {
      console.warn(
        'Because schedulers[workerPath] is empty',
        'We created a new worker=======>>>',
        scheduler.id,
        workerPath
      );
    }

    return scheduler;
  }
  let id = list.pop();
  scheduler = workers[id];
  if (!scheduler || scheduler.using) {
    if (debug) {
      console.warn(
        'Because scheduler is null or be used',
        'We created a new worker=======>>>',
        id,
        workers,
        scheduler && scheduler.id,
        scheduler && scheduler.using,
        workerPath
      );
    }
    scheduler = new Scheduler(workerPath);
    return scheduler;
  }
  if (debug) {
    console.warn(
      'Because schedulers[workerPath] has idle scheduler, we use it.',
      scheduler.id
    );
  }
  return scheduler;
}

/**
 * @private
 * 启动一个调度者
 * @param {Scheduler} scheduler [required] 调度者
 */
function setupScheduler(scheduler, data, cb) {
  let timer = setTimeout(
    (function (scheduler) {
      // 把自己加入到工作队列中去
      workingList[workingList.length] = scheduler.id;
      if (debug) {
        console.warn(`The scheduler: ${scheduler.id} into the working list.`);
      }
      return function () {
        clearTimeout(timer);
        if (debug) {
          console.warn('will setup worker=======>>>', scheduler.id, data.type);
        }
        scheduler.message(data, cb);
      };
    })(scheduler),
    16
  );
}

/**
 * @private
 * 检查传入WM.message()的参数合法性
 * @param {Boolean} initialized [required] 初始化标识
 * @param {String} workerPath [required] worker文件地址
 * @param {Function} cb [required] worker回调函数
 */
function checkMsgParams(initialized, workerPath, cb) {
  if (!initialized || !workerPath || typeof cb !== 'function') {
    console.error(
      'In WM message(), can not invoke message()===>',
      `initialized:${initialized}`,
      `workerPath:${workerPath}`,
      `typeof cb !== 'function':${typeof cb !== 'function'}`
    );
    cb({
        isError: true,
        message: 'In WM message(), params are error.'
      },
      null
    );
    return false;
  }

  return true;
}
/**
 * @private
 * 检查并启动空闲检查
 */
function checkIdleTimer() {
  if (!wmTimer) {
    // 2分钟之后开始workers清理
    wmTimer = setTimeout(() => {
      clearTimeout(wmTimer);
      wmTimer = null;
      clearIdle();
    }, clearCount);
  }
}

/**
 * @private
 * 检查运行中的worker是否已达最大数量
 * @param {String[]} workingList [required] 工作中队列
 * @param {Number} maxWorkers [required] 最大worker数量
 * @param {String} workerPath [required] worker地址
 * @param {Object} data [required] 要传给worker处理的数据消息
 * @param {Function} cb [required] 消息处理结果回调
 */
function checkMaxWorkers(workingList, maxWorkers, workerPath, data, cb) {
  let len = workingList.length;
  if (len >= maxWorkers) {
    waitingList[waitingList.length] = {
      path: workerPath,
      data,
      cb
    };
    if (debug) {
      console.warn(
        'Reached the max number of workers,please wait.\n',
        `maxWorkers:`,
        maxWorkers,
        '\n',
        'workingList:',
        workingList,
        '\n',
        'waitingList:',
        waitingList
      );
    }
    return false;
  }
  return true;
}

/**
 * @private
 * 检查并启动等待中的数据消息
 * @param {Object[]} waitingList [required] 等待队列
 */
function setupWaitingMsg(waitingList = []) {
  if (waitingList.length <= 0) {
    return;
  }

  let waiter = waitingList.shift();
  if (debug) {
    console.warn('Will setup a waiter message.', waiter);
  }
  // 获取调度者
  let scheduler = getScheduler(waiter.path);
  // 16毫秒后启动调度者
  setupScheduler(scheduler, waiter.data, waiter.cb);
}

//========================================================================
/**
 * @public
 * 使用一个线程，并发送数据
 * @param {String} workerId [required] 已注册的线程id
 * @param {Object} data [required] 发送的数据
 * @param {Function} cb [required] 结果回调，采用node.js风格
 */
function message(workerPath, data = {}, cb) {
  // 验证参数合法性
  if (
    !checkMsgParams(initialized, workerPath, cb) ||
    !checkMaxWorkers(workingList, maxWorkers, workerPath, data, cb)
  ) {
    return;
  }

  // 获取调度者
  let scheduler = getScheduler(workerPath);
  // 16毫秒后启动调度者
  setupScheduler(scheduler, data, cb);
  // 检查并启动空闲检查
  checkIdleTimer();
}

/**
 * @public
 * 初始化
 * @param {Object} config [optional] 配置
 *
 * ```js
 * config {
 *  workers: {
 *    [worker name]: workerPath
 *    // ...
 *  }, // worker集合
 *  debug: false, // debug模式，会有相应运行输出
 *  clearCount: 120000, // 2分钟后清理空闲worker
 *  maxWorkers: 2 // 同时允许使用的最大worker数量，默认2个
 * }
 *
 * ```
 */
// function initialize(config = {}) {
//   if (initialized) {
//     return;
//   }
//   registers = {};
//   let entries = Object.entries(config.workers || {});
//   for (let [key, value] of entries) {
//     if (!value) {
//       continue;
//     }
//     registers[key] = value;
//     schedulers[value] = [];
//   }

//   clearCount = Number.isInteger(config.clearCount) || clearCount;
//   maxWorkers = Number.isInteger(config.maxWorkers) || maxWorkers;
//   debug = !!config.debug;

//   WM.workers = registers;
//   WM.message = message;
//   WM.destroy = destroy;

//   initialized = true;
// }

/**
 * @public
 * 销毁，不可再用
 */
// function destroy() {
//   schedulers = null;
//   registers = null;
//   workers = null;
//   workingList = null;
//   waitingList = null;
//   clearCount = null;
//   maxWorkers = null;
//   if (wmTimer) {
//     clearTimeout(wmTimer);
//     wmTimer = null;
//   }
//   WM = null;
// }
//====================================================================

export default WM;