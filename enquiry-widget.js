// Drive My Way enquiry form (Dale, 13 Sep 2026).
// Shared by the Control Centre (admin.html: the embed code in Settings, Your
// enquiry form) and enquiry-form.html (the direct link), so both always show
// the same form. Expects SUPABASE_URL and SUPABASE_ANON to be defined by the page.
/**
 * Self-contained embed snippet (inline styles/script, no external
 * dependencies) for this instructor's own enquiry form — drops into any
 * external website's HTML/embed block. Posts straight to
 * submit_website_enquiry with THIS instructor's own id (not the school's),
 * so leads land on their account specifically, same as the mobile app's
 * EnquiryWidgetView. Ported here since getting your own website embed code
 * is desk-based account setup, not something you'd do mid-lesson on your
 * phone — matches Branding/Billing/Teams already living in the Control
 * Centre rather than the app.
 */
function buildEnquirySnippet(instructorId, schoolId, opts){
  // opts.page: used by enquiry-form.html, which draws its own header and footer. Pasted into a website, the
  // form carries its own: "Form provided by Drive My Way" always, and without Premium a Drive My Way header
  // "on behalf of" the instructor or driving school (Dale, 15 Sep 2026).
  const page = !!(opts && opts.page);
  // schoolId set = the school-wide variant: enquiries land unassigned for
  // the admin to hand out; otherwise leads go straight to instructorId.
  // Working hours and the gearbox message always come from the generating
  // instructor's own settings, fetched live — changing either later
  // updates every already-pasted widget without re-embedding.
  const targetLine = schoolId
    ? 'school_id: "' + schoolId + '"'
    : 'instructor_id: "' + instructorId + '"';
  return `<!-- Drive My Way enquiry widget — paste into your website's HTML/embed block -->
<div id="dmw-enquiry-widget" style="max-width:440px;font-family:system-ui,sans-serif">
  <style>
    #dmw-enquiry-widget label{display:block;font-size:13px;font-weight:600;margin:8px 0 4px}
    #dmw-enquiry-widget input,#dmw-enquiry-widget textarea{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;box-sizing:border-box;font:inherit}
    #dmw-enquiry-widget .dmw-btn{width:100%;margin-top:12px;padding:12px;background:#0A4CA1;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:1em}
    #dmw-enquiry-widget .dmw-ghost{background:#fff;color:#334155;border:1px solid #cbd5e1}
    #dmw-enquiry-widget .dmw-day h4{margin:12px 0 6px;font-size:14px}
    #dmw-enquiry-widget .dmw-slots{display:flex;flex-wrap:wrap;gap:6px}
    #dmw-enquiry-widget .dmw-slot{padding:6px 10px;border:1px solid #cbd5e1;border-radius:999px;background:#fff;font-size:12px;cursor:pointer}
    #dmw-enquiry-widget .dmw-slot.on{background:#0A4CA1;color:#fff;border-color:#0A4CA1}
    #dmw-enquiry-widget .dmw-day-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:12px 0 6px}
    #dmw-enquiry-widget .dmw-day-head h4{margin:0}
    #dmw-enquiry-widget .dmw-all{display:block;width:100%;margin:6px 0 4px;padding:9px 10px;font-weight:700}
    #dmw-enquiry-widget .dmw-note{font-size:12px;color:#64748b;margin:6px 0}
    #dmw-enquiry-widget .dmw-warn{font-size:12px;color:#7b341e;background:#fffaf0;border-left:3px solid #dd6b20;padding:8px 10px;border-radius:0 6px 6px 0;margin:6px 0}
    #dmw-enquiry-widget .dmw-sum{font-size:13px;margin:4px 0}
    #dmw-enquiry-widget .dmw-gears{display:flex;gap:8px}
    #dmw-enquiry-widget .dmw-gear{flex:1;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font:inherit;font-weight:600;cursor:pointer}
    #dmw-enquiry-widget .dmw-gear.on{background:#0A4CA1;color:#fff;border-color:#0A4CA1}
    #dmw-enquiry-widget .dmw-gears.dmw-invalid .dmw-gear{border-color:#ef4444;background:#fef2f2}
    #dmw-enquiry-widget h2{font-size:1.35rem;color:#062F63;margin:0 0 4px}
    #dmw-enquiry-widget .dmw-sub{color:#64748b;font-size:.9rem;margin:0 0 14px}
    #dmw-enquiry-widget .dmw-steps{display:flex;gap:6px;margin-bottom:16px}
    #dmw-enquiry-widget .dmw-steps i{flex:1;height:4px;border-radius:99px;background:#e2e8f0}
    #dmw-enquiry-widget .dmw-steps i.on{background:#0A4CA1}
    #dmw-enquiry-widget input.dmw-invalid{border-color:#ef4444;background:#fef2f2}
    #dmw-enquiry-widget .dmw-brand{text-align:center;margin:0 0 14px}
    #dmw-enquiry-widget .dmw-brand img{display:block;height:48px;width:auto;max-width:200px;margin:0 auto 6px}
    #dmw-enquiry-widget .dmw-brand strong{display:block;color:#062F63;font-size:1.05rem}
    #dmw-enquiry-widget .dmw-brand span{display:block;color:#64748b;font-size:.85rem}
    #dmw-enquiry-widget .dmw-foot{text-align:center;font-size:11px;color:#94a3b8;margin:16px 0 0}
    #dmw-enquiry-widget .dmw-foot a{color:#64748b}
  </style>
${page ? "" : `
  <div class="dmw-brand" id="dmw-brand" style="display:none"></div>`}
  <h2>Enquiry</h2>
  <p class="dmw-sub">Takes about a minute — three short steps.</p>
  <div class="dmw-steps"><i class="on" id="dmw-s1"></i><i id="dmw-s2"></i><i id="dmw-s3"></i></div>

  <div id="dmw-p1">
    <div id="dmw-gearbox-warn" class="dmw-warn" style="display:none"></div>
    <div id="dmw-gearbox-pick" style="display:none">
      <label>Manual or automatic lessons? *</label>
      <div class="dmw-gears" id="dmw-gears">
        <button type="button" class="dmw-gear" data-gear="manual">Manual</button>
        <button type="button" class="dmw-gear" data-gear="automatic">Automatic</button>
      </div>
    </div>
    <label>First name *</label><input id="dmw-fn" autocomplete="given-name" />
    <label>Last name *</label><input id="dmw-ln" autocomplete="family-name" />
    <label>Phone *</label><input id="dmw-phone" type="tel" autocomplete="tel" />
    <label>Email *</label><input id="dmw-email" type="email" autocomplete="email" />
    <label>Date of birth *</label><input id="dmw-dob" type="date" autocomplete="bday" />
    <label>Address line 1 *</label><input id="dmw-a1" autocomplete="address-line1" />
    <label>Address line 2</label><input id="dmw-a2" autocomplete="address-line2" />
    <label>City / town</label><input id="dmw-city" autocomplete="address-level2" />
    <label>Postcode *</label><input id="dmw-pc" autocomplete="postal-code" />
    <div id="dmw-err1" style="color:#b91c1c;font-size:13px;margin-top:8px;display:none"></div>
    <button type="button" class="dmw-btn" id="dmw-next1">Next — availability</button>
  </div>

  <div id="dmw-p2" style="display:none">
    <p class="dmw-note">Tap the times you can do lessons around any other commitments such as work or education.</p>
    <p class="dmw-warn">If you can't see a day or time that works for you here, unfortunately we're unable to accommodate you at this time.</p>
    <div id="dmw-avail"></div>
    <div id="dmw-err2" style="color:#b91c1c;font-size:13px;margin-top:8px;display:none"></div>
    <button type="button" class="dmw-btn dmw-ghost" id="dmw-back2">Back</button>
    <button type="button" class="dmw-btn" id="dmw-next2">Next — summary</button>
  </div>

  <div id="dmw-p3" style="display:none">
    <div id="dmw-summary"></div>
    <label>Anything else? (optional)</label>
    <textarea id="dmw-notes" rows="3"></textarea>
    <label>Choose a password for the Drive My Way app *</label><input id="dmw-pw1" type="password" autocomplete="new-password" />
    <label>Type your password again *</label><input id="dmw-pw2" type="password" autocomplete="new-password" />
    <p class="dmw-note">Once you've confirmed your email address, you'll sign in to the app with your email and this password.</p>
    <div id="dmw-err3" style="color:#b91c1c;font-size:13px;margin-top:8px;display:none"></div>
    <button type="button" class="dmw-btn dmw-ghost" id="dmw-back3">Back</button>
    <button type="button" class="dmw-btn" id="dmw-submit">Send enquiry</button>
  </div>

  <div id="dmw-done" style="display:none;padding:20px 0">
    <p style="font-weight:700;text-align:center;margin:0 0 14px 0">Thank you — your enquiry has been sent.</p>
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-left:4px solid #059669;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-bottom:14px">
      <strong>What happens next</strong><br>
      1. We're emailing you a link to confirm your email address. Tap it (check spam if it doesn't arrive within a few minutes).<br>
      2. Download the Drive My Way app on your phone (App Store or Google Play) and sign in with your email and the password you chose.<br>
      3. The app shows the live status of your enquiry — you'll see there as soon as it's been reviewed and accepted, and you'll get updates and messages from your instructor in the same place.
    </div>
    <label>Email</label>
    <input id="dmw-signup-email" type="email" readonly style="background:#f8fafc" />
    <div id="dmw-signup-err" style="color:#b91c1c;font-size:13px;margin-top:8px;display:none"></div>
    <div id="dmw-signup-ok" style="background:#ecfdf5;border:1px solid #a7f3d0;border-left:4px solid #059669;border-radius:8px;padding:12px;font-size:13px;color:#065f46;margin-top:10px;display:none"></div>
    <button type="button" class="dmw-btn" id="dmw-signup-btn">Resend confirmation email</button>
    <p style="font-size:12px;color:#64748b;text-align:center;margin:6px 0 14px 0">The email is sent automatically. Use this button only if it hasn't arrived.</p>
    <a href="https://apps.apple.com/gb/app/dmw-drive-my-way/id6803682508" target="_blank" rel="noopener" style="display:block;text-align:center;padding:14px 18px;background:#0A4CA1;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;margin-bottom:8px">📱 Get the app on the App Store (iPhone)</a>
    <a href="https://play.google.com/store/apps/details?id=uk.co.dmwdrivingschool.instructor" target="_blank" rel="noopener" style="display:block;text-align:center;padding:14px 18px;background:#0A4CA1;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">📱 Get the app on Google Play (Android)</a>
  </div>${page ? "" : `
  <p class="dmw-foot">Form provided by <a href="https://drivemyway.co.uk" target="_blank" rel="noopener">Drive My Way</a></p>`}
</div>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"><\/script>
<script>
(function () {
  var SUPABASE_URL = "${SUPABASE_URL}";
  var SUPABASE_KEY = "${SUPABASE_ANON}";
  var HOURS_OWNER_ID = "${instructorId}";
  var APP_CHANGE_PASSWORD_URL = "https://web.drivemyway.co.uk/admin.html";
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  var SCHOOL_ID = ${schoolId ? `"${schoolId}"` : "null"};

  // Header: without Premium, the Drive My Way logo and "on behalf of" the instructor or driving school. With
  // Premium (or if the check doesn't answer) the form looks as it always has.
  if (document.getElementById("dmw-brand")) {
    sb.rpc("enquiry_form_info", { p_instructor: HOURS_OWNER_ID, p_school: SCHOOL_ID }).then(function (r) {
      var d = r && r.data;
      if (!d || d.premium !== false || !d.name) return;
      var who = d.kind === "instructor" && d.school ? d.name + " at " + d.school : d.name;
      var safe = String(who).replace(/[&<>"']/g, function (c) { return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]; });
      var box = document.getElementById("dmw-brand");
      box.innerHTML = '<img src="https://web.drivemyway.co.uk/drive-my-way-logo.png" alt=""><strong>Drive My Way<\\/strong><span>on behalf of ' + safe + '<\\/span>';
      box.style.display = "block";
    }, function () {});
  }
  var enquiryEmail = "";
  var enquiryFirstName = "";
  var enquiryLastName = "";

  var ALL_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  var DAYS = ALL_DAYS.slice();
  var availability = {};
  // Gearbox (Dale, 16 Sep 2026): an instructor who teaches both lets the pupil choose; manual only / automatic only sends that.
  var gearboxMode = "both";
  var gearbox = "";
  ALL_DAYS.forEach(function (d) { availability[d] = []; });
  var workHours = { start: "09:00", end: "20:00", days: { Monday:true,Tuesday:true,Wednesday:true,Thursday:true,Friday:true,Saturday:false,Sunday:false } };

  function el(id) { return document.getElementById(id); }
  function val(id) { return el(id).value.trim(); }
  function toMinutes(hhmm) { var p = String(hhmm || "09:00").split(":"); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); }
  // Strict "HH:mm" to minutes, NaN if it isn't a time (no regex: this code sits inside a template string).
  function timeMin(t) {
    var p = String(t == null ? "" : t).split(":");
    if (p.length < 2 || p[0] === "" || p[1] === "") return NaN;
    var h = Number(p[0]), m = Number(p[1].slice(0, 2));
    return isNaN(h) || isNaN(m) ? NaN : h * 60 + m;
  }
  function slotsFromHours(start, end) {
    var out = [];
    for (var m = toMinutes(start); m < toMinutes(end); m += 30) {
      out.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));
    }
    return out.length ? out : ["09:00"];
  }
  // Each day has its own hours (Dale, 16 Sep 2026): perDay[day] when it's there and start < end, otherwise the overall start/end.
  function daySlots(day) {
    var p = workHours.perDay && typeof workHours.perDay === "object" ? workHours.perDay[day] : null;
    if (p && timeMin(p.start) < timeMin(p.end)) return slotsFromHours(p.start, p.end);
    return slotsFromHours(workHours.start, workHours.end);
  }

  function buildAvail() {
    var root = el("dmw-avail");
    root.innerHTML = "";
    var slotsByDay = {};
    var flags = workHours.days || {};
    DAYS = ALL_DAYS.filter(function (d) { return flags[d] !== false; });
    if (!DAYS.length) DAYS = ALL_DAYS.slice(0, 5);
    DAYS.forEach(function (d) { slotsByDay[d] = daySlots(d); });
    function hasAll(day) { return slotsByDay[day].every(function (t) { return (availability[day] || []).indexOf(t) >= 0; }); }
    // "All" buttons (Dale, 14 Sep 2026): every day and time at once, or a whole day. Pressing again clears.
    var everything = DAYS.every(hasAll);
    var allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "dmw-slot dmw-all" + (everything ? " on" : "");
    allBtn.textContent = everything ? "Clear all" : "Select all days and times";
    allBtn.onclick = function () { DAYS.forEach(function (d) { availability[d] = everything ? [] : slotsByDay[d].slice(); }); buildAvail(); };
    root.appendChild(allBtn);
    DAYS.forEach(function (day) {
      var list = slotsByDay[day];
      if (!availability[day]) availability[day] = [];
      var div = document.createElement("div");
      div.className = "dmw-day";
      var head = document.createElement("div");
      head.className = "dmw-day-head";
      var h4 = document.createElement("h4");
      h4.textContent = day;
      var full = hasAll(day);
      var dayBtn = document.createElement("button");
      dayBtn.type = "button";
      dayBtn.className = "dmw-slot" + (full ? " on" : "");
      dayBtn.textContent = full ? "Clear" : "All";
      dayBtn.onclick = function () { availability[day] = full ? [] : list.slice(); buildAvail(); };
      head.appendChild(h4);
      head.appendChild(dayBtn);
      div.appendChild(head);
      var row = document.createElement("div");
      row.className = "dmw-slots";
      list.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "dmw-slot" + (availability[day].indexOf(t) >= 0 ? " on" : "");
        b.textContent = t;
        b.onclick = function () {
          var arr = availability[day];
          var i = arr.indexOf(t);
          if (i >= 0) arr.splice(i, 1); else arr.push(t);
          arr.sort();
          buildAvail();
        };
        row.appendChild(b);
      });
      div.appendChild(row);
      root.appendChild(div);
    });
  }

  // This instructor's synced working hours drive the slot grid.
  fetch(SUPABASE_URL + "/rest/v1/app_settings?owner_id=eq." + HOURS_OWNER_ID + "&id=eq.working_hours&select=value", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
  }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
    if (rows && rows[0] && rows[0].value) {
      var v = rows[0].value;
      workHours = { start: v.start || workHours.start, end: v.end || workHours.end, days: Object.assign({}, workHours.days, v.days || {}), perDay: v.perDay || null };
    }
  }).catch(function () {}).then(buildAvail);

  // Gearbox message — set in the Control Centre's "Your enquiry form"
  // panel: manual only, automatic only, or nothing (teaches both).
  fetch(SUPABASE_URL + "/rest/v1/app_settings?owner_id=eq." + HOURS_OWNER_ID + "&id=eq.enquiry_gearbox&select=value", {
    headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
  }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
    var mode = rows && rows[0] && rows[0].value && rows[0].value.mode;
    var warn = el("dmw-gearbox-warn");
    gearboxMode = mode === "manual" || mode === "auto" ? mode : "both";
    el("dmw-gearbox-pick").style.display = gearboxMode === "both" ? "block" : "none";
    if (mode === "manual") {
      warn.innerHTML = "<strong>Manual only.<\\/strong> I only teach in a manual car. Automatic lessons are not available.";
      warn.style.display = "block";
    } else if (mode === "auto") {
      warn.innerHTML = "<strong>Automatic only.<\\/strong> I only teach in an automatic car. Manual lessons are not available.";
      warn.style.display = "block";
    }
  }).catch(function () { el("dmw-gearbox-pick").style.display = "block"; });

  Array.prototype.forEach.call(document.querySelectorAll("#dmw-gears .dmw-gear"), function (b) {
    b.addEventListener("click", function () {
      gearbox = b.getAttribute("data-gear");
      Array.prototype.forEach.call(document.querySelectorAll("#dmw-gears .dmw-gear"), function (x) {
        x.className = "dmw-gear" + (x === b ? " on" : "");
      });
      el("dmw-gears").classList.remove("dmw-invalid");
    });
  });
  function chosenGearbox() {
    return gearboxMode === "manual" ? "manual" : gearboxMode === "auto" ? "automatic" : gearbox;
  }

  function show(page) {
    ["dmw-p1","dmw-p2","dmw-p3"].forEach(function (id, i) { el(id).style.display = i === page - 1 ? "block" : "none"; });
    ["dmw-s1","dmw-s2","dmw-s3"].forEach(function (id, i) { el(id).className = i < page ? "on" : ""; });
    try { el("dmw-enquiry-widget").scrollIntoView({ block: "start" }); } catch (e) {}
  }

  el("dmw-next1").addEventListener("click", function () {
    var err = el("dmw-err1");
    err.style.display = "none";
    var required = ["dmw-fn","dmw-ln","dmw-phone","dmw-email","dmw-dob","dmw-a1","dmw-pc"];
    var missing = false;
    required.forEach(function (id) {
      var bad = !el(id).value.trim();
      el(id).classList.toggle("dmw-invalid", bad);
      if (bad) missing = true;
    });
    var gearMissing = !chosenGearbox() && el("dmw-gearbox-pick").style.display !== "none";
    el("dmw-gears").classList.toggle("dmw-invalid", gearMissing);
    if (gearMissing) missing = true;
    if (missing) {
      err.textContent = "Please fill in the highlighted required fields.";
      err.style.display = "block";
      return;
    }
    show(2);
  });
  el("dmw-back2").addEventListener("click", function () { show(1); });
  el("dmw-next2").addEventListener("click", function () {
    var err = el("dmw-err2");
    err.style.display = "none";
    var any = DAYS.some(function (d) { return (availability[d] || []).length > 0; });
    if (!any) {
      err.textContent = "Please select at least one day and time you're available.";
      err.style.display = "block";
      return;
    }
    var availText = DAYS.filter(function (d) { return availability[d].length; })
      .map(function (d) { return d + ": " + availability[d].join(", "); }).join(" · ");
    el("dmw-summary").innerHTML = [
      ["Name", val("dmw-fn") + " " + val("dmw-ln")],
      ["Phone", val("dmw-phone")],
      ["Email", val("dmw-email")],
      ["Date of birth", el("dmw-dob").value],
      ["Lessons", chosenGearbox() === "automatic" ? "Automatic" : "Manual"],
      ["Address", [val("dmw-a1"), val("dmw-a2"), val("dmw-city"), val("dmw-pc")].filter(Boolean).join(", ")],
      ["Availability", availText],
    ].map(function (kv) {
      var safe = String(kv[1]).replace(/[&<>"']/g, function (c) { return { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]; });
      return '<div class="dmw-sum"><strong>' + kv[0] + ':<\\/strong> ' + safe + '<\\/div>';
    }).join("");
    show(3);
  });
  el("dmw-back3").addEventListener("click", function () { show(2); });

  el("dmw-submit").addEventListener("click", function () {
    var err = el("dmw-err3");
    err.style.display = "none";
    // The pupil chooses their app password here, before the one Send enquiry button (Dale, 14 Sep 2026).
    var pw1 = el("dmw-pw1").value, pw2 = el("dmw-pw2").value;
    el("dmw-pw1").classList.toggle("dmw-invalid", pw1.length < 8);
    el("dmw-pw2").classList.toggle("dmw-invalid", pw1.length >= 8 && pw1 !== pw2);
    if (pw1.length < 8 || pw1 !== pw2) {
      err.textContent = pw1.length < 8 ? "Please choose a password with at least 8 characters." : "The two passwords do not match.";
      err.style.display = "block";
      return;
    }
    var payloadAvail = {};
    DAYS.forEach(function (d) { if (availability[d].length) payloadAvail[d] = availability[d]; });
    fetch(SUPABASE_URL + "/rest/v1/rpc/submit_website_enquiry", {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          first_name: val("dmw-fn"),
          last_name: val("dmw-ln"),
          phone: val("dmw-phone"),
          email: val("dmw-email"),
          dob: el("dmw-dob").value,
          address_line1: val("dmw-a1"),
          address_line2: val("dmw-a2") || null,
          city: val("dmw-city") || null,
          postcode: val("dmw-pc"),
          availability: payloadAvail,
          preferred_gearbox: chosenGearbox() || "manual",
          notes: val("dmw-notes") || null
        },
        ${targetLine}
      })
    }).then(function (res) {
      if (!res.ok) throw new Error("submit failed");
      enquiryEmail = val("dmw-email");
      enquiryFirstName = val("dmw-fn");
      enquiryLastName = val("dmw-ln");
      el("dmw-p3").style.display = "none";
      el("dmw-done").style.display = "block";
      el("dmw-signup-email").value = enquiryEmail;
      if (enquiryEmail) createLogin();
    }).catch(function () {
      err.textContent = "Could not send right now — please try again or contact us directly.";
      err.style.display = "block";
    });
  });

  // The pupil's app login, with the password they chose on the form (Dale, 14 Sep 2026). With "Confirm email" on,
  // Supabase sends the confirm-your-email email itself, and that's the only email: its link lands on the Control
  // Centre, which tells pupils to open the app and sign in.
  function createLogin() {
    var errEl = el("dmw-signup-err"), okEl = el("dmw-signup-ok"), btn = el("dmw-signup-btn");
    errEl.style.display = "none";
    okEl.style.display = "none";
    var email = enquiryEmail, password = el("dmw-pw1").value;
    var safeEmail = email.replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; });
    return sb.auth.signUp({
      email: email,
      password: password,
      options: { emailRedirectTo: APP_CHANGE_PASSWORD_URL, data: { full_name: (enquiryFirstName + ' ' + enquiryLastName).trim(), role: 'pupil' } }
    }).then(function (result) {
      el("dmw-pw1").value = "";
      el("dmw-pw2").value = "";
      var error = result.error, data = result.data;
      // An address that already has a login: Supabase sends nothing and returns no identities.
      var existing = (error && /already|registered|exists/i.test(error.message || '')) ||
        (!error && data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0);
      if (existing) {
        okEl.innerHTML = 'You already have a Drive My Way login with <strong>' + safeEmail + '<\\/strong>. Sign in to the app with your existing password, or tap Forgot password on the app sign-in screen.';
        okEl.style.display = 'block';
        btn.style.display = 'none';
        return;
      }
      if (error) throw error;
      okEl.innerHTML = (data && data.user && data.user.email_confirmed_at)
        ? 'Your login is ready. Sign in to the app with <strong>' + safeEmail + '<\\/strong> and the password you chose.'
        : 'Check your email at <strong>' + safeEmail + '<\\/strong> and tap the link to confirm your address. Then sign in to the app with your email and the password you chose.';
      okEl.style.display = 'block';
    }).catch(function (e) {
      errEl.textContent = 'Your enquiry was sent, but your app login could not be set up just now' + (e && e.message ? ' (' + e.message + ')' : '') + '. Your instructor can set it up for you.';
      errEl.style.display = 'block';
      btn.style.display = 'none';
    });
  }

  // Sends the confirm-your-email email again.
  el("dmw-signup-btn").addEventListener("click", function () {
    var errEl = el("dmw-signup-err"), okEl = el("dmw-signup-ok"), btn = el("dmw-signup-btn");
    errEl.style.display = "none";
    btn.disabled = true;
    sb.auth.resend({ type: 'signup', email: enquiryEmail, options: { emailRedirectTo: APP_CHANGE_PASSWORD_URL } }).then(function (r) {
      if (r && r.error) throw r.error;
      okEl.textContent = 'Sent again to ' + enquiryEmail + '. Check your spam folder too.';
      okEl.style.display = 'block';
    }).catch(function (e) {
      var m = (e && e.message) || '';
      errEl.textContent = /seconds|rate/i.test(m) ? 'Please wait a minute before sending it again.' : 'Could not send it again just now. ' + m;
      errEl.style.display = 'block';
    }).then(function () { btn.disabled = false; });
  });
})();
<\/script>`;
}
