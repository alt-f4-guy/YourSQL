// 외부 JSON만 읽으며 잘못된 파일은 오류 목록으로 돌려준다.
const fs = require('node:fs');
const path = require('node:path');
const tokens = ['bg','text','muted','panel','sidebar-bg','toolbar','line','hover','control','selected','accent','accent-hover','success','red','secondary','on-accent'];

const syntaxFallbacks = {'sql-keyword':'accent','sql-string':'success','sql-number':'red','sql-comment':'muted','sql-function':'text'};

function readThemes(directory) {
  const themes = [], errors = [];
  let entries;
  try { entries = fs.readdirSync(directory,{withFileTypes:true}); }
  catch { return {themes,errors:['테마 폴더를 읽을 수 없습니다.'],directory}; }
  for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
    if (!entry.name.toLowerCase().endsWith('.json')) continue;
    try {
      const file = path.join(directory,entry.name);
      if (!entry.isFile() || fs.statSync(file).size > 65536) throw new Error('64KB 이하의 일반 파일만 사용할 수 있습니다.');
      const value = JSON.parse(fs.readFileSync(file,'utf8'));
      if (!value || typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.id) ||
          typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 ||
          !['light','dark'].includes(value.scheme) || !value.colors ||
          !tokens.every(key=>typeof value.colors[key] === 'string' && /^#[0-9a-f]{6}$/i.test(value.colors[key]))) {
        throw new Error('id·name·scheme과 16개 HEX 색상을 확인하세요.');
      }
      const colors = Object.fromEntries(tokens.map(key=>[key,value.colors[key]]));
      for (const [key,fallback] of Object.entries(syntaxFallbacks)) {
        const color = value.colors[key] === undefined ? colors[fallback] : value.colors[key];
        if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`${key}: 6자리 HEX 색상을 확인하세요.`);
        colors[key] = color;
      }
      themes.push({id:value.id,name:value.name,scheme:value.scheme,colors,file:entry.name});
    } catch (error) { errors.push(`${entry.name}: ${error instanceof SyntaxError ? 'JSON 문법을 확인하세요.' : error.message}`); }
  }
  const counts = new Map();
  for (const theme of themes) counts.set(theme.id,(counts.get(theme.id) || 0)+1);
  const duplicates = new Set([...counts].filter(([,count])=>count>1).map(([id])=>id));
  for (const id of duplicates) errors.push(`테마 ID 중복: ${id}`);
  const rank = id => id === 'macos-light' ? 0 : id === 'macos-dark' ? 1 : 2;
  return {themes:themes.filter(theme=>!duplicates.has(theme.id)).sort((a,b)=>rank(a.id)-rank(b.id)),errors,directory};
}

// 화면이 전달한 경로는 사용하지 않고 검증된 목록에서 파일을 찾는다.
function deleteTheme(directory,id) {
  const {themes} = readThemes(directory);
  const theme = themes.find(item=>item.id===id);
  if (!theme) throw new Error('삭제할 테마를 찾을 수 없습니다.');
  if (themes.length === 1) throw new Error('마지막 테마는 삭제할 수 없습니다.');
  fs.unlinkSync(path.join(directory,theme.file));
  return readThemes(directory);
}

module.exports = {readThemes,deleteTheme};
