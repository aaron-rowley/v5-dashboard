(function () {
  var s = document.currentScript;
  var host = document.getElementById('vq-dashboard-container') || (function () {
    var d = document.createElement('div'); d.id = 'vq-dashboard-container';
    s.parentNode.insertBefore(d, s); return d;
  })();

  // attributes from the <script> tag
  var DASHBOARD_SRC = s.getAttribute('data-src');                      // e.g. https://aaron-rowley.github.io/v5-dashboard/v1.0/dashboard.html
  var WEBHOOK       = s.getAttribute('data-webhook');                  // e.g. https://api.visquanta.com/webhook/Refresh-v5-dashboard
  var LOCATION_ID   = s.getAttribute('data-location') || '';           // {{ location.id }}
  var HEIGHT        = s.getAttribute('data-height') || '1800';         // css height (px or any CSS unit)

  if (!DASHBOARD_SRC)  return console.error('VQ: data-src is required');
  if (!WEBHOOK)        return console.error('VQ: data-webhook is required');
  if (!LOCATION_ID)    console.warn('VQ: data-location is empty');

  // create iframe
  var ifr = document.createElement('iframe');
  ifr.src = DASHBOARD_SRC;
  ifr.loading = 'lazy';
  ifr.style.width = '100%';
  ifr.style.border = '0';
  ifr.style.height = /^\d+$/.test(HEIGHT) ? (HEIGHT + 'px') : HEIGHT;
  host.appendChild(ifr);

  // helper: resize when child reports height
  window.addEventListener('message', function (e) {
    if (e && e.data && e.data.type === 'VQ_IFR_HEIGHT') {
      ifr.style.height = (e.data.height || 1800) + 'px';
    }
  });

  // when iframe is ready, fetch metrics then post to it
  ifr.addEventListener('load', function () {
    var body = { location: { id: LOCATION_ID } };
    var controller = new AbortController();
    var timeout = setTimeout(function(){ controller.abort(); }, 45000); // 45s safety

    fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    })
      .then(function (r) { clearTimeout(timeout); return r.json(); })
      .then(function (data) {
        if (ifr.contentWindow) {
          ifr.contentWindow.postMessage({
            type: 'VQ_METRICS',
            payload: data   // send raw object; dashboard will handle it
          }, '*');
        }
      })
      .catch(function (err) { console.warn('VQ: webhook fetch failed', err); });
  });
})();
