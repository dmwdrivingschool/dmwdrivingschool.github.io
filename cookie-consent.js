// Cookie consent for dmwdrivingschool.co.uk (Dale, 14 Sep 2026). One file for every page, so Google Analytics only
// loads after Accept (UK PECR, and what the Cookie Notice says). Before this, most pages loaded it straight away and
// only the Cookie Notice, Privacy Policy and Terms of Use asked first. Saved answers ('accepted' / 'rejected') are the
// same as before, so nobody is asked again. "Change my cookie choice" on the Cookie Notice forgets the answer and
// asks again.
(function () {
  var KEY = 'dmw_cookie_consent';
  var GA_ID = 'G-8VPCP1ZYEE';
  var banner = null;

  function loadGA() {
    if (window.__dmwGALoaded) return;
    window.__dmwGALoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
  }

  function buildBanner() {
    if (banner) return banner;
    var style = document.createElement('style');
    style.textContent = [
      '#dmw-cookie-banner{position:fixed;bottom:0;left:0;right:0;z-index:100000;background:#111827;color:#e5e7eb;padding:16px 20px;box-shadow:0 -4px 20px rgba(0,0,0,0.25);font-family:Arial,Helvetica,sans-serif;font-size:0.9rem;display:none}',
      '#dmw-cookie-banner .dmw-cookie-inner{max-width:960px;margin:0 auto;display:flex;flex-wrap:wrap;gap:12px 16px;align-items:center;justify-content:space-between}',
      '#dmw-cookie-banner p{margin:0;line-height:1.45;flex:1 1 260px}',
      '#dmw-cookie-banner a{color:#93c5fd;text-decoration:underline}',
      '#dmw-cookie-banner .dmw-cookie-btns{display:flex;gap:10px;flex-shrink:0}',
      '#dmw-cookie-banner button{border:none;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;font-size:0.88rem}',
      '#dmw-cookie-accept{background:#0A4CA1;color:#fff}',
      '#dmw-cookie-reject{background:#374151;color:#fff}',
      '@media (max-width:600px){#dmw-cookie-banner .dmw-cookie-btns{width:100%}#dmw-cookie-banner button{flex:1}}'
    ].join('\n');
    document.head.appendChild(style);

    banner = document.createElement('div');
    banner.id = 'dmw-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<div class="dmw-cookie-inner">' +
        '<p>We use essential cookies to make the site work, and optional analytics cookies to understand how the site is used. ' +
        'See our <a href="cookies.html">Cookie Notice</a> and <a href="privacy.html">Privacy Policy</a>.</p>' +
        '<div class="dmw-cookie-btns">' +
          '<button type="button" id="dmw-cookie-reject">Reject non-essential</button>' +
          '<button type="button" id="dmw-cookie-accept">Accept</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(banner);
    document.getElementById('dmw-cookie-accept').addEventListener('click', function () { choose('accepted'); });
    document.getElementById('dmw-cookie-reject').addEventListener('click', function () { choose('rejected'); });
    return banner;
  }

  function showBanner() { buildBanner().style.display = 'block'; }

  function choose(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
    if (banner) banner.style.display = 'none';
    if (value === 'accepted') loadGA();
  }

  // Forgets the answer, clears Google Analytics' cookies and asks again. Analytics already running on this page can't
  // be unloaded, so after an Accept the page reloads without it first.
  function wireChangeLink() {
    var link = document.getElementById('dmw-cookie-change');
    if (!link) return;
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var was = null;
      try { was = localStorage.getItem(KEY); localStorage.removeItem(KEY); } catch (err) {}
      var host = location.hostname.replace(/^www\./, '');
      document.cookie.split(';').forEach(function (c) {
        var name = c.split('=')[0].trim();
        if (!/^_ga/.test(name)) return;
        ['', '; domain=' + location.hostname, '; domain=.' + host].forEach(function (d) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d;
        });
      });
      if (was === 'accepted') { location.reload(); return; }
      showBanner();
    });
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === 'accepted') loadGA();

  function start() {
    wireChangeLink();
    if (saved !== 'accepted' && saved !== 'rejected') showBanner();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
