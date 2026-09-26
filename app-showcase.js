/**
 * The Drive My Way app section, built once and used in two places (Dale, 26 Sep 2026).
 *
 * The Control Centre offers it as an embed for an instructor's existing website, and every
 * DMW-built site renders it automatically — it is our block, not theirs to add or get wrong.
 * Shared rather than copied so the two cannot drift; a second copy would be identical on the day
 * it was written and different a month later.
 *
 * `premium` controls the theory and hazard perception line and the third screenshot, because an
 * instructor on Basic should not be advertising something their pupils do not get.
 */
function escAppShowcase(t){
  return String(t == null ? "" : t).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function buildAppShowcaseSnippet(name, premium){
  const IMG="https://web.drivemyway.co.uk/app-screenshots/";
  const owner=name ? escAppShowcase(name)+(/s$/i.test(name)?"'":"'s") : "";
  const intro=(owner ? `${owner} pupils use` : "Our pupils use")+" the free Drive My Way app. Once you start lessons, you get your own login.";
  const item=(ico,title,text)=>`        <li><div class="dmw-ico">${ico}</div><div><b>${title}</b><span>${text}</span></div></li>`;
  const items=[
    item("🚗","See when your instructor is on the way","Get a message with their arrival time when they set off, and see them on the map once they're close."),
    item("📅","Your lessons in one place","Upcoming lessons, free slots you can book, and your lesson credit."),
    item("💬","Message your instructor","Questions, changes and photos, all in the app."),
    item("📈","Track your progress","See how each skill is coming on and keep your reflective logs.")
  ];
  if(premium) items.push(item("🧠","Theory and hazard perception practice","Practice questions, hazard perception clips and learning videos."));
  const third=premium ? ["pupil-theory-practice.jpg","Theory test practice in the app"] : ["pupil-messages.jpg","Messages with your instructor in the app"];
  return `<!-- Drive My Way app for pupils: paste into your website's HTML or embed block -->
<div id="dmw-app-showcase" style="max-width:780px;margin:0 auto;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;text-align:left">
  <style>
    #dmw-app-showcase *{box-sizing:border-box}
    #dmw-app-showcase .dmw-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;box-shadow:0 2px 10px rgba(15,23,42,.06)}
    #dmw-app-showcase h2{margin:0 0 6px;font-size:1.5rem;line-height:1.25;color:#062F63}
    #dmw-app-showcase .dmw-intro{margin:0 0 18px;color:#475569;font-size:1rem;line-height:1.5}
    #dmw-app-showcase .dmw-row{display:flex;flex-wrap:wrap;gap:22px;align-items:center}
    #dmw-app-showcase .dmw-phones{display:flex;gap:10px;flex:1 1 280px;justify-content:center}
    #dmw-app-showcase .dmw-phones img{width:31%;max-width:130px;height:auto;border-radius:14px;border:3px solid #0f172a;background:#0f172a;display:block}
    #dmw-app-showcase ul{list-style:none;margin:0;padding:0;flex:1 1 280px}
    #dmw-app-showcase li{display:flex;gap:10px;margin:0 0 12px;font-size:.97rem;line-height:1.45}
    #dmw-app-showcase li b{display:block;color:#0f172a}
    #dmw-app-showcase li span{color:#475569}
    #dmw-app-showcase .dmw-ico{flex:0 0 32px;height:32px;border-radius:9px;background:#e8f0fb;display:flex;align-items:center;justify-content:center;font-size:17px}
    #dmw-app-showcase .dmw-badges{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;margin:20px 0 6px}
    #dmw-app-showcase .dmw-badges a{display:inline-flex}
    #dmw-app-showcase .dmw-badges img{height:46px;width:auto;display:block}
    #dmw-app-showcase .dmw-note{text-align:center;color:#64748b;font-size:.85rem;margin:6px 0 0}
    #dmw-app-showcase .dmw-small{text-align:center;font-size:.7rem;margin:12px 0 0;color:#94a3b8;line-height:1.4}
    #dmw-app-showcase .dmw-small a{color:#64748b}
  </style>
  <div class="dmw-card">
    <h2>Your lessons, in one app</h2>
    <p class="dmw-intro">${intro}</p>
    <div class="dmw-row">
      <div class="dmw-phones">
        <img src="${IMG}pupil-tracking-map.jpg" alt="Live map showing the instructor on the way" loading="lazy">
        <img src="${IMG}pupil-home-lessons.jpg" alt="Upcoming lessons in the app" loading="lazy">
        <img src="${IMG}${third[0]}" alt="${third[1]}" loading="lazy">
      </div>
      <ul>
${items.join("\n")}
      </ul>
    </div>
    <div class="dmw-badges">
      <a href="https://play.google.com/store/apps/details?id=uk.co.dmwdrivingschool.instructor" target="_blank" rel="noopener"><img src="${IMG}google-play-badge-trimmed.png" alt="Get it on Google Play"></a>
      <a href="https://apps.apple.com/gb/app/dmw-drive-my-way/id6803682508" target="_blank" rel="noopener"><img src="${IMG}app-store-badge.svg" alt="Download on the App Store"></a>
    </div>
    <p class="dmw-note">Free for pupils on iPhone and Android.</p>
    <p class="dmw-small">Powered by <a href="https://drivemyway.co.uk" target="_blank" rel="noopener">Drive My Way</a>. Apple and the Apple logo are trademarks of Apple Inc. Google Play and the Google Play logo are trademarks of Google LLC.</p>
  </div>
</div>`;
}
