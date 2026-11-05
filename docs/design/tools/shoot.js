const { chromium } = require('playwright'); const path=require('path');
(async()=>{const b=await chromium.launch();const f='file://'+path.resolve(__dirname,'../mock.html');
for(const [w,h,n,theme] of [[1440,900,'mock-1440','light'],[375,812,'mock-375','light'],[1440,900,'mock-1440-dark','dark'],[375,812,'mock-375-dark','dark']]){
 const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1,colorScheme:theme});const p=await c.newPage();await p.goto(f);await p.evaluate(()=>document.fonts.ready);
 const ov=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);console.log(n,'overflowX',ov);
 await p.screenshot({path:path.resolve(__dirname,'../'+n+'.png'),fullPage:true});await c.close();}
await b.close()})();
