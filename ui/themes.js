// 테마의 이름과 색상은 외부 폴더에서만 읽고 선택 ID만 사용자 설정에 저장한다.
document.addEventListener('DOMContentLoaded', async () => {
  const select = document.getElementById('theme-select');
  const remove = document.getElementById('delete-theme');
  const status = document.getElementById('theme-status');
  let available = [], colorKeys = [], selected, revision = 0, deleting = false;
  try { selected = localStorage.getItem('sql-practice-theme'); } catch {}
  function report(message) {
    status.textContent = message;
    status.hidden = !message;
  }
  function apply(id) {
    const theme = available.find(item=>item.id===id) || available[0];
    selected = theme?.id || '';
    document.documentElement.dataset.theme = selected;
    // 이전 테마의 색상을 제거하여 빈 폴더에서는 기본 CSS 색상으로 돌아간다.
    for (const key of colorKeys) document.documentElement.style.removeProperty(`--${key}`);
    colorKeys = Object.keys(theme?.colors || {});
    document.documentElement.style.colorScheme = theme?.scheme || 'light';
    for (const [key,value] of Object.entries(theme?.colors || {})) document.documentElement.style.setProperty(`--${key}`,value);
    select.value = selected;
    try { localStorage.setItem('sql-practice-theme',selected); } catch {}
  }
  async function refresh(deleted) {
    const current = ++revision;
    try {
      const result = await window.practice.themes(deleted);
      if (current !== revision) return;
      available = result.themes;
      select.replaceChildren(...available.map(theme=>new Option(theme.name,theme.id)));
      if (!available.length) select.add(new Option('테마 없음',''));
      select.disabled = !available.length;
      select.title = result.directory;
      apply(selected);
      remove.disabled = deleting || available.length <= 1;
      remove.title = available.length <= 1 ? '마지막 테마는 삭제할 수 없습니다.' : '선택한 테마 파일 삭제';
      report(result.errors.join('\n'));
      if (deleted) localStorage.removeItem('sql-practice-deleted-themes');
    } catch (error) { report(`테마를 불러오지 못했습니다: ${error.message}`); }
  }
  select.addEventListener('change',()=>apply(select.value));
  remove.addEventListener('click',async()=>{
    const theme = available.find(item=>item.id===select.value);
    if (deleting || available.length <= 1 || !theme) return;
    if (!window.confirm(`“${theme.name}” 테마 파일을 삭제하시겠습니까? 이름과 색상 데이터가 함께 삭제됩니다.`)) return;
    deleting = true;
    remove.disabled = true;
    try { await window.practice.deleteTheme(theme.id); }
    catch (error) { report(`테마를 삭제하지 못했습니다: ${error.message}`); return; }
    finally { deleting = false; remove.disabled = available.length <= 1; }
    await refresh();
  });
  document.getElementById('open-theme-folder').addEventListener('click',async()=>{
    try { await window.practice.openThemeFolder(); }
    catch (error) { report(`테마 폴더를 열지 못했습니다: ${error.message}`); }
  });
  let deleted;
  try { deleted = JSON.parse(localStorage.getItem('sql-practice-deleted-themes')); } catch {}
  window.practice.onThemesChanged(()=>refresh());
  await refresh(deleted);
});
