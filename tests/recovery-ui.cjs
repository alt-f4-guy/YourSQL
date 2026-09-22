const {_electron:electron}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'..');
(async()=>{
 for(const name of ['learning.json','progress.json']){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-recovery-ui-')),file=path.join(directory,name);
  let app;try{
   fs.writeFileSync(file,'{');fs.writeFileSync(path.join(directory,'updates.json'),JSON.stringify({repository:''}));
   app=await electron.launch({args:[root],env:{...process.env,SQL_PRACTICE_DATA_DIR:directory,YOURSQL_TEST_HIDDEN:process.platform==='darwin'?'1':'0'},timeout:60000});
   const page=await app.firstWindow();await page.locator('#storage-notice').waitFor();
   assert.match(await page.locator('#storage-notice').textContent(),/복구/);assert.match(await page.locator('#storage-notice').textContent(),new RegExp(name.replace('.','\\.')));
   assert.equal(await page.locator('#start-daily').isEnabled(),false);assert.equal(fs.existsSync(path.join(directory,'engine/mysql-data')),false);
   const denied=await page.evaluate(()=>window.practice.bootstrap().then(()=>false,e=>e.message));assert.match(denied,/복구/);
   assert.equal(fs.readFileSync(file,'utf8'),'{');
   fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts',`recovery-${name}.png`)});
   fs.writeFileSync(file+'.bak',JSON.stringify(name==='learning.json'?{days:{},records:{blank1:{passed:true}}}:{level1_01:{sql:'SELECT 789 AS preserved'}}));
   await page.locator('#retry-storage').click();await page.waitForFunction(()=>!document.getElementById('start-daily').disabled,null,{timeout:60000});
   assert.match(await page.locator('#storage-notice').textContent(),/최신 기록/);assert.match(await page.locator('#storage-notice').textContent(),/복원/);
   if(name==='progress.json')assert.equal((await page.evaluate(()=>window.practice.bootstrap())).progress.level1_01.sql,'SELECT 789 AS preserved');
   else assert.equal((await page.evaluate(()=>window.practice.learning())).records.blank1.passed,true);
   assert.ok(fs.readdirSync(directory).some(n=>n.startsWith(name+'.corrupt-')));
   await page.screenshot({path:path.join(root,'artifacts',`recovered-${name}.png`)});
  }catch(error){
   if(app)console.error('복구 화면 상태',await app.firstWindow().then(page=>page.locator('body').innerText()).catch(()=>''));
   const log=path.join(directory,'engine/mysql.log');if(fs.existsSync(log))console.error(fs.readFileSync(log,'utf8').split('\n').slice(-20).join('\n'));
   throw error;
  }finally{if(app)await app.close();fs.rmSync(directory,{recursive:true,force:true});}
 }
 console.log('기록 손상 시 창 유지·변경 차단·폴더 안내·재시도·백업 복원·초안 보존 PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
