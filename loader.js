(function () {
  var s = document.currentScript;
  // attributes
  var src = s.getAttribute('data-src');                  // required: URL to dashboard.html (GitHub Pages URL)
  var height = s.getAttribute('data-height') || '1800';  // optional default height
  var targetId = s.getAttribute('data-target') || 'vq-dashboard-container';
  var locationId = s.getAttribute('data-location') || ''; // {{ location.id }} will be put here by GHL
  var webhook = s.getAttribute('data-webhook') || 'https://api.visquanta.com/webhook/Refresh-v5-dashboard';

  // host container
  var host = document.getElementById(targetId);
  if (!host) {
    host = document.createElement('div');
    host.id = targetId;
    s.parentNode.insertBefore(host, s);
  }

  // iframe
  var ifr = document.createElement('iframe');
  if (!src) { console.error('VQ loader: data-src is required'); return; }
  ifr.src = src;
  ifr.loading = 'lazy';
  ifr.style.width = '100%';
  ifr.style.border = '0';
  ifr.style.height = (/^\d+$/.test(height) ? height + 'px' : height);
  host.appendChild(ifr);

  // fetch metrics from n8n once iframe is ready
  ifr.addEventListener('load', function () {
    fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: { id: locationId } })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (ifr.contentWindow) {
        ifr.contentWindow.postMessage({ type: 'VQ_METRICS', payload: JSON.stringify(data) }, '*');
      }
    })
    .catch(function (e) { console.warn('VQ loader: webhook failed', e); });
  });

  // auto-resize when the iframe reports its height
  window.addEventListener('message', function (e) {
    if (e && e.data && e.data.type === 'VQ_IFR_HEIGHT') {
      ifr.style.height = (e.data.height || height) + 'px';
    }
  });
})();
