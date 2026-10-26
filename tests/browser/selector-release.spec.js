const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
test('public selector keeps prelaunch blocked in both appearances and mobile',async({page})=>{
 const external=[],errors=[];
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin!=='http://127.0.0.1:8002'){external.push(r.request().url());return r.abort();}return r.continue();});
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Próximamente',exact:true})).toBeVisible();
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});
  for(const [mode,label] of [['light','Claro'],['dark','Oscuro']]){
   await page.getByRole('button',{name:'Cambiar apariencia',exact:true}).click();
   await page.getByRole('menuitemradio',{name:label,exact:true}).click();
   await expect(page.locator('html')).toHaveAttribute('data-dv-appearance',mode);
   await expect(page.locator('.prelaunch-head #appearancePicker')).toHaveCount(1);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   expect(await page.evaluate(()=>({state:DVEnv.state(),app:!!window.DVPortal,auth:!!window.DVAuth,backend:DVSupa.BACKEND(),sdk:!!window.supabase}))).toEqual({state:'BLOCKED',app:false,auth:false,backend:false,sdk:false});
   await expect(page.locator('.prelaunch-brand img')).toHaveAttribute('src',`brand/donventas-wordmark-b6${mode==='dark'?'-reverse':''}.svg`);
   if(process.env.SELECTOR_CAPTURE){fs.mkdirSync(process.env.SELECTOR_CAPTURE,{recursive:true});await page.screenshot({path:path.join(process.env.SELECTOR_CAPTURE,`release-${mode}-${width}.png`),fullPage:true});}
  }
 }
 await page.reload();await expect(page.locator('html')).toHaveAttribute('data-dv-appearance','dark');
 expect(external).toEqual([]);expect(errors).toEqual([]);
});
test('public selector supports keyboard and follows device appearance',async({page})=>{
 await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});await page.goto('/');
 const trigger=page.getByRole('button',{name:'Cambiar apariencia',exact:true});
 await trigger.focus();await page.keyboard.press('ArrowDown');
 await expect(page.getByRole('menuitemradio',{name:'Según tu dispositivo',exact:true})).toBeFocused();
 await page.keyboard.press('Home');await page.keyboard.press('Enter');
 await expect(trigger).toBeFocused();await expect(page.locator('html')).toHaveAttribute('data-dv-appearance','light');
 await trigger.click();await page.keyboard.press('End');await page.keyboard.press('Enter');
 await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-dv-appearance','dark');
 await trigger.click();await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
});
