// CDN 图片基础路径
const IMAGE_BASE_PATH = 'http://tiyycecb8.hn-bkt.clouddn.com/images/imgs/';

function img(name) {
  return `${IMAGE_BASE_PATH}${name}`;
}

const categories = [
  { id: 'welfare',     name: '惠民专区',     icon: '', productCount: 15, sortOrder: 1 },
  { id: 'tea',         name: '爆款茶饮',     icon: '', productCount: 8,  sortOrder: 2 },
  { id: 'activity',    name: '活动专区',     icon: '', productCount: 12, sortOrder: 3 },
  { id: 'herbs',       name: '中药材',       icon: '', productCount: 25, sortOrder: 4 },
  { id: 'health',      name: '保健品',       icon: '', productCount: 18, sortOrder: 5 },
  { id: 'supplements', name: '营养补充',     icon: '', productCount: 10, sortOrder: 6 },
];

module.exports = { categories };