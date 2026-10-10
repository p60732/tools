const { chromium } = require('playwright');
(async()=>{
 const b = await chromium.launch(); const api = process.env.API;
 const ctx = await b.newContext({viewport:{width:375,height:740},deviceScaleFactor:2});
 await ctx.addInitScript(a=>{ if(!localStorage.getItem('tripnote.apiOverride')) localStorage.setItem('tripnote.apiOverride', JSON.stringify(a)); }, api);
 const p = await ctx.newPage(); await p.emulateMedia({reducedMotion:'reduce'});
 await p.goto('http://localhost:8765/trip/'); await p.waitForSelector('#gateform',{state:'visible'});
 await p.screenshot({path:'v-login.png'});
 await p.fill('#pw','family123'); await p.click('#gate-btn'); await p.waitForTimeout(800);
 const json = JSON.stringify({title:'首爾親子四日',days:[{date:'2027-03-01',title:'明洞',stops:[{t:'10:00',name:'明洞商圈',lat:37.56,lng:126.98}]}]});
 await p.fill('#tp-paste','```json\n'+json+'\n```'); await p.click('text=檢查'); await p.click('text=換成這個行程'); await p.waitForTimeout(300);
 await p.evaluate(()=>Sync.run()); await p.waitForTimeout(300);
 await p.evaluate(()=>window.scrollTo({top:document.getElementById('tools').offsetTop-60,behavior:'instant'})); await p.waitForTimeout(150);
 await p.screenshot({path:'v-trips.png'});
 await p.evaluate(()=>window.scrollTo({top:document.getElementById('plan').offsetTop-60,behavior:'instant'})); await p.waitForTimeout(150);
 await p.screenshot({path:'v-plan.png'});
 console.log(await p.evaluate(()=>document.documentElement.scrollWidth));
 await b.close();})();
