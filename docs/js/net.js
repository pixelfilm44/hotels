/* WebSocket client with auto-reconnect. */
(function () {
  'use strict';
  var ws = null;
  var handlers = {};
  var retry = 0;
  var onOpen = null;

  function connect() {
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(proto + location.host);
    ws.onopen = function () {
      retry = 0;
      if (onOpen) onOpen();
      emit('_open');
    };
    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      emit(m.t, m);
    };
    ws.onclose = function () {
      emit('_close');
      var delay = Math.min(5000, 500 * Math.pow(2, retry++));
      setTimeout(connect, delay);
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  function emit(type, m) {
    if (handlers[type]) handlers[type](m || {});
  }

  window.Net = {
    start: function (openCb) { onOpen = openCb; connect(); },
    on: function (type, fn) { handlers[type] = fn; },
    send: function (obj) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
    },
    connected: function () { return ws && ws.readyState === 1; }
  };
})();
