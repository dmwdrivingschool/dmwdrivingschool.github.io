/**
 * Drive My Way pass wall (Dale, 25 Sep 2026) — the embeddable wall of verified pass cards.
 *
 * ONE LINE goes on the instructor's own website, wherever they already have one:
 *
 *   <div id="dmw-pass-wall" data-instructor="<their id>"></div>
 *   <script src="https://web.drivemyway.co.uk/pass-wall.js" async></script>
 *
 * Unlike the enquiry form, which is pasted in as a self-contained lump of html, the wall is a HOSTED script.
 * That is deliberate: a wall is read-only, so there is nothing for the instructor to configure, and hosting it
 * means Dale can fix or improve every wall at once without 200 people re-pasting a snippet.
 *
 * It draws into a SHADOW ROOT. Walls land on Squarespace, Wix and fifteen-year-old WordPress themes; a shadow
 * root is the only way to be certain their css cannot wreck ours and ours cannot wreck theirs.
 *
 * Everything on a card is true or absent. A card with words has been accepted by the instructor, and its pupil
 * really did pass with them — public.pass_wall() will not return one that has not. There is deliberately NO
 * count and NO average anywhere on this wall: the instructor chooses which words to accept, and a number on a
 * curated set would be a lie. The number people trust comes from Google, which they link out to themselves.
 */
(function () {
  var SUPABASE_URL = "https://cxcqmyxbpjueezapknim.supabase.co";
  var SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4Y3FteXhicGp1ZWV6YXBrbmltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxMDUxNzAsImV4cCI6MjEwMTY4MTE3MH0.Qk46wzUGpDHlsqGvsImE9HdrrosL3ERKVbxDUsP4A30";
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // How many show before "Show more". A wall of 73 should not push a website's footer into next week.
  var FIRST_BATCH = 12;

  var CSS = [
    ":host{all:initial;display:block;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1e293b}",
    "*{box-sizing:border-box}",
    // The instructor chooses how many across (default 3, their own setting in the Control Centre). Two on a
    // phone whatever they picked: three pass photos side by side on a 390px screen is three thumbnails nobody
    // can see a face in, and Dale judges this at phone size.
    ".grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px;margin:0;padding:0;list-style:none}",
    "@media(min-width:640px){.grid{grid-template-columns:repeat(var(--dmw-cols,3),minmax(0,1fr));gap:25px}}",
    // Matched to the grid Dale's Wall of Fame has always used (.gallery-photo-card): 12px corners, the same
    // faint shadow and the same 4px lift on hover, so the wall drops into a page that already exists without
    // announcing itself as something new.
    ".card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;display:flex;",
    "flex-direction:column;box-shadow:0 4px 10px rgba(0,0,0,0.03);transition:transform .2s ease}",
    "@media(hover:hover){.card:hover{transform:translateY(-4px)}}",
    // 11/12 is his 380px-tall photo in a 352px column, kept as a ratio so it still works at any width rather
    // than needing a media query per breakpoint the way a fixed height does.
    ".card img{display:block;width:100%;aspect-ratio:11/12;object-fit:cover;object-position:center;background:#f1f5f9;margin:0}",
    ".body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:6px}",
    ".who{font-weight:700;font-size:15px;line-height:1.25;margin:0}",
    ".when{font-size:12.5px;color:#64748b;margin:0}",
    ".words{font-size:13.5px;line-height:1.5;color:#334155;margin:4px 0 0;border-top:1px solid #f1f5f9;padding-top:8px}",
    ".words:before{content:'\\201C'}",
    ".words:after{content:'\\201D'}",
    ".more{display:block;width:100%;margin:18px auto 0;padding:12px 18px;background:#fff;border:1px solid #cbd5e1;",
    "border-radius:10px;font:inherit;font-size:15px;font-weight:600;color:#334155;cursor:pointer;min-height:44px}",
    "@media(min-width:640px){.more{width:auto;min-width:260px}}",
    ".brand{text-align:center;margin:0 0 14px}",
    ".brand img{display:block;height:44px;width:auto;max-width:200px;margin:0 auto 6px}",
    ".brand strong{display:block;color:#062F63;font-size:1.05rem}",
    ".brand span{display:block;color:#64748b;font-size:.85rem}",
    ".foot{text-align:center;font-size:11.5px;color:#94a3b8;margin:16px 0 0}",
    ".foot a{color:#64748b}",
    ".msg{color:#475569;font-size:14px;line-height:1.5;margin:0;text-align:center;padding:18px 0}",
  ].join("");

  function esc(t) {
    return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** "September 2026" from a plain date. Anything unparseable shows nothing rather than "Invalid Date". */
  function monthLabel(d) {
    if (!d) return "";
    var dt = new Date(String(d).length === 10 ? d + "T12:00:00" : d);
    if (isNaN(dt.getTime())) return "";
    try {
      return dt.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    } catch (e) {
      return "";
    }
  }

  function mount(host) {
    if (host.getAttribute("data-dmw-mounted") === "1") return;
    var id = (host.getAttribute("data-instructor") || "").trim();
    var school = (host.getAttribute("data-school") || "").trim();
    if (!UUID.test(id) || (school && !UUID.test(school))) return;
    host.setAttribute("data-dmw-mounted", "1");

    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var style = document.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    var box = document.createElement("div");
    root.appendChild(box);

    fetch(SUPABASE_URL + "/rest/v1/rpc/pass_wall", {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: "Bearer " + SUPABASE_ANON,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_instructor: id, p_school: school || null }),
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        // A bad id is a bad link, not a network problem — say so plainly rather than showing an empty wall that
        // looks like nobody has ever passed.
        if (!data || !data.name) {
          box.innerHTML = '<p class="msg">This pass wall isn\'t available.</p>';
          // The host page may have its own photos to fall back to (Dale's own Wall of Fame does).
          host.dispatchEvent(new CustomEvent("dmw-pass-wall-failed", { bubbles: true }));
          return;
        }
        draw(box, data);
        // A host page that has its own photos (Dale's Wall of Fame) waits for this before hiding them, so a
        // wall that never loads leaves the page exactly as it was.
        host.dispatchEvent(new CustomEvent("dmw-pass-wall-ready", { bubbles: true, detail: { cards: (data.cards || []).length } }));
      })
      .catch(function () {
        box.innerHTML = '<p class="msg">Couldn\'t load these pass photos just now.</p>';
        host.dispatchEvent(new CustomEvent("dmw-pass-wall-failed", { bubbles: true }));
      });
  }

  function draw(box, data) {
    var cards = Array.isArray(data.cards) ? data.cards : [];
    if (!cards.length) {
      box.innerHTML = '<p class="msg">No pass photos yet — watch this space.</p>';
      return;
    }

    var html = "";
    // Branding is Premium, the same rule as the enquiry form: without it the wall says Drive My Way on behalf
    // of them. With it, the wall is simply theirs.
    if (data.premium === false) {
      var who = data.kind === "instructor" && data.school ? data.name + " at " + data.school : data.name;
      html +=
        '<div class="brand"><img src="https://web.drivemyway.co.uk/drive-my-way-logo.png" alt="">' +
        "<strong>Drive My Way</strong><span>on behalf of " +
        esc(who) +
        "</span></div>";
    }

    var cols = Math.max(2, Math.min(5, parseInt(data.columns, 10) || 3));
    html += '<ul class="grid" id="dmw-grid" style="--dmw-cols:' + cols + '"></ul>';
    html +=
      '<p class="foot">Pass wall by <a href="https://drivemyway.co.uk" target="_blank" rel="noopener">Drive My Way</a></p>';
    box.innerHTML = html;

    var grid = box.querySelector("#dmw-grid");
    var shown = 0;

    function cardHtml(c) {
      var name = (c.first_name || "").trim();
      var when = monthLabel(c.passed_on);
      // The alt text is what a screen reader and Google both get, so it says who and when when we know.
      var alt = name && when ? name + " passed their driving test in " + when : "A pupil who passed their driving test";
      var bits = '<li class="card"><img src="' + esc(c.photo_url) + '" alt="' + esc(alt) + '" loading="lazy">';
      // A legacy photo has neither a name nor a date, so it shows as a photo and nothing else rather than an
      // empty line where a name should be.
      if (name || when || c.words) {
        bits += '<div class="body">';
        if (name) bits += '<p class="who">' + esc(name) + "</p>";
        if (when) bits += '<p class="when">Passed in ' + esc(when) + "</p>";
        if (c.words) bits += '<p class="words">' + esc(c.words) + "</p>";
        bits += "</div>";
      }
      return bits + "</li>";
    }

    function showMore() {
      var batch = Math.max(FIRST_BATCH, cols * 4);
      var next = cards.slice(shown, shown + batch);
      grid.insertAdjacentHTML("beforeend", next.map(cardHtml).join(""));
      shown += next.length;
      var btn = box.querySelector(".more");
      if (shown >= cards.length) {
        if (btn) btn.remove();
      } else if (!btn) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "more";
        b.textContent = "Show more pass photos";
        b.addEventListener("click", showMore);
        grid.insertAdjacentElement("afterend", b);
      }
    }
    showMore();
  }

  function start() {
    var hosts = document.querySelectorAll("#dmw-pass-wall, .dmw-pass-wall, [data-dmw-pass-wall]");
    Array.prototype.forEach.call(hosts, mount);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  // A page that draws its own container later (a tab, a lazy section) can mount it by hand.
  window.dmwMountPassWall = mount;
})();
