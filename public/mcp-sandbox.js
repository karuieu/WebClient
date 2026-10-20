"use strict";

// Fetch relay for MCP connectors, served from its own origin. It holds no session,
// key or conversation: it only forwards requests from its parent frame.
(function () {
  var TIMEOUT_MS = 60000;
  var MAX_BODY_CHARS = 4 * 1024 * 1024;

  function reply(port, id, payload) {
    payload.id = id;
    port.postMessage(payload);
  }

  function handle(port, req) {
    if (!req || typeof req.id !== "string" || typeof req.url !== "string") return;

    var url;
    try {
      url = new URL(req.url);
    } catch {
      reply(port, req.id, { error: "That address isn't valid." });
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      reply(port, req.id, { error: "Only web addresses are supported." });
      return;
    }

    var method = req.method === "GET" || req.method === "DELETE" ? req.method : "POST";
    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, TIMEOUT_MS);

    fetch(url.toString(), {
      method: method,
      headers: req.headers || {},
      body: method === "POST" ? req.body : undefined,
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    })
      .then(function (res) {
        return res.text().then(function (text) {
          reply(port, req.id, {
            status: res.status,
            contentType: res.headers.get("content-type") || "",
            sessionId: res.headers.get("mcp-session-id") || "",
            wwwAuthenticate: res.headers.get("www-authenticate") || "",
            body: text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) : text,
          });
        });
      })
      .catch(function (err) {
        reply(port, req.id, {
          error:
            err && err.name === "AbortError"
              ? "The server took too long to answer."
              : "Couldn't reach the server. It may not accept connections from a browser.",
        });
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  window.addEventListener("message", function (event) {
    // frame-ancestors in this page's CSP guarantees the parent is the app.
    if (window.parent === window || event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.type !== "karui-mcp-connect" || !event.ports || !event.ports[0]) return;
    var port = event.ports[0];
    port.onmessage = function (e) {
      handle(port, e.data);
    };
    port.postMessage({ type: "ready" });
  });
})();
