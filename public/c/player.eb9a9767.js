const I=[.5,.75,1,1.25,1.5,2];var ot=n=>function(Q,s,k){const{t:a,ic:r,esc:f,fmt:M,haptic:S,wordKey:j}=n,l=n.S,K=l.settings.lang,O=k.gl||{},d=s.sec,V=k.text.split(/\n\s*\n/).map(t=>t.trim()).filter(Boolean);let c=Math.min(l.progress[s.id]||0,Math.max(0,d-5)),p=!1,g=!1,u=!1,q=null,F=0,E=null,m=null;Q.innerHTML=`<div class="player" id="pl" style="background:${s.c||"#000"}">
      ${n.pic(s,!1,'class="bg kenburns" decoding="async"')}
      <div class="shade"></div>
      <div class="pv" id="pv"><div class="pt" id="pt">${V.map((t,e)=>`<p>${t.split(/\s+/).map(o=>o.split(/(?<=-)/).map(v=>`<span class="w" data-p="${e}">${f(v)}</span>`).join("")).join(" ")}</p>`).join("")}</div></div>
      <div class="pl-top" id="ptop">
        <button class="rb" data-pa="close" aria-label="${a("back")}">${r("x")}</button>
        <p>${f(s.title)}</p>
        <button class="rb ${l.liked.includes(s.id)?"liked":""}" data-pa="like" id="plike">${r("heart")}</button>
      </div>
      <div class="pl-bottom hide" id="pbot">
        <div class="pbar" id="pbar"><i id="pfill"></i></div>
        <div class="prow"><span id="pclock"></span>
          <button class="pplay" data-pa="toggle" id="ptoggle">${r("play")}</button>
          <span class="pspeed"><button data-pa="speed"><b id="pspeed">${l.settings.speed}x</b></button></span></div>
      </div>
      <div id="ppop"></div>
      <div id="pover"></div>
    </div>`;const i=t=>document.getElementById(t),Y=i("pl"),b=i("pv"),A=i("pt"),_=i("pfill"),U=i("pclock"),w=i("ppop"),C=i("pover");let W=-1,P=b.clientHeight,X=A.scrollHeight;const z=()=>{P=b.clientHeight,X=A.scrollHeight};addEventListener("resize",z);const T=t=>{const e=n.tg;try{n.inTg&&e&&n.tgAtLeast("8.0")?(t&&!e.isFullscreen&&e.requestFullscreen(),!t&&e.isFullscreen&&e.exitFullscreen()):t?document.documentElement.requestFullscreen?.().catch(()=>{}):document.fullscreenElement&&document.exitFullscreen().catch(()=>{})}catch{}},L=()=>{l.progress[s.id]=Math.floor(c),n.save()};function x(){i("ptop").classList.remove("hide"),g&&i("pbot").classList.remove("hide"),clearTimeout(F),F=setTimeout(()=>{p&&(i("ptop").classList.add("hide"),i("pbot").classList.add("hide"))},2500)}function h(t){p=t,i("ptoggle").innerHTML=r(t?"pause":"play"),x(),t?navigator.wakeLock?.request("screen").then(e=>E=e,()=>{}):(E?.release().catch(()=>{}),E=null,L())}function H(){if(g&&!u)return void(C.innerHTML="");if(u){C.innerHTML=`<div class="over">
          <h1>${a("finished")}</h1>
          <p class="sub">${a("testInvite",k.quiz.length)}</p>
          <button class="btn primary test-cta" data-pa="test">${r("target")} ${a("startTest")}</button>
          <div class="btns"><button class="btn glass" data-pa="replay">${r("rotate")} ${a("replay")}</button><button class="btn glass" data-pa="close">${a("back")}</button></div>
        </div>`;return}const t=k.tr?.title;C.innerHTML=`<div class="over">
        <h1>${f(s.title)}</h1>
        ${t?`<p class="sub" style="margin-top:-6px;font-size:1.1rem">${f(t)}</p>`:""}
        ${n.levelBadge(s.level)}
        ${s.d?`<p class="sub">${f(s.d)}</p>`:""}
        <p class="small">${M(d)} \xB7 ${a("holdHint")}</p>
        <div class="btns">
          <button class="btn primary" data-pa="start" style="padding:14px 32px">${r("play","fill")} ${c>1?a("resume"):a("start")}</button>
          ${n.testOpen(s.id)?`<button class="btn glass" data-pa="test">${r("target")} ${a("test")}</button>`:""}
          <button class="btn glass" data-pa="close">${a("back")}</button>
        </div>
      </div>`}function N(){c>=d&&(c=0),u=!1,g=!0,T(!0),H(),h(!0),setTimeout(z,300)}function tt(){p=!1,u=!0,c=d,i("ptoggle").innerHTML=r("play"),l.progress[s.id]=d,l.watched[s.id]=Date.now(),n.save(),S("success"),y(!1),H()}let B=0,R=performance.now();const Z=t=>{const e=Math.min(.25,(t-R)/1e3);R=t,p&&(c=Math.min(d,c+e*l.settings.speed),c>=d&&tt());const o=c/d;A.style.transform=`translate3d(0,${P-o*(P+X)}px,0)`,_.style.transform=`scaleX(${o})`;const v=Math.floor(c);v!==W&&(W=v,U.textContent=`${M(c)} / ${M(d)}`),B=requestAnimationFrame(Z)};B=requestAnimationFrame(Z);const et=setInterval(()=>p&&L(),3e3);function st(t){const e=j(t.textContent);if(!e)return;m=e,b.querySelectorAll(".w.on").forEach($=>$.classList.remove("on")),b.querySelectorAll(".w").forEach($=>j($.textContent)===e&&$.classList.add("on"));const o=O[e]||O[e.replace(/(ing|ed|es|s)$/,"")]||null,v=k.tr?.paragraphs?.[Number(t.dataset.p)],D=l.words.some($=>$.w===e&&$.lang===K);w.innerHTML=`<div class="pop">
        <div class="word">${f(t.textContent.replace(/[^A-Za-z'’-]/g,""))}
          ${"speechSynthesis"in window?`<button data-pa="say" style="color:#0a7a43">${r("volume")}</button>`:""}</div>
        <p class="tr">${o?f(o):a("noTranslation")}</p>
        ${v?`<button class="para" data-pa="para"><b>${a("paragraphTranslation")}</b><span hidden>${f(v)}</span></button>`:""}
        <div class="acts">
          <button class="btn light" data-pa="saveword" ${!o||D?"disabled":""}>${r(D?"check":"bookmark")} ${a(D?"saved":"saveWord")}</button>
          <button class="btn dark" data-pa="resume">${r("play","fill")} ${a("resume")}</button>
        </div></div>`,w.dataset.text=o||"",S("select")}function y(t){w.innerHTML="",m=null,b.querySelectorAll(".w.on").forEach(e=>e.classList.remove("on")),t&&h(!0)}const at=t=>{const e=t.target.closest(".w");if(!e||!g||u)return;t.stopPropagation(),q={at:performance.now(),was:p},p&&h(!1),st(e);const o=()=>{removeEventListener("pointerup",o),removeEventListener("pointercancel",o);const v=q;q=null,v?.was&&performance.now()-v.at>=350&&y(!0)};addEventListener("pointerup",o),addEventListener("pointercancel",o)},nt=t=>{if(!(t.target.closest(".w")||!g||u)){if(m)return y(!0);p?x():h(!0)}};b.addEventListener("pointerdown",at),b.addEventListener("click",nt);const it={close(){L(),T(!1),n.back()},start:N,replay(){c=0,N()},test(){T(!1),n.go(`test/${s.id}`,!0)},toggle(){y(!1),u||h(!p)},like(){n.toggleLike(s.id),i("plike").classList.toggle("liked",l.liked.includes(s.id)),x()},speed(){const t=I.indexOf(l.settings.speed);l.settings.speed=I[(t+1)%I.length],n.save(),i("pspeed").textContent=`${l.settings.speed}x`,x()},resume:()=>y(!0),para(t){const e=t.querySelector("span");e.hidden=!e.hidden},say:()=>n.say(m),saveword(t){!m||!w.dataset.text||(l.words.unshift({w:m,tr:w.dataset.text,lang:K,f:s.id,at:Date.now()}),n.save(),t.disabled=!0,t.innerHTML=`${r("check")} ${a("saved")}`,S("success"))}};Y.addEventListener("click",t=>{const e=t.target.closest("[data-pa]");e&&(t.stopPropagation(),it[e.dataset.pa]?.(e))}),i("pbar").addEventListener("click",t=>{const e=t.currentTarget.getBoundingClientRect();c=Math.max(0,Math.min(d-.5,(t.clientX-e.left)/e.width*d)),u&&(u=!1,H()),x()});const G=()=>document.hidden&&p&&h(!1);document.addEventListener("visibilitychange",G);const J=t=>{t.code==="Space"&&g&&!u&&(t.preventDefault(),y(!1),h(!p))};return addEventListener("keydown",J),H(),()=>{cancelAnimationFrame(B),clearInterval(et),clearTimeout(F),E?.release().catch(()=>{}),removeEventListener("resize",z),document.removeEventListener("visibilitychange",G),removeEventListener("keydown",J),g&&L(),T(!1)}};export{ot as default};
