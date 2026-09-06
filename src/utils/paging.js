/**
 * 分页参数解析工具
 * 统一所有列表接口的分页风格：默认 20/页，最大 100/页。
 *
 * 两种风格都支持：
 *   page/limit  → page=1 表示第一页（默认 1），limit=20
 *   offset/limit → offset=0 表示第一页（默认 0），limit=20
 *
 * 传参优先级：query 里的值 > 默认值；越界会被 clamp。
 *
 * 用法：
 *   const p = parsePaging(req.query);
 *   db.prepare('SELECT ... LIMIT ? OFFSET ?').all(...p.params);
 *   ok(res, { ..., pagination: p.toMeta(total) });
 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

/**
 * 解析分页参数
 * @param {object} query express 的 req.query
 * @param {object} [opts]
 *   @param {number} [opts.defaultLimit=20]
 *   @param {number} [opts.maxLimit=100]
 * @returns {{limit:number, offset:number, page:number, params:[number,number], toMeta:function(number):object}}
 */
function parsePaging(query = {}, opts = {}) {
  const defaultLimit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, opts.defaultLimit || DEFAULT_LIMIT));
  const maxLimit = Math.max(MIN_LIMIT, Math.min(10000, opts.maxLimit || MAX_LIMIT));

  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit < MIN_LIMIT) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  let offset;
  if (query.offset !== undefined) {
    offset = parseInt(query.offset, 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
  } else {
    let page = parseInt(query.page, 10);
    if (!Number.isFinite(page) || page < 1) page = 1;
    offset = (page - 1) * limit;
  }

  return {
    limit,
    offset,
    page: Math.floor(offset / limit) + 1,
    params: [limit, offset],
    toMeta(total) {
      return {
        total,
        limit,
        offset,
        page: Math.floor(offset / limit) + 1,
        totalPages: Math.ceil(total / limit) || 1,
        hasMore: offset + limit < total,
      };
    },
  };
}

module.exports = {
  parsePaging,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
