(function () {
  var s = document.currentScript;

  // ---------- DEDUPE: prevent multiple inits for same container+location ----------
  window.__VQ_INIT = window.__VQ_INIT || {};
  var containerId = 'vq-dashboard-container';
  var locationKey = (s.getAttribute('data-location') || '') + '|' + (s.getAttribute('data-webhook') || '');
  var initKey = containerId + '|' + locationKey;

  if (window.__VQ_INIT[initKey]) {
    var existingHost = document.getElementById(containerId);
    var existingIfr = existingHost && existingHost.querySelector('iframe');
    if (existingIfr && existingIfr.contentWindow) {
      try { existingIfr.contentWindow.postMessage({ type: 'VQ_REQUEST_HEIGHT' }, '*'); } catch (e) {}
    }
    return; // already initialized; do not refetch
  }
  window.__VQ_INIT[initKey] = true;

  // ---------- Host container (create if missing) ----------
  var host = document.getElementById(containerId) || (function () {
    var d = document.createElement('div');
    d.id = containerId;
    s.parentNode.insertBefore(d, s);
    return d;
  })();

  // ---------- Attributes from the <script> tag ----------
  var DASHBOARD_SRC = s.getAttribute('data-src');
  var WEBHOOK       = s.getAttribute('data-webhook');
  var LOCATION_ID   = s.getAttribute('data-location') || '';
  var HEIGHT_ATTR   = s.getAttribute('data-height');
  var AUTO_HEIGHT   = !HEIGHT_ATTR || HEIGHT_ATTR.toLowerCase() === 'auto';

  if (!DASHBOARD_SRC)  return console.error('VQ: data-src is required');
  if (!WEBHOOK)        return console.error('VQ: data-webhook is required');
  if (!LOCATION_ID)    console.warn('VQ: data-location is empty');

  // ---------- Reuse existing iframe if GHL re-mounted the script ----------
  var reuse = host.querySelector('iframe');
  if (reuse) {
    if (AUTO_HEIGHT) requestHeightFor(reuse);
    return; // iframe already present; do not refetch
  }

  // ---------- Create iframe ----------
  var ifr = document.createElement('iframe');
  ifr.src = DASHBOARD_SRC;
  ifr.loading = 'lazy';
  ifr.setAttribute('title', 'VisQuanta Dashboard');
  ifr.setAttribute('allowfullscreen', '');
  ifr.style.width = '100%';
  ifr.style.border = '0';
  if (AUTO_HEIGHT) {
    ifr.style.height = '900px'; // fallback until child reports height
  } else {
    ifr.style.height = /^\d+$/.test(HEIGHT_ATTR) ? (HEIGHT_ATTR + 'px') : HEIGHT_ATTR;
  }
  host.appendChild(ifr);

  // ---------- Parent ↔ child height handshake ----------
  function requestHeightFor(frame) {
    if (frame && frame.contentWindow) {
      try { frame.contentWindow.postMessage({ type: 'VQ_REQUEST_HEIGHT' }, '*'); } catch (e) {}
    }
  }
  window.addEventListener('message', function (e) {
    var data = e && e.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'VQ_IFR_HEIGHT' && AUTO_HEIGHT) {
      var h = parseInt(data.height, 10);
      if (!isNaN(h) && h > 0) { ifr.style.height = h + 'px'; }
    }
  });
  var pingTimer;
  function startPinging() {
    var count = 0;
    pingTimer = setInterval(function () {
      requestHeightFor(ifr);
      if (++count >= 6) clearInterval(pingTimer); // ~3s
    }, 500);
  }
  window.addEventListener('resize', function () {
    if (AUTO_HEIGHT) requestHeightFor(ifr);
  });

  // ---------- Throttle + one-shot fetch ----------
  var fetchStarted = false; // in-case of quirky double-load
  var THROTTLE_MS = 10000;  // 10s window
  var throttleKey = 'VQ_THROTTLE_' + locationKey;

  function shouldFetchNow() {
    try {
      var last = Number(sessionStorage.getItem(throttleKey) || '0');
      var now = Date.now();
      if (now - last < THROTTLE_MS) return false; // within throttle window
      sessionStorage.setItem(throttleKey, String(now));
      return true;
    } catch (e) {
      // sessionStorage not available? fall back to true
      return true;
    }
  }

  ifr.addEventListener('load', function onLoad() {
    ifr.removeEventListener('load', onLoad);
    if (AUTO_HEIGHT) startPinging();

    if (fetchStarted) return;            // guard
    if (!shouldFetchNow()) return;       // throttle
    fetchStarted = true;

    var body = { location: { id: LOCATION_ID } };
    var controller = new AbortController();
    var timeout = setTimeout(function(){ controller.abort(); }, 45000);

    fetch(WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'X-Idempotency-Key': Date.now() + ':' + locationKey, // enable if server supports it
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    .then(function (r) { clearTimeout(timeout); return r.json(); })
    .then(function (data) {
      if (ifr.contentWindow) {
        ifr.contentWindow.postMessage({ type: 'VQ_METRICS', payload: data }, '*');
        if (AUTO_HEIGHT) requestHeightFor(ifr);
      }
    })
    .catch(function (err) { console.warn('VQ: webhook fetch failed', err); });
  }, { once: true });
})();
