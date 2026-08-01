// CDN 图片基础路径
const IMAGE_BASE_PATH = 'https://tiyycecb8.hn-bkt.clouddn.com/images/imgs/';

function img(name) {
  return `${IMAGE_BASE_PATH}${name}`;
}

const products = [
  // ===== 惠民专区 =====
  { id: 'welfare_1', name: '惠民降压茶',        image: img('tea_background_5.jpg'),    originalPrice: 89,  discountedPrice: 59,  categoryId: 'welfare', description: '政府补贴惠民产品，有效降血压，精选山楂、决明子等天然草本', stock: 100, tags: ['惠民', '降压', '政府补贴'] },
  { id: 'welfare_2', name: '惠民养胃粉',        image: img('powder_elements_3.png'),  originalPrice: 128, discountedPrice: 88,  categoryId: 'welfare', description: '惠民专供，温和养胃护胃，采用传统工艺研磨而成',              stock: 80,  tags: ['惠民', '养胃', '温和'] },
  { id: 'welfare_3', name: '惠民安神茶',        image: img('tea_decoration_3.jpg'),   originalPrice: 68,  discountedPrice: 45,  categoryId: 'welfare', description: '改善睡眠质量，惠民价格，含酸枣仁、茯苓等安神成分',          stock: 120, tags: ['惠民', '安神', '助眠'] },

  // ===== 爆款茶饮 =====
  { id: 'tea_1',     name: '网红柠檬蜂蜜茶',    image: img('tea_background_7.jpg'),    originalPrice: 58,  discountedPrice: 39,  categoryId: 'tea',     description: '清香柠檬配天然蜂蜜，酸甜可口，富含维生素C',                stock: 200, tags: ['爆款', '柠檬', '蜂蜜', '网红'] },
  { id: 'tea_2',     name: '玫瑰花茶礼盒',      image: img('gift_box_5.jpg'),          originalPrice: 168, discountedPrice: 128, categoryId: 'tea',     description: '精选玫瑰花瓣，美容养颜，精美礼盒包装',                    stock: 50,  tags: ['爆款', '玫瑰', '美容', '礼盒'] },
  { id: 'tea_3',     name: '薄荷清凉茶',        image: img('green_plants_3.jpg'),      originalPrice: 45,  categoryId: 'tea',     description: '天然薄荷叶，清热解暑，夏日必备饮品',                      stock: 150, tags: ['爆款', '薄荷', '清凉', '解暑'] },

  // ===== 活动专区 =====
  { id: 'activity_1', name: '限时秒杀养生套装',  image: img('gift_box_0.jpg'),          originalPrice: 299, discountedPrice: 199, categoryId: 'activity', description: '限时秒杀，养生三件套超值优惠，包含人参、枸杞、红枣',        stock: 30,  tags: ['秒杀', '套装', '限时', '超值'] },
  { id: 'activity_2', name: '买二送一枸杞',      image: img('herb_ingredients_0.jpg'), originalPrice: 88,  discountedPrice: 66,  categoryId: 'activity', description: '宁夏枸杞，买二送一活动进行中，明目养肝佳品',              stock: 80,  tags: ['活动', '枸杞', '买二送一', '宁夏'] },
  { id: 'activity_3', name: '新用户专享礼包',    image: img('gift_box_8.jpg'),          originalPrice: 158, discountedPrice: 98,  categoryId: 'activity', description: '新用户专享，多种中药材体验装，让您体验传统中医魅力',        stock: 100, tags: ['新用户', '专享', '体验装', '礼包'] },

  // ===== 中药材 =====
  { id: 'herbs_1',   name: '野生人参片',        image: img('herb_ingredients_3.jpg'), originalPrice: 588, discountedPrice: 488, categoryId: 'herbs',    description: '长白山野生人参，大补元气，滋阴补阳，珍贵药材',            stock: 15,  tags: ['人参', '野生', '长白山', '大补'] },
  { id: 'herbs_2',   name: '优质当归片',        image: img('medicine_collage_2.jpg'),  originalPrice: 128, categoryId: 'herbs',    description: '甘肃岷县当归，补血调经，妇科圣药，品质上乘',              stock: 60,  tags: ['当归', '补血', '调经', '甘肃'] },
  { id: 'herbs_3',   name: '精选黄芪',          image: img('herb_ingredients_5.jpeg'), originalPrice: 98,  discountedPrice: 78,  categoryId: 'herbs',    description: '内蒙古黄芪，补气固表，提升免疫力，道地药材',              stock: 90,  tags: ['黄芪', '补气', '固表', '内蒙古'] },
  { id: 'herbs_4',   name: '川贝母',            image: img('medicine_collage_7.jpg'),  originalPrice: 268, discountedPrice: 228, categoryId: 'herbs',    description: '四川川贝母，润肺止咳，化痰平喘，珍贵川药',                stock: 25,  tags: ['川贝', '润肺', '止咳', '四川'] },

  // ===== 保健品 =====
  { id: 'health_1',  name: '灵芝孢子粉胶囊',    image: img('product_jars_7.jpg'),      originalPrice: 368, discountedPrice: 298, categoryId: 'health',   description: '破壁灵芝孢子粉，增强免疫力，延缓衰老，现代工艺提取',      stock: 40,  tags: ['灵芝', '孢子粉', '免疫力', '破壁'] },
  { id: 'health_2',  name: '蜂胶软胶囊',        image: img('product_jars_3.jpg'),      originalPrice: 188, discountedPrice: 158, categoryId: 'health',   description: '天然蜂胶，抗菌消炎，提高机体抵抗力，纯天然提取',          stock: 70,  tags: ['蜂胶', '抗菌', '消炎', '天然'] },
  { id: 'health_3',  name: '虫草花胶囊',        image: img('product_jars_4.jpg'),      originalPrice: 288, categoryId: 'health',   description: '人工培育虫草花，滋补强身，补肺益肾，现代养生佳品',        stock: 35,  tags: ['虫草花', '滋补', '强身', '培育'] },

  // ===== 营养补充 =====
  { id: 'supplements_1', name: '复合维生素片',   image: img('product_jars_8.jpg'),      originalPrice: 128, discountedPrice: 98,  categoryId: 'supplements', description: '多种维生素矿物质，均衡营养，科学配比，日常保健必备',      stock: 100, tags: ['维生素', '矿物质', '营养', '复合'] },
  { id: 'supplements_2', name: '钙铁锌硒片',     image: img('powder_elements_6.jpg'),  originalPrice: 88,  discountedPrice: 68,  categoryId: 'supplements', description: '四合一微量元素补充，促进骨骼发育，增强体质',              stock: 80,  tags: ['钙', '铁', '锌', '硒', '微量元素'] },
  { id: 'supplements_3', name: '深海鱼油胶囊',   image: img('powder_elements_8.jpg'),  originalPrice: 198, discountedPrice: 168, categoryId: 'supplements', description: '深海鱼油，保护心血管健康，富含DHA和EPA，进口原料',          stock: 60,  tags: ['鱼油', '深海', '心血管', '健康'] },
];

module.exports = { products };