/**
 * 随机字符串
 */
function randomStr() {
  let str;
  str = (0xffffff * Math.random()).toString(16).replace(/\./g, '');
  return str;
}

/**
 * 随机字符串组成的id
 */
function getSysId() {
  return `${randomStr()}-${randomStr()}`;
}

async function execute(list = [], ...params) {
  let data = {
    params
  };

  for (let item of list) {
    if (typeof item !== 'function') {
      return Promise.reject({
        isError: true,
        message: 'Type is error',
        detail: `The element in the exec list be expected function, but not ${typeof item}`
      });
    }

    data = await item.apply(null, data.params);

    if (data && data.isError) {
      return Promise.reject(data);
    }

    if (data && data.isEnd) {
      return Promise.resolve(data);
    }
  }

  return Promise.resolve(data);
}

export { getSysId, execute };
