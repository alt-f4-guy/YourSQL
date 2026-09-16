// 2사이클 목표의 마지막 정답·복습 이동·재시작 후 중복 방지를 확인한다.
const {_electron:electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {Learning}=require('../lib/learning.cjs');
const root=path.resolve(__dirname,'..');
const executable=process.argv.includes('--root-copy')?path.join(root,'YourSQL.app/Contents/MacOS/YourSQL'):process.env.YOURSQL_TEST_EXECUTABLE;

async function main(){
  for(const kind of ['upcoming','due','none']){
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'yoursql-reminder-'));
    let app;
    try{
      fs.writeFileSync(path.join(directory,'updates.json'),JSON.stringify({repository:''}));
      const now=new Date(),yesterday=new Date(now);yesterday.setDate(now.getDate()-1);
      if(kind==='due')new Learning(directory,()=>yesterday).answer({id:'blank1',answer:'오답'});
      const learning=new Learning(directory,()=>now);learning.setDailyGoal(2);
      const first=learning.snapshot().today;
      if(kind==='upcoming')learning.answer({id:'blank1',answer:'오답'});
      for(const id of first.blanks)learning.answer({id,answer:learning.card(id).answer});
      for(const id of first.queries)learning.queryResult(id,{status:'correct'});
      learning.startExtra();
      const today=learning.snapshot().today;
      for(const id of today.blanks.slice(0,-1))learning.answer({id,answer:learning.card(id).answer});
      for(const id of today.queries)learning.queryResult(id,{status:'correct'});
      const last=learning.card(today.blanks.at(-1));
      const launch=()=>electron.launch({...(executable?{executablePath:executable,args:[]}:{args:[root]}),env:{...process.env,SQL_PRACTICE_DATA_DIR:directory,YOURSQL_TEST_HIDDEN:'1'},timeout:60000});
      app=await launch();let page=await app.firstWindow();
      await page.waitForFunction(()=>!document.getElementById('start-daily').disabled);
      assert.equal(await page.locator('#review-reminder-dialog').isVisible(),false);
      await page.locator('#start-daily').click();await page.locator('#begin-blanks').click();
      if(kind==='due'){
        await page.locator('#blank-input').fill('오답');await page.locator('#blank-check').click();
        await page.locator('#blank-feedback').waitFor({state:'visible'});
        assert.equal(await page.locator('#review-reminder-dialog').isVisible(),false);
      }
      await page.locator('#blank-input').fill(last.answer);await page.locator('#blank-check').click();
      await page.locator('#review-reminder-dialog').waitFor({state:'visible',timeout:5000});
      const copy=await page.locator('#review-reminder-copy').textContent();
      if(kind==='due')assert.match(copy,/오늘 복습할 문제 1개/);
      else if(kind==='upcoming')assert.ok(copy.includes(learning.after(1).replaceAll('-','.')));
      else assert.match(copy,/예정된 복습이 없/);
      assert.equal(await page.locator('#reminder-start-review').isVisible(),kind==='due');
      assert.equal(await page.locator('#review-reminder-dialog').evaluate(el=>el.contains(document.activeElement)),true);
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,750));
      await page.screenshot({path:path.join(root,'artifacts',`review-reminder-${kind}.png`)});
      if(kind==='due'){
        await page.locator('#reminder-start-review').click();
        await page.waitForFunction(()=>document.getElementById('session-position').textContent.startsWith('복습'));
        assert.equal(await page.locator('#blank-input').isEnabled(),true);
      }else await page.keyboard.press('Escape');
      await page.evaluate(()=>window.learningUI.refresh());
      assert.equal(await page.locator('#review-reminder-dialog').isVisible(),false);
      await app.close();app=await launch();page=await app.firstWindow();
      await page.waitForFunction(()=>!document.getElementById('start-daily').disabled);
      assert.equal(await page.locator('#review-reminder-dialog').isVisible(),false);
      console.log(`복습 알림 ${kind}: 완료·내용·이동·재시작 검사 통과`);
    }finally{if(app)await app.close();fs.rmSync(directory,{recursive:true,force:true});}
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
