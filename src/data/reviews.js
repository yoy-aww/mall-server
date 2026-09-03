const reviews = [
  // herbs_1 人参片
  { id: 'rev_001', productId: 'herbs_1', userId: 'u_zhangsan', username: 'zhangsan', nickname: '老张', rating: 5, content: '人参片品质很好，泡水喝很补气，包装也很精致，会回购！', images: [], reply: '感谢您的认可，我们坚持长白山原产地直供！', replyAt: '2026-08-20 10:30:00', visible: 1, createdAt: '2026-08-19 14:20:00' },
  { id: 'rev_002', productId: 'herbs_1', userId: 'u_lisi', username: 'lisi', nickname: '李四', rating: 4, content: '品质不错，就是分量有点少，希望能出大包装。', images: [], reply: '', replyAt: '', visible: 1, createdAt: '2026-08-22 09:15:00' },
  { id: 'rev_003', productId: 'herbs_1', userId: 'u_wangwu', username: 'wangwu', nickname: '王五味', rating: 5, content: '老客户了，第三次买，品质始终如一。送给爸妈的，老人很满意。', images: [], reply: '感恩老客户信任，老客户回购有专享优惠哦~', replyAt: '2026-08-25 16:00:00', visible: 1, createdAt: '2026-08-24 11:30:00' },

  // tea_1 柠檬蜂蜜茶
  { id: 'rev_004', productId: 'tea_1', userId: 'u_zhangsan', username: 'zhangsan', nickname: '老张', rating: 5, content: '柠檬蜂蜜茶太好喝了！酸甜适中，每天一杯，全家都喜欢。', images: [], reply: '', replyAt: '', visible: 1, createdAt: '2026-08-18 10:00:00' },
  { id: 'rev_005', productId: 'tea_1', userId: 'u_lisi', username: 'lisi', nickname: '李四', rating: 4, content: '味道不错，就是蜂蜜味可以再浓一点。物流很快。', images: [], reply: '已反馈给厂家，感谢建议！', replyAt: '2026-08-19 14:00:00', visible: 1, createdAt: '2026-08-18 16:20:00' },
  { id: 'rev_006', productId: 'tea_1', userId: 'u_wangwu', username: 'wangwu', nickname: '王五味', rating: 5, content: '网红产品果然名不虚传，办公室同事都跟着买了。', images: [], reply: '', replyAt: '', visible: 1, createdAt: '2026-08-21 09:45:00' },

  // tea_2
  { id: 'rev_007', productId: 'tea_2', userId: 'u_zhangsan', username: 'zhangsan', nickname: '老张', rating: 4, content: '菊花茶很新鲜，泡出来颜色漂亮。就是罐子有点难开。', images: [], reply: '', replyAt: '', visible: 1, createdAt: '2026-08-20 13:10:00' },
  { id: 'rev_008', productId: 'tea_2', userId: 'u_lisi', username: 'lisi', nickname: '李四', rating: 5, content: '杭白菊品质上乘，清热降火，夏天必备。', images: [], reply: '', replyAt: '', visible: 1, createdAt: '2026-08-23 15:30:00' },

  // health_1 枸杞
  { id: 'rev_009', productId: 'health_1', userId: 'u_wangwu', username: 'wangwu', nickname: '王五味', rating: 5, content: '枸杞颗粒饱满，颜色自然，没有染色。泡水熬粥都好用。', images: [], reply: '宁夏中宁直供，保证无硫磺熏蒸！', replyAt: '2026-08-22 10:00:00', visible: 1, createdAt: '2026-08-21 18:00:00' },
  { id: 'rev_010', productId: 'health_1', userId: 'u_zhangsan', username: 'zhangsan', nickname: '老张', rating: 4, content: '枸杞不错，就是包装袋密封性一般，建议改进。', images: [], reply: '已升级为自封袋包装，感谢反馈！', replyAt: '2026-08-23 09:00:00', visible: 1, createdAt: '2026-08-22 08:30:00' },

  // welfare_1 惠民
  { id: 'rev_011', productId: 'welfare_1', userId: 'u_lisi', username: 'lisi', nickname: '李四', rating: 5, content: '惠民价格买到好品质，性价比超高，感谢平台！', images: [], reply: '', replyAt: '', visible: 1, createdAt: '2026-08-19 12:00:00' },
  { id: 'rev_012', productId: 'welfare_1', userId: 'u_wangwu', username: 'wangwu', nickname: '王五味', rating: 3, content: '一般般吧，价格确实便宜，但品相不如正价的好。', images: [], reply: '惠民专区为临期/微瑕品，品质有保证，感谢理解！', replyAt: '2026-08-20 10:00:00', visible: 1, createdAt: '2026-08-19 20:00:00' },
];

module.exports = { reviews };
