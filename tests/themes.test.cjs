// 실제 임시 파일로 검증·삭제·경로 제한을 확인한다.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {readThemes,deleteTheme} = require('../lib/themes.cjs');

test('테마 파일 검증과 실제 삭제, 마지막 파일 보호',()=>{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'sql-themes-'));
  try {
    fs.cpSync(path.join(__dirname,'../theme'),directory,{recursive:true});
    assert.deepEqual(readThemes(directory).themes.slice(0,2).map(theme=>theme.id),['macos-light','macos-dark']);
    assert.deepEqual(readThemes(directory).errors,[]);
    const theme = JSON.parse(fs.readFileSync(path.join(directory,'aura.json'),'utf8'));
    fs.writeFileSync(path.join(directory,'duplicate.json'),JSON.stringify(theme));
    assert.equal(readThemes(directory).themes.some(item=>item.id==='aura'),false);
    assert.match(readThemes(directory).errors.join(' '),/중복/);
    fs.unlinkSync(path.join(directory,'duplicate.json'));
    fs.writeFileSync(path.join(directory,'broken.json'),'{');
    assert.match(readThemes(directory).errors.join(' '),/broken.json/);
    const invalid = {...theme,id:'invalid',colors:{...theme.colors,bg:'url(file:///tmp/private)'}};
    fs.writeFileSync(path.join(directory,'invalid.json'),JSON.stringify(invalid));
    assert.equal(readThemes(directory).themes.some(item=>item.id==='invalid'),false);
    fs.symlinkSync(path.join(directory,'aura.json'),path.join(directory,'linked.json'));
    assert.match(readThemes(directory).errors.join(' '),/linked.json/);
    assert.throws(()=>deleteTheme(directory,'../aura.json'),/찾을 수 없습니다/);
    deleteTheme(directory,'aura');
    assert.equal(fs.existsSync(path.join(directory,'aura.json')),false);
    assert.equal(readThemes(directory).themes.some(item=>item.name===theme.name),false);
    for (const item of readThemes(directory).themes.slice(1)) deleteTheme(directory,item.id);
    assert.throws(()=>deleteTheme(directory,readThemes(directory).themes[0].id),/마지막/);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});

// 새 색상의 전달·검증과 구형 16색 테마의 호환성을 함께 확인한다.
test('문법 색상과 구형 테마 호환',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sql-syntax-theme-'));
  try {
    const theme=JSON.parse(fs.readFileSync(path.join(__dirname,'../theme/macos-dark.json'),'utf8'));
    theme.colors['sql-keyword']='#ABCDEF';
    const file=path.join(directory,'theme.json');fs.writeFileSync(file,JSON.stringify(theme));
    assert.equal(readThemes(directory).themes[0].colors['sql-keyword'],'#ABCDEF');
    theme.colors['sql-keyword']='url(invalid)';fs.writeFileSync(file,JSON.stringify(theme));
    assert.equal(readThemes(directory).themes.length,0);
    for(const key of Object.keys(theme.colors))if(key.startsWith('sql-'))delete theme.colors[key];
    fs.writeFileSync(file,JSON.stringify(theme));
    assert.equal(readThemes(directory).themes[0].colors['sql-keyword'],theme.colors.accent);
    assert.equal(readThemes(directory).themes[0].colors['sql-comment'],theme.colors.muted);
  }finally{fs.rmSync(directory,{recursive:true,force:true})}
});
