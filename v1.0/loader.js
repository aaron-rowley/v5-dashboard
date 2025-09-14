(function () {
  var s = document.currentScript;

  // ---------- DEDUPE: prevent multiple inits for same container+location ----------
  window.__VQ_INIT = window.__VQ_INIT || {};
  var containerId = 'vq-dashboard-container';
  var locationKey = (s.getAttribute('data-location') || '') + '|' + (s.getAttribute('data-webhook') || '');
  var initKey = containerId + '|' + locationKey;
  if (window.__VQ_INIT[initKey]) {
    // If we already initialized, reuse the existing iframe and just request height.
    var existingHost = document.getElementById(containerId);
    var existingIfr = existingHost && existingHost.querySelector('iframe');
    if (existingIfr && existingIfr.contentWindow) {
      try { existingIfr.contentWindow.postMessage({ type: 'VQ_REQUEST_HEIGHT' }, '*'); } catch (e) {}
    }
    return; // <-- critical: no second webhook call
  }
  window.__VQ_INIT[initKey] = true;

  // ---------- Host container (create if missing) ----------
  var host = document.getElementById(containerId) || (function () {
    var d = document.createElement('div'); d.id = containerId;
    s.parentNode.insertBefore(d, s);
    return d;
  })();

  // ---------- Attributes from the <script> tag ----------
  var DASHBOARD_SRC = s.getAttribute('data-src');            // e.g. https://.../dashboard.html
  var WEBHOOK       = s.getAttribute('data-webhook');        // e.g. https://api.visquanta.com/webhook/Refresh-v5-dashboard
  var LOCATION_ID   = s.getAttribute('data-location') || ''; // e.g. {{ location.id }}
  var HEIGHT_ATTR   = s.getAttribute('data-height');         // "auto", "100%", "1800", etc.
  var AUTO_HEIGHT   = !HEIGHT_ATTR || HEIGHT_ATTR.toLowerCase() === 'auto';

  if (!DASHBOARD_SRC)  return console.error('VQ: data-src is required');
  if (!WEBHOOK)        return console.error('VQ: data-webhook is required');
  if (!LOCATION_ID)    console.warn('VQ: data-location is empty');

  // ---------- Reuse existing iframe if GHL re-mounted the script ----------
  var reuse = host.querySelector('iframe');
  if (reuse) {
    // Already wired; honor height and bail (no new fetch).
    if (AUTO_HEIGHT) requestHeightFor(reuse);
    return;
  }

  // ---------- Create iframe ----------
  var ifr = document.createElement('iframe');
  ifr.src = DASHBOARD_SRC;
  ifr.loading = 'lazy';
  ifr.setAttribute('title', 'VisQuanta Dashboard');
  ifr.setAttribute('allowfullscreen', '');
  ifr.style.width = '100%';
  ifr.style.border = '0';

  // Height strategy
  if (AUTO_HEIGHT) {
    // Fallback height until child reports back
    ifr.style.height = '900px';
  } else {
    // Respect explicit height (px or any CSS unit)
    ifr.style.height = /^\d+$/.test(HEIGHT_ATTR) ? (HEIGHT_ATTR + 'px') : HEIGHT_ATTR;
  }

  host.appendChild(ifr);

  // ---------- Auto-resize handshake/listener (parent side) ----------
  function requestHeightFor(frame) {
    if (frame && frame.contentWindow) {
      try { frame.contentWindow.postMessage({ type: 'VQ_REQUEST_HEIGHT' }, '*'); } catch (e) {}
    }
  }

  window.addEventListener('message', function (e) {
    var data = e && e.data;
    if (!data || typeof data !== 'object') return;

    // Child → parent: content height report
    if (data.type === 'VQ_IFR_HEIGHT' && AUTO_HEIGHT) {
      var h = parseInt(data.height, 10);
      if (!isNaN(h) && h > 0) {
        ifr.style.height = h + 'px';
      }
    }
  });

  // Ping the child for height after load and on parent resizes
  var pingTimer;
  function startPinging() {
    // Burst pings for ~3s to capture initial layout shifts
    var count = 0;
    pingTimer = setInterval(function () {
      requestHeightFor(ifr);
      if (++count >= 6) clearInterval(pingTimer); // ~3s at 500ms
    }, 500);
  }

  window.addEventListener('resize', function () {
    if (AUTO_HEIGHT) requestHeightFor(ifr);
  });

  // ---------- One-time load handler → fetch webhook once ----------
  ifr.addEventListener('load', function onLoad() {
    ifr.removeEventListener('load', onLoad); // belt-and-suspenders + {once:true} alternative
    if (AUTO_HEIGHT) startPinging();

    var body = { location: { id: LOCATION_ID } };

    // Optional: idempotency header if your API supports it
    // (prevents dupes server-side even if client misfires)
    var idem = Date.now() + ':' + locationKey;

    var controller = new AbortController();
    var timeout = setTimeout(function(){ controller.abort(); }, 45000); // 45s safety

    fetch(WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'X-Idempotency-Key': idem, // uncomment if your webhook supports it
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
      .then(function (r) { clearTimeout(timeout); return r.json(); })
      .then(function (data) {
        if (ifr.contentWindow) {
          ifr.contentWindow.postMessage({ type: 'VQ_METRICS', payload: data }, '*');
          if (AUTO_HEIGHT) requestHeightFor(ifr); // ask again after content mounts
        }
      })
      .catch(function (err) { console.warn('VQ: webhook fetch failed', err); });
  }, { once: true });
})();
