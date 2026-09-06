(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { problems: [], progress: {}, current: null, level: 'all', query: '', timer: null, saving: false, busy: false, engineReady: false, reviewOnly: false, reviewId: null, hintCounts: {} };
  const api = window.practice;
  // Windows에서는 실제 동작과 같은 Ctrl 단축키를 표시한다.
  if (!navigator.platform.startsWith('Mac')) {
    document.querySelectorAll('kbd,.list-summary').forEach(element=>{element.textContent=element.textContent.replaceAll('⌘','Ctrl+').replaceAll('⇧','Shift+');});
  }
  // 단계 이름과 선수 범위를 목록·필터·문제 배지에서 일관되게 사용한다.
  const levels = [
    {name:'기초 조회',topics:'SELECT · WHERE · 정렬 · NULL',guide:'한 테이블에서 필요한 행과 열을 고릅니다. 조건 조회와 정렬부터 익히세요.'},
    {name:'집계·함수',topics:'GROUP BY · HAVING · CASE',guide:'1단계 조회를 바탕으로 그룹별 수치와 날짜·문자열을 계산합니다.'},
    {name:'조인·서브쿼리',topics:'JOIN · EXISTS · 중첩 조회',guide:'1·2단계를 바탕으로 여러 테이블을 연결하고 집계 결과를 비교합니다.'},
    {name:'윈도 분석',topics:'순위 · 이전/다음 행 · 누적',guide:'조인과 집계 결과에 순위·누적·이동 계산을 적용합니다. 행을 유지하는 분석을 연습하세요.'},
    {name:'복합 분석',topics:'코호트 · 연속 구간 · 세션',guide:'앞 단계의 기법을 조합해 코호트·연속 구간·집합 비교 등 여러 단계의 분석을 해결합니다.'}
  ];
  levels.forEach((level, index) => {
    const button = node('button', 'level-chip'); button.type = 'button'; button.dataset.level = index + 1; button.setAttribute('aria-pressed', 'false');
    const copy = node('span', 'level-copy'); copy.append(node('strong', '', `${index + 1}단계 · ${level.name}`), node('small', '', level.topics));
    button.append(copy, node('span', 'level-progress', '0/60')); $('level-filters').append(button);
  });
  const el = {
    list: $('problem-list'), search: $('search'), count: $('problem-count'), solved: $('solved-count'), editor: $('editor'), lines: $('line-numbers'),
    save: $('save-status'), engineDot: $('engine-dot'), engineText: $('engine-text'), retry: $('retry-engine'), run: $('run'), submit: $('submit'), solution: $('solution'),
    resultTab: $('result-tab'), gradeTab: $('grade-tab'), result: $('result-panel'), grade: $('grade-panel'), summary: $('output-summary'),
    historyDialog: $('history-dialog'), historyList: $('history-list'), solutionDialog: $('solution-dialog')
  };

  function node(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = String(text); return n; }
  function clear(target) { target.replaceChildren(); }
  function toast(message, error = false) { const n = node('div', `toast${error ? ' error' : ''}`, message); $('toast-region').append(n); setTimeout(() => n.remove(), 3200); }
  function setEngine(engine) { state.engineReady = Boolean(engine && engine.ready); el.engineDot.className = `status-dot ${state.engineReady ? 'ready' : 'error'}`; el.engineText.textContent = engine?.message || (state.engineReady ? '엔진 연결됨' : '엔진 연결 필요'); updateActions(); }
  function updateActions() { const enabled = Boolean(state.current && state.engineReady && !state.busy); el.editor.disabled = !state.current; el.run.disabled = !enabled; el.submit.disabled = !enabled; el.solution.disabled = !state.current || state.busy; el.retry.disabled = state.busy; $('import-pack').disabled = state.busy; $('hint').disabled = !state.current || !state.current.hints || state.busy; $('end-review').disabled = state.busy; $('reset-sql').disabled = !state.current || state.busy; }
  // 입력·문제 전환·초안/오답 복원·리셋이 같은 표시 갱신 경로를 사용한다.
  function syncHighlightScroll() { $('sql-highlight').style.width = `${el.editor.clientWidth}px`; $('sql-highlight').style.height = `${el.editor.clientHeight}px`; $('sql-highlight').scrollTop = el.editor.scrollTop; $('sql-highlight').scrollLeft = el.editor.scrollLeft; }
  function syncLines() { highlightSQL($('sql-highlight'), el.editor.value); syncHighlightScroll(); const count = Math.max(1, el.editor.value.split('\n').length); el.lines.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n'); el.lines.scrollTop = el.editor.scrollTop; }
  function progressFor(id) { return state.progress[id] || { sql: '', solved: false, attempts: 0, lastStatus: '' }; }

  function renderList() {
    clear(el.list);
    const q = state.query.trim().toLocaleLowerCase('ko');
    const filtered = state.problems.filter(p => (!state.reviewOnly || ['wrong','error'].includes(progressFor(p.id).lastStatus)) && (state.level === 'all' || String(p.level) === state.level) && (!q || `${p.title} ${p.topic}`.toLocaleLowerCase('ko').includes(q)));
    el.count.textContent = state.problems.length; $('review-filter').textContent = `오답 다시 풀기 · ${state.problems.filter(p=>['wrong','error'].includes(progressFor(p.id).lastStatus)).length}`;
    el.solved.textContent = `${Object.values(state.progress).filter(p => p.solved).length} 완료`;
    const selectedLevel = state.level === 'all' ? null : levels[Number(state.level)-1];
    $('level-guide').dataset.level = state.level;
    $('level-guide-title').textContent = selectedLevel ? `${state.level}단계 · ${selectedLevel.name}` : '5단계 학습 과정';
    $('level-guide-copy').textContent = selectedLevel?.guide || '기초 조회부터 복합 분석까지. 단계별 범위를 확인하고 순서대로 연습하세요.';
    $('list-summary').textContent = `${filtered.length}개 표시${state.reviewOnly ? ' · 오답 복습' : ''}`;
    levels.forEach((level, index) => {
      const number = index + 1, all = state.problems.filter(p=>p.level===number), solved = all.filter(p=>progressFor(p.id).solved).length;
      const chip = document.querySelector(`.level-chip[data-level="${number}"]`);
      chip.querySelector('.level-progress').textContent = `${solved}/${all.length}`;
      chip.setAttribute('aria-label', `${number}단계 ${level.name}, ${all.length}문제 중 ${solved}개 완료`);
      const shown = filtered.filter(p=>p.level===number); if (!shown.length) return;
      const group = node('div', 'level-group'); group.dataset.level = number; group.role = 'group'; group.setAttribute('aria-label', `${number}단계 ${level.name}`);
      const heading = node('div', 'level-group-heading'); heading.setAttribute('role', 'presentation');
      heading.append(node('strong', '', `${number}단계 · ${level.name}`), node('small', '', `${shown.length}개 표시 · ${solved}/${all.length} 완료`)); group.append(heading);
      shown.forEach(p => {
        const button = node('button', `problem-item${state.current?.id === p.id ? ' selected' : ''}`); button.type = 'button'; button.role = 'option'; button.setAttribute('aria-selected', String(state.current?.id === p.id)); button.dataset.id = p.id; button.tabIndex = state.current?.id === p.id ? 0 : -1;
        button.append(node('span', 'number', String(all.indexOf(p) + 1).padStart(2, '0')));
        const copy = node('span'); copy.append(node('strong', '', p.title), node('small', '', p.topic)); button.append(copy);
        button.append(node('span', `solve-dot${progressFor(p.id).solved ? ' solved' : ''}`)); group.append(button);
      }); el.list.append(group);
    });
    if (!el.list.querySelector('[tabindex="0"]')) { const first=el.list.querySelector('.problem-item'); if (first) first.tabIndex=0; }
    if (!filtered.length) el.list.append(node('div', 'output-empty', '조건에 맞는 문제가 없습니다.'));
  }

  function renderTable(table) {
    const wrap = node('div', 'table-scroll'), grid = node('table', 'data-table'), cap = node('caption', '', table.name), head = node('thead'), hr = node('tr'), body = node('tbody');
    (table.columns || []).forEach(c => hr.append(node('th', '', c.name))); head.append(hr);
    (table.rows || []).forEach(row => { const tr = node('tr'); row.forEach(value => tr.append(node('td', '', value === null ? 'NULL' : value))); body.append(tr); });
    grid.append(cap, head, body); wrap.append(grid); return wrap;
  }

  function renderProblem(p) {
    $('empty-state').hidden = true; $('problem-view').hidden = false;
    $('problem-level').textContent = `${p.level}단계 · ${levels[p.level-1].name}`; $('problem-level').dataset.level = p.level; $('problem-topic').textContent = p.topic; $('problem-title').textContent = p.title; $('problem-description').textContent = p.description;
    const prog = progressFor(p.id), pill = $('problem-state'); pill.textContent = prog.solved ? '완료' : prog.attempts ? `${prog.attempts}회 시도` : '미완료'; pill.className = `state-pill${prog.solved ? ' solved' : ''}`;
    $('editor-problem-label').textContent = p.title;
    const schemas = $('schema-list'); clear(schemas); const samples = $('sample-tables'); clear(samples);
    (p.tables || []).forEach(t => {
      const card = node('div', 'schema-card'), title = node('div', 'schema-name', t.name); if (t.description) title.append(node('span', 'schema-description', t.description)); card.append(title);
      (t.columns || []).forEach(c => { const row = node('div', 'schema-column'); row.append(node('code', '', c.name), node('em', '', c.type), node('span', '', c.description || '')); card.append(row); }); schemas.append(card); samples.append(renderTable(t));
    });
  }

  async function saveDraft(id = state.current?.id, sql = el.editor.value) {
    clearTimeout(state.timer); if (!id || !api) return true;
    state.saving = true; el.save.textContent = '초안 저장 중…';
    try { const review = state.reviewId === id; await api.saveDraft({ id, sql, review }); state.progress[id] = { ...progressFor(id), [review ? 'reviewSql' : 'sql']: sql }; el.save.textContent = '초안 자동 저장됨'; return true; }
    catch (error) { el.save.textContent = '초안 저장 실패'; toast(error.message || '초안을 저장하지 못했습니다.', true); return false; }
    finally { state.saving = false; }
  }

  async function selectProblem(id, review=false, initializing=false) {
    if (state.busy && !initializing) return false;
    if (state.current?.id === id && (state.reviewId === id) === review) return true;
    if (state.current && !await saveDraft(state.current.id, el.editor.value)) return false;
    const p = state.problems.find(item => item.id === id); if (!p) return false;
    state.current = p; state.reviewId = review ? id : null; $('review-banner').hidden = !review; if (review) state.hintCounts[id] = 0; renderProblem(p); el.editor.value = review ? '' : state.progress[id]?.sql ?? p.starter ?? ''; syncLines(); renderList(); updateActions();
    clear(el.result); el.result.append(node('div', 'output-empty', '쿼리를 실행하면 결과가 여기에 표시됩니다.')); clear(el.grade); el.grade.append(node('div', 'output-empty', 'SQL을 제출하면 채점 결과가 여기에 표시됩니다.')); el.summary.textContent = ''; switchTab('result'); el.editor.focus();
    return true;
  }

  function switchTab(tab) {
    const result = tab === 'result'; el.resultTab.classList.toggle('active', result); el.gradeTab.classList.toggle('active', !result); el.resultTab.setAttribute('aria-selected', String(result)); el.gradeTab.setAttribute('aria-selected', String(!result)); el.result.hidden = !result; el.grade.hidden = result;
  }

  function renderResult(data) {
    clear(el.result); const ok = data.status === 'success'; el.result.append(node('div', `result-banner${ok ? '' : ' error'}`, ok ? `${data.rows?.length || 0}개 행 · ${data.elapsedMs ?? 0}ms` : data.error || '쿼리 실행 중 오류가 발생했습니다.'));
    if (ok) { const wrap = node('div', 'table-scroll'), table = node('table', 'data-table'), head = node('thead'), hr = node('tr'), body = node('tbody'); (data.columns || []).forEach(c => hr.append(node('th', '', c))); head.append(hr); (data.rows || []).forEach(r => { const tr = node('tr'); r.forEach(v => tr.append(node('td', '', v === null ? 'NULL' : v))); body.append(tr); }); table.append(head, body); wrap.append(table); el.result.append(wrap); }
    el.summary.textContent = ok ? `${data.rows?.length || 0}행` : '실행 오류'; switchTab('result');
  }

  function renderGrade(data) {
    clear(el.grade); const correct = data.status === 'correct'; const message = correct ? `정답입니다 · ${data.passed}/${data.total} 통과` : data.status === 'wrong' ? `오답입니다 · ${data.passed}/${data.total} 통과` : data.error || '채점 중 오류가 발생했습니다.';
    el.grade.append(node('div', `result-banner${correct ? '' : ` ${data.status}`}`, message)); const cases = node('div', 'cases'); (data.cases || []).forEach(c => { const row = node('div', `case${c.passed ? ' passed' : ''}`); row.append(node('i'), node('strong', '', c.name), node('small', '', c.message || (c.passed ? '통과' : '실패'))); cases.append(row); }); el.grade.append(cases); el.summary.textContent = data.total ? `${data.passed}/${data.total} 통과` : '채점 오류'; switchTab('grade');
  }

  async function execute(kind) {
    if (!state.current || !state.engineReady || state.busy) return; const id = state.current.id, sql = el.editor.value; state.busy = true; updateActions(); const button = kind === 'run' ? el.run : el.submit, label = button.textContent;
    if (!await saveDraft(id, sql)) { state.busy = false; updateActions(); return; } button.textContent = kind === 'run' ? '실행 중…' : '채점 중…';
    try { const data = await api[kind]({ id, sql, review: state.reviewId === id }); if (kind === 'submit' && data.progress) { state.progress[id] = data.progress; renderList(); } if (state.current?.id !== id) return; if (kind === 'run') renderResult(data); else { renderGrade(data); if (data.logId && data.status !== 'correct') el.grade.prepend(node('div', 'auto-log', '오답 기록에 자동 저장됨')); renderProblem(state.current); } }
    catch (error) { if (state.current?.id === id) { const data = { status: 'error', error: error.message || '연결 오류가 발생했습니다.' }; kind === 'run' ? renderResult(data) : renderGrade(data); } }
    finally { button.textContent = label; state.busy = false; updateActions(); window.learningUI?.refresh(); }
  }

  async function showHistory() {
    if (!api) return toast('앱 연결이 필요합니다.', true); clear(el.historyList); el.historyList.append(node('div', 'output-empty', '기록을 불러오는 중입니다.')); el.historyDialog.showModal();
    try { const logs = await api.history(); clear(el.historyList); if (!logs.length) { el.historyList.append(node('div', 'output-empty', '아직 저장된 오답 기록이 없습니다.')); return; }
      logs.forEach(log => {
        const item = node('article', 'history-item'), info = node('div');
        info.append(node('strong', '', log.title || log.problemId), node('p', '', `${log.level}단계 · ${new Date(log.createdAt).toLocaleString('ko-KR')} · ${log.status === 'wrong' ? '오답' : '오류'} · ${log.result?.passed ?? 0}/${log.result?.total ?? 0} 통과`));
        const actions = node('div', 'history-actions'), restore = node('button', 'button ghost', 'SQL 복원'), exp = node('button', 'button ghost', '내보내기'); restore.type = exp.type = 'button';
        restore.addEventListener('click', async () => { if (!await selectProblem(log.problemId) || state.current?.id !== log.problemId) return; el.editor.value = log.sql ?? ''; syncLines(); if (await saveDraft()) el.historyDialog.close(); });
        exp.addEventListener('click', async () => { try { const result = await api.exportLog(log.id); if (!result.canceled) toast(`내보냄: ${result.path}`); } catch (e) { toast(e.message || '내보내기에 실패했습니다.', true); } }); actions.append(restore, exp);
        const details = node('details', 'history-details'), summary = node('summary', '', '저장된 SQL과 채점 상세 보기'), code = node('pre', 'history-sql', log.sql || '-- 저장된 SQL이 없습니다.'); details.append(summary, code);
        if (log.result?.error) details.append(node('p', 'history-error', log.result.error));
        (log.result?.cases || []).forEach(c => details.append(node('p', `history-case${c.passed ? ' passed' : ''}`, `${c.passed ? '통과' : '실패'} · ${c.name}${c.message ? ` · ${c.message}` : ''}`)));
        item.append(info, actions, details); el.historyList.append(item);
      });
    } catch (error) { clear(el.historyList); el.historyList.append(node('div', 'output-empty', error.message || '기록을 불러오지 못했습니다.')); }
  }

  function revealHint() {
    const p = state.current, count = state.hintCounts[p.id] || 0;
    if (count >= p.hints.length) return;
    const labels = ['핵심 개념', '접근 순서', 'SQL 골격'];
    const section = node('section', 'hint-step');
    section.append(node('h3', '', `${count + 1}단계 · ${labels[count]}`), node(count === 2 ? 'pre' : 'p', count === 2 ? 'solution-code' : 'dialog-copy', p.hints[count]));
    $('hint-list').append(section); state.hintCounts[p.id] = count + 1;
    $('next-hint').disabled = count + 1 === p.hints.length;
    $('next-hint').textContent = count + 1 === p.hints.length ? '모든 힌트를 확인했습니다' : `${count + 2}단계 힌트 보기`;
  }
  $('hint').addEventListener('click', () => {
    const p = state.current; if (!p?.hints) return;
    $('hint-title').textContent = p.title; clear($('hint-list'));
    const count = Math.max(1, state.hintCounts[p.id] || 0); state.hintCounts[p.id] = 0;
    for (let i = 0; i < count; i++) revealHint();
    $('hint-dialog').showModal();
  });
  $('next-hint').addEventListener('click', revealHint);
  $('open-study').addEventListener('click', async () => {
    clear($('study-summary')); $('study-today').textContent = '기록을 불러오는 중입니다.'; $('study-dates').textContent = ''; $('study-dialog').showModal();
    try {
      const data = await api.study();
      for (const [label, value] of [['현재 연속', data.current], ['최장 연속', data.longest], ['전체 학습일', data.total]]) {
        const card = node('div', 'study-card'); card.append(node('span', '', label), node('strong', '', `${value}일`)); $('study-summary').append(card);
      }
      $('study-today').textContent = data.today ? '오늘 학습 완료! 내일도 이어 가세요.' : '오늘 문제를 제출해 학습 기록을 이어 가세요.';
      $('study-dates').textContent = data.dates.slice().reverse().join(' · ') || '아직 제출한 날짜가 없습니다.';
    } catch (e) { $('study-today').textContent = e.message || '기록을 불러오지 못했습니다.'; }
  });

  function enableResize(handle, axis, target, cssVar, min, max) {
    handle.addEventListener('pointerdown', e => { handle.setPointerCapture(e.pointerId); const start = axis === 'x' ? e.clientX : e.clientY, initial = axis === 'x' ? target.getBoundingClientRect().width : target.getBoundingClientRect().height; const move = ev => { const delta = (axis === 'x' ? ev.clientX : ev.clientY) - start; document.documentElement.style.setProperty(cssVar, `${Math.min(max(), Math.max(min, initial + delta))}px`); }; const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); }; handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); });
    handle.addEventListener('keydown', e => { const direction = axis === 'x' ? (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0) : (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0); if (!direction) return; e.preventDefault(); const current = axis === 'x' ? target.getBoundingClientRect().width : target.getBoundingClientRect().height; document.documentElement.style.setProperty(cssVar, `${Math.min(max(), Math.max(min, current + direction * 12))}px`); });
  }

  // 300문제를 모두 Tab으로 통과하지 않고 방향키로 목록 안에서 이동한다.
  el.list.addEventListener('keydown', e => {
    if (!['ArrowDown','ArrowUp','Home','End'].includes(e.key)) return;
    const items = [...el.list.querySelectorAll('.problem-item')], index = items.indexOf(document.activeElement); if (index < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length-1 : Math.max(0, Math.min(items.length-1, index + (e.key === 'ArrowDown' ? 1 : -1)));
    items.forEach((item, i) => { item.tabIndex = i === next ? 0 : -1; }); items[next].focus();
  });
  el.list.addEventListener('click', e => { const item = e.target.closest('[data-id]'); if (item) selectProblem(item.dataset.id, state.reviewOnly); });
  $('review-filter').addEventListener('click', () => { state.reviewOnly = !state.reviewOnly; $('review-filter').setAttribute('aria-pressed', String(state.reviewOnly)); renderList(); });
  $('end-review').addEventListener('click', () => selectProblem(state.current.id));
  $('level-filters').addEventListener('click', e => { const b = e.target.closest('[data-level]'); if (!b) return; state.level = b.dataset.level; document.querySelectorAll('.level-chip').forEach(n => { n.classList.toggle('active', n === b); n.setAttribute('aria-pressed', String(n === b)); }); el.list.scrollTop = 0; renderList(); });
  el.search.addEventListener('input', () => { state.query = el.search.value; renderList(); });
  el.editor.addEventListener('input', () => { syncLines(); el.save.textContent = '저장 대기 중'; clearTimeout(state.timer); state.timer = setTimeout(() => saveDraft(), 500); });
  new ResizeObserver(syncHighlightScroll).observe(el.editor);
  el.editor.addEventListener('scroll', () => { el.lines.scrollTop = el.editor.scrollTop; syncHighlightScroll(); });
  el.editor.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault(); execute(e.shiftKey ? 'submit' : 'run'); return;
    }
    const a = el.editor.selectionStart, b = el.editor.selectionEnd;
    let insertion;
    if (e.key === 'Tab' && !e.shiftKey) insertion = '  ';
    if (e.key === 'Enter' && !e.altKey) {
      // 커서 앞 현재 줄의 들여쓰기를 유지하며, 쉼표로 시작한 연속 줄은 한 번만 들여쓴다.
      const line = el.editor.value.slice(0, a).split('\n').pop();
      const indent = line.match(/^[\t ]*/)[0];
      insertion = '\n' + (indent || (/,\s*$/.test(line) ? '  ' : ''));
    }
    if (insertion !== undefined) {
      e.preventDefault();
      el.editor.setRangeText(insertion, a, b, 'end');
      el.editor.dispatchEvent(new Event('input'));
    }
  });
  // 표시된 목록 순서로 이동하며 기존 선택 경로에서 초안을 먼저 저장한다.
  document.addEventListener('keydown', async e => {
    if (e.isComposing || $('workspace').hidden || $('sidebar').hidden || document.querySelector('dialog[open]')) return;
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && ['ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
      if (e.repeat || state.busy || state.saving || !state.current) return;
      const items = [...el.list.querySelectorAll('.problem-item')], index = items.findIndex(item => item.dataset.id === state.current.id);
      const next = index < 0 ? null : items[index + (e.key === 'ArrowRight' ? 1 : -1)];
      if (next && await selectProblem(next.dataset.id, state.reviewOnly)) el.list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); el.search.focus(); }
    if (e.key === 'Escape' && document.activeElement === el.search) { el.search.value = ''; state.query = ''; renderList(); }
  });
  // 기존 초안 저장 경로를 사용해 복습 중에는 복습 코드만 초기화한다.
  $('reset-sql').addEventListener('click', async () => {
    if (!state.current || state.busy) return;
    state.busy = true; updateActions();
    el.editor.value = state.current.starter ?? '';
    syncLines();
    try { await saveDraft(); }
    finally { state.busy = false; updateActions(); el.editor.focus(); }
  });
  el.run.addEventListener('click', () => execute('run')); el.submit.addEventListener('click', () => execute('submit')); el.resultTab.addEventListener('click', () => switchTab('result')); el.gradeTab.addEventListener('click', () => switchTab('grade')); $('open-history').addEventListener('click', showHistory);
  document.querySelectorAll('[data-close-dialog]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  el.solution.addEventListener('click', async () => { try { const s = await api.solution(state.current.id); $('solution-title').textContent = state.current.title; $('solution-explanation').textContent = s.explanation || '해설이 없습니다.'; $('solution-sql').textContent = s.sql || ''; el.solutionDialog.showModal(); } catch (e) { toast(e.message || '해설을 불러오지 못했습니다.', true); } });
  $('import-pack').addEventListener('click', async () => { if (!api) return toast('앱 연결이 필요합니다.', true); if (state.busy) return; state.busy = true; updateActions(); try { if (!await saveDraft()) return; const r = await api.importPack(); if (!r.canceled) { toast(`${r.count || 0}개 문제를 가져왔습니다.`); await bootstrap(); } else if (r.error) toast(r.error, true); } catch (e) { toast(e.message || '문제팩을 가져오지 못했습니다.', true); } finally { state.busy = false; updateActions(); } });
  el.retry.addEventListener('click', async () => { if (!api) return setEngine({ ready: false, message: '앱 연결이 필요합니다' }); if (state.busy) return; state.busy = true; updateActions(); try { setEngine(await api.retryEngine()); } catch (e) { setEngine({ ready: false, message: e.message || '재연결 실패' }); } finally { state.busy = false; updateActions(); } });
  enableResize($('sidebar-resizer'), 'x', $('sidebar'), '--sidebar', 218, () => 390); enableResize($('main-resizer'), 'x', $('brief-panel'), '--brief', 280, () => window.innerWidth * .62); enableResize($('horizontal-resizer'), 'y', document.querySelector('.editor-wrap'), '--editor', 170, () => window.innerHeight - 270);
  if (api?.onBeforeClose && api?.closeReady) api.onBeforeClose(async () => { if (state.busy) return toast('실행이 끝난 뒤 창을 닫아 주세요.'); if (await saveDraft(state.current?.id, el.editor.value)) api.closeReady(); });

  async function bootstrap() {
    if (!api) { setEngine({ ready: false, message: '앱 연결이 필요합니다' }); el.save.textContent = '연결되지 않음'; clear(el.list); el.list.append(node('div', 'output-empty', 'Electron 앱에서 열어 주세요.')); return; }
    const selectedId = state.current?.id; if (selectedId && !await saveDraft(selectedId, el.editor.value)) return;
    try { const data = await api.bootstrap(); state.problems = data.problems || []; state.progress = data.progress || {}; state.current = null; setEngine(data.engine); el.save.textContent = '초안 자동 저장'; renderList(); const next = state.problems.find(p => p.id === selectedId) || state.problems[0]; if (next) await selectProblem(next.id, false, true); window.learningUI?.ready({selectProblem,saveDraft,busy:()=>state.busy, current:()=>state.current?.id, progress:()=>state.progress, levels, problems:state.problems}); }
    catch (error) { setEngine({ ready: false, message: '초기 연결 실패' }); el.save.textContent = '연결 실패'; toast(error.message || '앱 데이터를 불러오지 못했습니다.', true); }
  }
  api?.onEngineChanged?.(setEngine);
  bootstrap();
})();
