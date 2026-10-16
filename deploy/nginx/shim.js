/*
 * SnowLuma WebUI 子路径适配垫片（由 nginx 注入到 /snowluma/ 的 HTML 中）。
 *
 * 做三件事：
 *   1) 把 SPA 发出的 `/api/*` 请求转发到 `/snowluma-api/*`，避免与本项目自身的
 *      `/api/*`（控制台 API）撞车；
 *   2) 给 history.pushState/replaceState 补上 `/snowluma` 前缀，让浏览器地址栏
 *      始终停留在子路径下（SPA 的 router basepath 已由 nginx 改写为 /snowluma）；
 *   3) 复用登录：控制台把 SnowLuma 的初始化/登录页直接内嵌成自己的登录入口，
 *      用户在页面上设置的访问令牌需要同步给控制台后端 —— 后端拿它才能调用
 *      SnowLuma API，并据此签发控制台会话。这里拦截登录/改密请求，成功后把
 *      令牌回传给 `/api/auth/capture`。
 *
 * 注意：本文件必须与 nginx.conf 里的改写规则同步维护。
 */
(function () {
  var PREFIX = '/snowluma';
  var API = '/snowluma-api';

  function mapApi(u) {
    if (typeof u === 'string' && u.indexOf('/api/') === 0) return API + u.slice(4);
    return u;
  }

  var origFetch = window.fetch;

  /** 登录/改密请求成功后，把令牌同步给控制台后端（用原始 fetch，避免被上面的前缀改写）。 */
  function capture(password) {
    if (!password) return;
    try {
      origFetch('/api/auth/capture', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password }),
      });
    } catch (e) {}
  }

  function credentialFrom(url, body) {
    if (typeof body !== 'string') return '';
    if (!/\/api\/(login|auth\/change-password)(\?|$)/.test(url || '')) return '';
    try {
      var data = JSON.parse(body);
      return String(data.newPassword || data.password || '');
    } catch (e) {
      return '';
    }
  }

  if (origFetch) {
    window.fetch = function (input, init) {
      var rawUrl = typeof input === 'string' ? input : (input && input.url) || '';
      var secret = credentialFrom(rawUrl, init && init.body);
      var mapped = input;
      try {
        if (typeof input === 'string') {
          mapped = mapApi(input);
        } else if (typeof Request !== 'undefined' && input instanceof Request && input.url) {
          var url = new URL(input.url, location.href);
          if (url.origin === location.origin && url.pathname.indexOf('/api/') === 0) {
            mapped = new Request(API + url.pathname.slice(4) + url.search + url.hash, input);
          }
        }
      } catch (e) {}
      var promise = origFetch.call(this, mapped, init);
      if (secret) {
        return promise.then(function (response) {
          try {
            if (response && response.ok) capture(secret);
          } catch (e) {}
          return response;
        });
      }
      return promise;
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
