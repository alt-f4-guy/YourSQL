// 문자열·주석 내부를 다시 분류하지 않고 원문을 그대로 보존해야 한다.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({});
if(fs.existsSync('ui/sql-highlight.js'))vm.runInContext(fs.readFileSync('ui/sql-highlight.js','utf8'),context);
test('SQL 분류와 원문 보존',()=>{
  assert.equal(typeof context.tokenizeSQL,'function');
  const sql="SELECT COUNT(*), 1.2e-3, 'it''s <b> -- text', `select` FROM 고객 # 주석\nWHERE x=1--2; /* SELECT\n42 */\n-- 끝\n";
  const tokens=context.tokenizeSQL(sql);
  assert.equal(tokens.map(t=>t.text).join(''),sql);
  for(const [text,kind] of [['SELECT','keyword'],['COUNT','function'],['1.2e-3','number'],["'it''s <b> -- text'",'string'],['# 주석','comment'],['/* SELECT\n42 */','comment'],['-- 끝','comment']])assert.ok(tokens.some(t=>t.text===text&&t.kind===kind),text);
  assert.ok(tokens.some(t=>t.kind===''&&t.text.includes('`select`')));
  assert.equal(tokens.some(t=>t.kind==='comment'&&t.text.includes('--2')),false);
  for(const sql of ["SELECT '미완성",'/* 미완성','SELECT "a\\"b"',"SELECT 0xFF, .5, 12abc",''])assert.equal(context.tokenizeSQL(sql).map(t=>t.text).join(''),sql);
});

// 제공 테마 모두에서 편집기 문법색의 작은 글자 대비를 확인한다.
test('모든 테마의 문법색 대비',()=>{
  const {themes,errors}=require('../lib/themes.cjs').readThemes('theme');
  assert.deepEqual(errors,[]);
  const luminance=hex=>{const a=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722};
  for(const theme of themes)for(const key of ['sql-keyword','sql-string','sql-number','sql-comment','sql-function']){
    const a=luminance(theme.colors[key]),b=luminance(theme.colors.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    assert.ok(ratio>=4.5,`${theme.id}/${key}: ${ratio.toFixed(2)}`);
  }
});
