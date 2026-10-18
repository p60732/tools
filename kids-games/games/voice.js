/* 幼兒遊戲共用語音
   播放順序:大人錄的聲音(存在這台裝置的 IndexedDB)→ 預先做好的台灣口音音檔(voice/manifest.json)→ 系統語音。
   用法:KV.say('句子',{onend}),KV.stop()。錄音用 KV.rec.* */
(function(){
  const base=new URL('../voice/',document.currentScript?document.currentScript.src:location.href).href;
  const DBN='kidsVoice',ST='clips';
  let dbp=null;
  function db(){if(!dbp)dbp=new Promise((ok,no)=>{try{const r=indexedDB.open(DBN,1);r.onupgradeneeded=()=>r.result.createObjectStore(ST);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}catch(e){no(e)}});return dbp}
  function tx(mode,fn){return db().then(d=>new Promise((ok,no)=>{const t=d.transaction(ST,mode),s=t.objectStore(ST),r=fn(s);t.oncomplete=()=>ok(r&&r.result);t.onerror=()=>no(t.error)}))}
  const store={get:k=>tx('readonly',s=>s.get(k)).catch(()=>null),put:(k,v)=>tx('readwrite',s=>s.put(v,k)),del:k=>tx('readwrite',s=>s.delete(k)),keys:()=>tx('readonly',s=>s.getAllKeys()).catch(()=>[])};

  let man=null;const manP=fetch(base+'manifest.json').then(r=>r.ok?r.json():{}).then(m=>man=m||{}).catch(()=>man={});

  // 播放用 AudioContext(第一次碰螢幕時解鎖;iPhone 靜音開關下也能播)
  let ac=null;
  function ctx(){if(!ac){try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch(e){}try{ac=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}}if(ac&&ac.state==='suspended')ac.resume();return ac}
  let sp=false;addEventListener('pointerdown',()=>{ctx();if(!sp){sp=true;try{const u=new SpeechSynthesisUtterance(' ');u.volume=0;speechSynthesis.speak(u)}catch(e){}}},{capture:true});

  // 系統語音:優先台灣口音
  let twV=null;
  function pickV(){try{const vs=speechSynthesis.getVoices().filter(v=>/zh[-_]TW/i.test(v.lang));twV=vs.find(v=>/mei-?jia|美佳/i.test(v.name))||vs.find(v=>/hanhan|hsiaochen|hsiaoyu|yating|zhiwei|台灣|臺灣/i.test(v.name))||vs[0]||null}catch(e){}}
  try{pickV();speechSynthesis.addEventListener('voiceschanged',pickV)}catch(e){}

  let seq=0,src=null,endCb=null;
  function stop(){seq++;try{speechSynthesis.cancel()}catch(e){}if(src){try{src.onended=null;src.stop()}catch(e){}src=null}endCb=null}
  function done(id){if(id!==seq)return;const f=endCb;endCb=null;src=null;f&&f()}
  async function playBuf(ab,id){const c=ctx();if(!c)throw 0;const buf=await new Promise((ok,no)=>{const p=c.decodeAudioData(ab,ok,no);if(p&&p.catch)p.catch(no)});if(id!==seq)return;
    const s=c.createBufferSource(),g=c.createGain();g.gain.value=1;s.buffer=buf;s.connect(g).connect(c.destination);s.onended=()=>done(id);src=s;s.start()}
  function synth(t,id,o){try{const u=new SpeechSynthesisUtterance(t);u.lang='zh-TW';if(!twV)pickV();if(twV)u.voice=twV;u.rate=o.rate||1;u.pitch=o.pitch||1.25;u.onend=()=>done(id);u.onerror=()=>done(id);speechSynthesis.speak(u)}catch(e){done(id)}}
  async function say(t,o={}){stop();const id=seq;endCb=o.onend||null;t=String(t);
    try{const b=await store.get(t);if(id!==seq)return;if(b){await playBuf(await b.arrayBuffer(),id);return}}catch(e){if(id!==seq)return}
    if(!man)await manP;if(id!==seq)return;
    const f=man&&man[t];if(f){try{const r=await fetch(base+f);if(r.ok){await playBuf(await r.arrayBuffer(),id);return}}catch(e){}if(id!==seq)return}
    synth(t,id,o)}

  // 錄音
  const rec={st:null,mr:null,chunks:[],
    ok:()=>!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia&&window.MediaRecorder),
    async start(){stop();this.st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      const types=['audio/mp4','audio/webm;codecs=opus','audio/webm'];const mt=types.find(x=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(x));
      this.mr=new MediaRecorder(this.st,mt?{mimeType:mt}:undefined);this.chunks=[];this.mr.ondataavailable=e=>e.data&&e.data.size&&this.chunks.push(e.data);this.mr.start()},
    finish(key){return new Promise((ok,no)=>{const mr=this.mr;if(!mr)return no(new Error('not recording'));
      mr.onstop=async()=>{this.st&&this.st.getTracks().forEach(t=>t.stop());this.st=null;this.mr=null;const blob=new Blob(this.chunks,{type:mr.mimeType||'audio/mp4'});
        if(blob.size<800)return no(new Error('too short'));try{await store.put(key,blob);ok(blob)}catch(e){no(e)}};mr.stop()})},
    cancel(){try{this.mr&&this.mr.state!=='inactive'&&(this.mr.onstop=null,this.mr.stop())}catch(e){}this.st&&this.st.getTracks().forEach(t=>t.stop());this.st=null;this.mr=null},
    has:k=>store.get(k).then(b=>!!b),del:k=>store.del(k),keys:()=>store.keys()};
  window.KV={say,stop,rec,hasTTS:t=>manP.then(()=>!!(man&&man[t]))};
})();
