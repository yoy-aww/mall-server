// CDN 图片基础路径（与小程序前端 image-mapping.ts 保持一致）
const IMAGE_BASE_PATH = 'http://tiyycecb8.hn-bkt.clouddn.com/images/imgs/';

function img(name) {
  return `${IMAGE_BASE_PATH}${name}`;
}

const banners = [
  {
    id: 'banner_main',
    title: '道地溯源',
    subtitle: '枸益补枸',
    image: img('tcm_herbs_banner_3.jpg'),
    audioUrl: '/audio/intro.wav',
    sortOrder: 1,
    enabled: true,
  },
  {
    id: 'banner_activity',
    title: '限时特惠',
    subtitle: '养生套装低至 5 折',
    image: img('gift_box_5.jpg'),
    sortOrder: 2,
    enabled: true,
    link: '/pages/category/category?type=activity',
  },
  {
    id: 'banner_tea',
    title: '新茶上市',
    subtitle: '春日限定，清香怡人',
    image: img('tea_background_5.jpg'),
    sortOrder: 3,
    enabled: true,
    link: '/pages/category/category?type=tea',
  },
];

module.exports = { banners };