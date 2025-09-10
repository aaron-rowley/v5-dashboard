(function () {
  var s = document.currentScript;

  var src = s.getAttribute('data-src');                 // required: URL to dashboard.html
  var height = s.getAttribute('data-height') || '1800'; // optional
  var targetId = s.getAttribute('data-target') || 'vq-dashboard-container';
  var jsonId = s.getAttribute('data-json-id');          // optional: id of <script type="application/json">
  var inlineJSON = s.getAttribute('data-metrics');      // optional: raw JSON string

  // host container
  var host = document.getElementById(targetId);
  if (!host) {
    host = document.createElement('div');
    host.id = targetId;
    s.parentNode.insertBefore(host, s);
  }

  // iframe
  var ifr = document.createElement('iframe');
  ifr.src = src;
  ifr.loading = 'lazy';
  ifr.style.width = '100%';
  ifr.style.border = '0';
  ifr.style.height = (/^\d+$/.test(height) ? height + 'px' : height);
  host.appendChild(ifr);

  // pick up JSON payload
  function getPayload() {
    if (jsonId) {
      var el = document.getElementById(jsonId);
      if (el) return (el.textContent || '').trim();
    }
    return inlineJSON || '{}';
  }

  ifr.addEventListener('load', function () {
    try {
      var payload = getPayload();
      ifr.contentWindow.postMessage({ type: 'VQ_METRICS', payload: payload }, '*');
    } catch (e) {
      console.warn('VQ loader: failed to post metrics', e);
    }
  });
})();
