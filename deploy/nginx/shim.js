/*
 * SnowLuma WebUI 子路径适配垫片（由 nginx 注入到 /snowluma/ 的 HTML 中）。
 *
 * SnowLuma 的 WebUI 假设自己挂在根路径：接口走绝对 `/api/*`，路由用绝对路径。
 * 本垫片做两件事：
 *   1) 把 SPA 发出的 `/api/*` 请求转发到 `/snowluma-api/*`，避免与本项目自身的
 *      `/api/*`（控制台 API）撞车；
 *   2) 给 history.pushState/replaceState 补上 `/snowluma` 前缀，让浏览器地址栏
 *      始终停留在子路径下（SPA 的 router basepath 已由 nginx 改写为 /snowluma）。
 *
 * 注意：本文件必须同步维护，改动前先确认 nginx.conf 里的改写规则仍匹配。
 */
(function () {
  var PREFIX = '/snowluma';
  var API = '/snowluma-api';

  function mapApi(u) {
    if (typeof u === 'string' && u.indexOf('/api/') === 0) return API + u.slice(4);
    return u;
  }

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      try {
        if (typeof input === 'string') {
          input = mapApi(input);
        } else if (typeof Request !== 'undefined' && input instanceof Request && input.url) {
          var url = new URL(input.url, location.href);
          if (url.origin === location.origin && url.pathname.indexOf('/api/') === 0) {
            input = new Request(API + url.pathname.slice(4) + url.search + url.hash, input);
          }
        }
      } catch (e) {}
      return origFetch.call(this, input, init);
    };
  }

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = [].slice.call(arguments);
    try {
      if (typeof url === 'string' && url.indexOf('/api/') === 0) args[1] = API + url.slice(4);
    } catch (e) {}
    return origOpen.apply(this, args);
  };

  function fix(u) {
    if (typeof u === 'string' && u.charAt(0) === '/' && u.indexOf(PREFIX) !== 0) return PREFIX + u;
    return u;
  }
  var ps = history.pushState, rs = history.replaceState;
  history.pushState = function (s, t, u) { return ps.call(this, s, t, fix(u)); };
  history.replaceState = function (s, t, u) { return rs.call(this, s, t, fix(u)); };
})();
