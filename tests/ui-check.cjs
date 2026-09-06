// 실제 앱에서 일일 학습·화면 분리·설정창·MySQL 채점·재시작을 확인한다.
const {_electron:electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(root,'.0.0.1-ui-runtime-'));
fs.cpSync(path.join(root,'theme'),path.join(data,'theme'),{recursive:true});
const rootCopy=process.argv.includes('--root-copy');
const packaged=rootCopy||process.argv.includes('--packaged');
// 각 운영체제에서 동일한 화면·채점 검사를 실행한다.
const executable=process.platform==='win32'?path.join(root,'dist','YourSQL-win32-x64','YourSQL.exe'):rootCopy?path.join(root,'YourSQL.app','Contents','MacOS','YourSQL'):path.join(root,'dist','YourSQL-darwin-arm64','YourSQL.app','Contents','MacOS','YourSQL');
const launch=()=>electron.launch({...(packaged?{executablePath:executable,args:[]}:{args:[root]}),env:{...process.env,SQL_PRACTICE_DATA_DIR:data},timeout:60000});
async function main(){
  let app=await launch();
  const errors=[];
  try{
    let page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
    assert.equal(await page.locator('.brand small').textContent(),'0.0.1');
    await page.waitForFunction(()=>!document.getElementById('start-daily').disabled,null,{timeout:60000});
    await page.waitForFunction(()=>document.getElementById('engine-text').textContent.includes('로컬 전용'),null,{timeout:60000});
    for(const unit of require('../content/lessons.cjs')){
      for(const card of unit.cards){
        const result=await page.evaluate(value=>window.practice.run(value),{id:card.problemId||unit.query,sql:card.sql.replace('___',card.answer)});
        assert.equal(result.status,'success',`${card.id}: ${result.error||''}`);
      }
    }
    const today=(await page.evaluate(()=>window.practice.learning())).today.date;
    assert.equal(await page.locator(`[data-date="${today}"]`).getAttribute('data-status'),'none');
    const initialMonth=await page.locator('#calendar-month').textContent();
    await page.locator('#calendar-prev').click();
    assert.notEqual(await page.locator('#calendar-month').textContent(),initialMonth);
    await page.locator('#calendar-today').click();
    assert.equal(await page.locator('#calendar-month').textContent(),initialMonth);
    await page.locator('.learning-nav [data-mode="concept"]').click();
    assert.equal(await page.locator('#concept-units .unit-card').count(),40);
    assert.equal(await page.locator('#concept-units .curriculum-heading').count(),5);
    await page.locator('#concept-units .unit-card').last().click();
    assert.match(await page.locator('#session-position').textContent(),/1 \/ 6/);
    await page.screenshot({path:path.join(root,'artifacts','0.0.1-advanced-concept.png')});
    await page.locator('.learning-nav [data-mode="today"]').click();
    assert.equal(await page.locator('#workspace').isVisible(),false);
    assert.equal(await page.locator('#theme-select').isVisible(),false);
    await page.locator('#open-settings').click();
    assert.equal(await page.locator('#theme-select').isVisible(),true);
    await page.locator('#theme-select').selectOption('macos-dark');
    await page.screenshot({path:path.join(root,'artifacts','0.0.1-settings-dark.png')});
    await page.locator('#theme-select').selectOption('macos-light');
    await page.locator('[aria-label="설정 닫기"]').click();
    await page.screenshot({path:path.join(root,'artifacts','0.0.1-today.png')});
    // 홈의 마지막 단원까지 실제 스크롤하고, 난이도 목록에서 풀이 화면으로 진입한다.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,750));
    const screen=await page.locator('#learning-screen').evaluate(el=>({height:el.clientHeight,content:el.scrollHeight,bottom:el.getBoundingClientRect().bottom,viewport:innerHeight}));
    assert.ok(screen.content>screen.height,'홈에 독립된 스크롤 영역이 있어야 한다');
    assert.ok(screen.bottom<=screen.viewport+1,'홈 아래쪽이 창 밖으로 넘치지 않아야 한다');
    await page.locator('#learning-screen').hover();await page.mouse.wheel(0,1800);
    await page.waitForFunction(()=>document.getElementById('learning-screen').scrollTop>0);
    await page.locator('#home-units .unit-card').last().scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'artifacts','0.0.1-home-scroll.png')});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,940));
    await page.locator('.learning-nav [data-mode="query"]').click();
    assert.equal(await page.locator('#workspace').isVisible(),false);
    assert.equal(await page.locator('#catalog-rows tr').count(),300);
    for(let level=1;level<=5;level++){
      await page.locator(`[data-query-level="${level}"]`).click();
      assert.equal(await page.locator('#catalog-rows tr').count(),60);
      assert.ok((await page.locator('#catalog-rows .catalog-level').allTextContents()).every(text=>text===`${level}단계`));
    }
    await page.locator('[data-query-level="2"]').click();
    await page.locator('#query-search').fill('없는문제검색');
    assert.equal(await page.locator('#catalog-rows button').count(),0);
    await page.locator('#query-search').fill('');
    await page.screenshot({path:path.join(root,'artifacts','0.0.1-query-catalog.png')});
    await page.locator('#catalog-rows button').first().click();
    assert.equal(await page.locator('#workspace').isVisible(),true);
    assert.equal(await page.locator('#sidebar').isVisible(),false);
    await page.locator('#editor').fill('SELECT 321 AS saved_draft');
    await page.locator('#query-back').click();
    assert.equal(await page.locator('[data-query-level="2"]').getAttribute('aria-pressed'),'true');
    await page.locator('#catalog-rows button').first().click();
    assert.equal(await page.locator('#editor').inputValue(),'SELECT 321 AS saved_draft');
    await page.locator('.learning-nav [data-mode="today"]').click();
    await page.locator('#start-daily').click();
    await page.locator('#blank-input').fill('WRONG');await page.locator('#blank-check').click();
    await page.waitForFunction(()=>document.getElementById('review-badge').textContent==='1');
    await page.locator('.learning-nav [data-mode="review"]').click();
    assert.equal(await page.locator('#review-screen').isVisible(),true);
    await page.locator('#start-review').click();
    await page.locator('#blank-reveal').click();
    await page.waitForFunction(()=>document.getElementById('blank-feedback').textContent.includes('SELECT'));
    await page.locator('#blank-input').fill('select');await page.locator('#blank-check').click();await page.locator('#next-blank').click();
    await page.locator('.learning-nav [data-mode="today"]').click();
    assert.match(await page.locator('#daily-detail').textContent(),/빈칸 1\/3/);
    await page.locator('#start-daily').click();
    await page.locator('#blank-input').fill('FROM');
    await page.screenshot({path:path.join(root,'artifacts','0.0.1-lesson.png')});
    await page.locator('#blank-check').click();await page.locator('#next-blank').click();
    await page.locator('#blank-input').fill('WHERE');await page.locator('#blank-check').click();await page.locator('#next-blank').click();
    assert.equal(await page.locator('#workspace').isVisible(),true);
    assert.equal(await page.locator('.problem-item').count(),300);
    await page.locator('#editor').fill("SELECT customer_id,name FROM customers WHERE city='서울' ORDER BY customer_id");
    await page.locator('#submit').click();
    await page.waitForFunction(()=>document.getElementById('grade-panel').textContent.includes('정답입니다'),null,{timeout:60000});
    await page.screenshot({path:path.join(root,'artifacts','0.0.1-query.png')});
    await page.locator('#query-return').click();
    await page.waitForFunction(()=>document.getElementById('daily-title').textContent.includes('모두 마쳤어요'));
    assert.equal(await page.locator(`[data-date="${today}"]`).getAttribute('data-status'),'complete');
    await page.locator(`[data-date="${today}"]`).click();
    assert.match(await page.locator('#calendar-detail').textContent(),/4 \/ 4 문제/);
    await page.screenshot({path:path.join(root,'artifacts','0.0.1-calendar-complete.png')});
    await page.locator('.learning-nav [data-mode="review"]').click();
    assert.ok(await page.locator('#upcoming-list .review-item').count()>=4);
    await page.screenshot({path:path.join(root,'artifacts','0.0.1-review.png')});
    await app.close();app=await launch();page=await app.firstWindow();
    await page.waitForFunction(()=>document.getElementById('daily-title').textContent.includes('모두 마쳤어요'),null,{timeout:60000});
    assert.equal(await page.locator('#theme-select').inputValue(),'macos-light');
    assert.equal(await page.locator(`[data-date="${today}"]`).getAttribute('data-status'),'complete');
    assert.deepEqual(errors,[]);
    console.log('버전 0.0.1 화면·설정창·3+1 학습·복습·MySQL 채점·재시작 검사 통과');
  }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
