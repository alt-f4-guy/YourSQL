// 실제 앱에서 일일 학습·화면 분리·설정창·MySQL 채점·재시작을 확인한다.
const {_electron:electron}=require('@playwright/test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(root,'.0.0.2-ui-runtime-'));
fs.cpSync(path.join(root,'theme'),path.join(data,'theme'),{recursive:true});
fs.writeFileSync(path.join(data,'updates.json'),JSON.stringify({repository:''}));
const rootCopy=process.argv.includes('--root-copy');
const packaged=rootCopy||process.argv.includes('--packaged');
// 각 운영체제에서 동일한 화면·채점 검사를 실행한다.
const executable=process.platform==='win32'?path.join(root,'dist','YourSQL-win32-x64','YourSQL.exe'):rootCopy?path.join(root,'YourSQL.app','Contents','MacOS','YourSQL'):path.join(root,'dist','YourSQL-darwin-arm64','YourSQL.app','Contents','MacOS','YourSQL');
const launch=()=>electron.launch({...(process.env.YOURSQL_TEST_EXECUTABLE||packaged?{executablePath:process.env.YOURSQL_TEST_EXECUTABLE||executable,args:[]}:{args:[root]}),env:{...process.env,SQL_PRACTICE_DATA_DIR:data},timeout:60000});
async function main(){
  let app=await launch();
  const errors=[];
  try{
    let page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
    assert.equal(await page.locator('.brand small').textContent(),require('../package.json').version);
    await page.waitForFunction(()=>!document.getElementById('start-daily').disabled,null,{timeout:60000});
    await page.waitForFunction(()=>document.getElementById('engine-text').textContent.includes('로컬 전용'),null,{timeout:60000});
    for(const unit of require('../content/lessons.cjs')){
      for(const card of unit.cards){
        const result=await page.evaluate(value=>window.practice.run(value),{id:card.problemId||unit.query,sql:card.sql.replace('___',card.answer)});
        assert.equal(result.status,'success',`${card.id}: ${result.error||''}`);
      }
    }
    const today=(await page.evaluate(()=>window.practice.learning())).today.date;
    assert.equal(await page.locator('#start-extra').isVisible(),false);
    assert.equal(await page.locator('#today-screen #calendar-days').count(),0);
    assert.equal(await page.locator('#daily-count span').first().evaluate(el=>getComputedStyle(el).fontSize),'28px');
    assert.equal(await page.locator('.mode-cards, #home-units').count(),0);
    await page.locator('.learning-nav [data-mode="activity"]').click();
    assert.equal(await page.locator('#activity-screen').isVisible(),true);
    assert.ok(await page.locator('#calendar-days button').count()>=365);
    await page.locator(`[data-date="${today}"]`).focus();
    await page.keyboard.press('ArrowUp');
    assert.notEqual(await page.locator('#calendar-days [aria-pressed="true"]').getAttribute('data-date'),today);
    await page.locator('#calendar-today').click();
    await page.screenshot({path:path.join(root,'artifacts','learning-heatmap.png')});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,750));
    assert.ok(await page.locator('.heatmap-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await page.screenshot({path:path.join(root,'artifacts','learning-heatmap-compact.png')});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,940));
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
    await page.screenshot({path:path.join(root,'artifacts','0.0.2-advanced-concept.png')});
    await page.locator('.learning-nav [data-mode="today"]').click();
    assert.equal(await page.locator('#workspace').isVisible(),false);
    assert.equal(await page.locator('#theme-select').isVisible(),false);
    await page.locator('#open-settings').click();
    assert.equal(await page.locator('#theme-select').isVisible(),true);
    await page.locator('#theme-select').selectOption('macos-dark');
    await page.screenshot({path:path.join(root,'artifacts','0.0.2-settings-dark.png')});
    await page.locator('#theme-select').selectOption('macos-light');
    await page.locator('[aria-label="설정 닫기"]').click();
    await page.screenshot({path:path.join(root,'artifacts','0.0.2-today.png')});
    // 홈의 마지막 단원까지 실제 스크롤하고, 난이도 목록에서 풀이 화면으로 진입한다.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1100,750));
    const screen=await page.locator('#learning-screen').evaluate(el=>({height:el.clientHeight,content:el.scrollHeight,bottom:el.getBoundingClientRect().bottom,viewport:innerHeight}));
    assert.ok(screen.content>screen.height,'홈에 독립된 스크롤 영역이 있어야 한다');
    assert.ok(screen.bottom<=screen.viewport+1,'홈 아래쪽이 창 밖으로 넘치지 않아야 한다');
    await page.locator('#learning-screen').hover();await page.mouse.wheel(0,1800);
    await page.waitForFunction(()=>document.getElementById('learning-screen').scrollTop>0);
    await page.locator('[data-open="activity"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(root,'artifacts','0.0.2-home-scroll.png')});
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
    await page.screenshot({path:path.join(root,'artifacts','0.0.2-query-catalog.png')});
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
    assert.match(await page.locator('#daily-detail').textContent(),/빈칸 1\/6/);
    await page.locator('#start-daily').click();
    await page.locator('#blank-input').fill('FROM');
    await page.screenshot({path:path.join(root,'artifacts','0.0.2-lesson.png')});
    await page.locator('#blank-check').click();await page.locator('#next-blank').click();
    await page.locator('#blank-input').fill('WHERE');await page.locator('#blank-check').click();await page.locator('#next-blank').click();
    for(const card of require('../content/lessons.cjs')[0].cards.slice(3)){
      await page.locator('#blank-input').fill(card.answer);await page.locator('#blank-check').click();await page.locator('#next-blank').click();
    }
    assert.equal(await page.locator('#workspace').isVisible(),true);
    assert.equal(await page.locator('.problem-item').count(),300);
    await page.locator('#editor').fill("SELECT customer_id,name FROM customers WHERE city='서울' ORDER BY customer_id");
    await page.locator('#submit').click();
    await page.waitForFunction(()=>document.getElementById('grade-panel').textContent.includes('정답입니다'),null,{timeout:60000});
    await page.locator('#next-daily-query').waitFor({state:'visible'});
    assert.match(await page.locator('#daily-detail').textContent(),/빈칸 6\/6 · 쿼리 1\/2/);
    assert.equal(await page.locator('#daily-progress').getAttribute('max'),'8');
    assert.equal(await page.locator(`[data-date="${today}"]`).getAttribute('data-status'),'partial');
    await page.locator('#next-daily-query').click();
    assert.match(await page.locator('#query-mission').textContent(),/오늘의 쿼리 2 \/ 2/);
    const secondQuery=await page.evaluate(async()=>{const {today}=await window.practice.learning();return window.practice.solution(today.queries[1]);});
    await page.locator('#editor').fill(secondQuery.sql);await page.locator('#submit').click();
    await page.waitForFunction(()=>document.getElementById('grade-panel').textContent.includes('정답입니다'),null,{timeout:60000});
    await page.screenshot({path:path.join(root,'artifacts','0.0.2-query.png')});
    await page.locator('#query-return').click();
    await page.waitForFunction(()=>document.getElementById('daily-title').textContent.includes('모두 마쳤어요'));
    assert.equal(await page.locator('#start-daily').isVisible(),false);
    assert.equal(await page.locator('#start-extra').isVisible(),true);
    assert.match(await page.locator('#home-review').textContent(),/다음 복습:/);
    assert.equal(await page.locator(`[data-date="${today}"]`).getAttribute('data-status'),'complete');
    await page.locator('.learning-nav [data-mode="activity"]').click();
    await page.locator(`[data-date="${today}"]`).click();
    assert.match(await page.locator('#calendar-detail').textContent(),/8문제 완료/);
    await page.screenshot({path:path.join(root,'artifacts','0.0.2-calendar-complete.png')});
    await page.locator('.learning-nav [data-mode="review"]').click();
    assert.ok(await page.locator('#upcoming-list .review-item').count()>=4);
    await page.screenshot({path:path.join(root,'artifacts','0.0.2-review.png')});
    await app.close();app=await launch();page=await app.firstWindow();
    await page.waitForFunction(()=>document.getElementById('daily-title').textContent.includes('모두 마쳤어요'),null,{timeout:60000});
    assert.equal(await page.locator('#theme-select').inputValue(),'macos-light');
    assert.equal(await page.locator(`[data-date="${today}"]`).getAttribute('data-status'),'complete');
    // 완료 버튼 옆에서 두 사이클을 더 풀고 중간 재시작·누적 달력을 확인한다.
    const answers=new Map(require('../content/lessons.cjs').flatMap(u=>u.cards).map(c=>[c.id,c.answer]));
    for(let cycle=2;cycle<=3;cycle++){
      assert.equal(await page.locator('#start-extra').isVisible(),true);
      await page.screenshot({path:path.join(root,'artifacts',`extra-cycle-${cycle}-start.png`)});
      await page.locator('#start-extra').click();
      const assigned=(await page.evaluate(()=>window.practice.learning())).today;
      for(let i=0;i<assigned.blanks.length;i++){
        await page.locator('#blank-input').fill(answers.get(assigned.blanks[i]));
        await page.locator('#blank-check').click();
        await page.locator('#next-blank').waitFor({state:'visible'});
        if(cycle===2&&i===0){
          await app.close();app=await launch();page=await app.firstWindow();
          await page.waitForFunction(()=>!document.getElementById('start-daily').disabled,null,{timeout:60000});
          assert.equal(await page.locator('#start-extra').isVisible(),false);
          assert.match(await page.locator('#calendar-detail').textContent(),/9문제 완료/);
          assert.equal(await page.locator(`[data-date="${today}"]`).getAttribute('data-status'),'complete');
          await page.locator('#start-daily').click();
        }else await page.locator('#next-blank').click();
      }
      for(const [index,id] of assigned.queries.entries()){
        if(index)await page.locator('#next-daily-query').click();
        const solution=await page.evaluate(id=>window.practice.solution(id),id);
        await page.locator('#editor').fill(solution.sql);await page.locator('#submit').click();
        await page.waitForFunction(()=>document.getElementById('grade-panel').textContent.includes('정답입니다'),null,{timeout:60000});
      }
      await page.locator('#query-return').click();
      await page.waitForFunction(total=>document.getElementById('calendar-detail').textContent.includes(`${total}문제 완료`),cycle*8);
      assert.equal(await page.locator(`[data-date="${today}"] small`).textContent(),`${cycle*8} ✓`);
      assert.equal((await page.evaluate(()=>window.practice.learning())).completedDays,1);
    }
    await page.screenshot({path:path.join(root,'artifacts','extra-calendar-24.png')});
    await app.close();app=await launch();page=await app.firstWindow();
    await page.waitForFunction(()=>document.getElementById('calendar-detail').textContent.includes('24문제 완료'));
    assert.deepEqual(errors,[]);
    console.log(`버전 ${require('../package.json').version} 화면·설정창·6+2 학습·복습·MySQL 채점·재시작 검사 통과`);
  }finally{await app.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
