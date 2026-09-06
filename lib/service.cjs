// 화면에는 공개 문제만 보내고, 채점과 문제 가져오기는 하나씩 실행한다.
const fs = require('node:fs');
const path = require('node:path');
const { validatePack, compareResults, PracticeStore, atomicJSON } = require('./core.cjs');

class PracticeService {
  constructor(contentDirectory, directory, engine) {
    this.contentDirectory = contentDirectory;
    this.directory = directory;
    this.engine = engine;
    this.store = new PracticeStore(directory);
    this.packDirectory = path.join(directory,'problem-packs');
    fs.mkdirSync(this.packDirectory,{recursive:true,mode:0o700});
    this.reload();
  }
  reload() {
    const packs = [this.contentDirectory,this.packDirectory].flatMap(directory=>
      fs.readdirSync(directory).filter(file=>file.endsWith('.json') && file !== 'checks.json')
        .map(file=>validatePack(JSON.parse(fs.readFileSync(path.join(directory,file),'utf8')))));
    const ids = new Set(), packIds = new Set();
    for (const pack of packs) {
      if (packIds.has(pack.id)) throw new Error(`문제 팩 ID가 중복됩니다: ${pack.id}`);
      packIds.add(pack.id);
      for (const p of pack.problems) {
        if (ids.has(p.id)) throw new Error(`문제 ID가 중복됩니다: ${p.id}`);
        ids.add(p.id);
      }
    }
    this.packs = packs;
    this.entries = packs.flatMap(pack=>pack.problems.map(problem=>({pack,problem}))).sort((a,b)=>a.problem.level-b.problem.level || a.problem.id.localeCompare(b.problem.id));
  }
  entry(id) {
    const entry = this.entries.find(e=>e.problem.id===id);
    if (!entry) throw new Error('문제를 찾을 수 없습니다.');
    return entry;
  }
  bootstrap() {
    return {problems:this.entries.map(({pack,problem:p})=>({id:p.id,level:p.level,title:p.title,topic:p.topic,description:p.description,columns:p.columns,ordered:p.ordered,starter:p.starter,hints:p.hints,
      tables:pack.tables.filter(t=>p.tables.includes(t.name)).map(t=>({...t,rows:pack.datasets[0].rows[t.name]}))})),
      progress:this.store.progress,logs:this.store.logs(),engine:{ready:this.engine.ready,message:this.engine.message},dataPath:this.directory};
  }
  async exclusive(action) {
    if (this.busy) throw new Error('현재 실행이 끝난 뒤 다시 시도하세요.');
    // ponytail: 단일 사용자 앱이므로 한 번에 한 쿼리만 처리한다. 다중 사용자 전환 시 인스턴스를 분리한다.
    this.busy = true;
    try { return await action(); } finally { this.busy=false; }
  }
  saveDraft({id,sql,review=false}) { this.entry(id); return this.store.saveDraft(id,sql,review); }
  async run({id,sql}) {
    const {pack} = this.entry(id);
    return this.exclusive(async()=>{
      const start = Date.now();
      try {
        await this.engine.prepare(pack,0);
        return {status:'success',...await this.engine.query(sql)};
      } catch(error) { return {status:'error',columns:[],rows:[],elapsedMs:Date.now()-start,error:error.message}; }
    });
  }
  async submit({id,sql,review=false}) {
    const {pack,problem} = this.entry(id);
    return this.exclusive(async()=>{
      this.store.saveDraft(id,sql,review);
      const start = Date.now();
      const result = {status:'correct',passed:0,total:pack.datasets.length,cases:[],engineVersion:this.engine.version};
      try {
        for (let i=0;i<pack.datasets.length;i++) {
          await this.engine.prepare(pack,i);
          const expected = await this.engine.query(problem.solution);
          if (JSON.stringify(expected.columns) !== JSON.stringify(problem.columns)) throw new Error('문제의 기준 쿼리와 출력 열 정의가 일치하지 않습니다.');
          const actual = await this.engine.query(sql);
          const check = compareResults(expected,actual,problem.ordered);
          result.cases.push({name:i===0?'공개 예제':`숨겨진 테스트 ${i}`, ...check});
          if (check.passed) result.passed++;
        }
        result.status = result.passed === result.total ? 'correct' : 'wrong';
      } catch(error) {
        result.status='error'; result.error=error.message;
        result.cases.push({name:result.cases.length===0?'공개 예제':`숨겨진 테스트 ${result.cases.length}`,passed:false,message:error.message});
      }
      result.elapsedMs=Date.now()-start;
      return this.store.record(problem,sql,result);
    });
  }
  async importPack(file) {
    return this.exclusive(async()=>{
      if (fs.statSync(file).size > 5*1024*1024) throw new Error('문제 파일은 5MB 이하여야 합니다.');
      const pack=validatePack(JSON.parse(fs.readFileSync(file,'utf8')));
      if (this.packs.some(p=>p.id===pack.id)) throw new Error('이미 등록된 문제 팩 ID입니다.');
      if (pack.problems.some(p=>this.entries.some(e=>e.problem.id===p.id))) throw new Error('이미 등록된 문제 ID가 포함되어 있습니다.');
      // 가져온 SQL도 읽기 전용 계정으로 실행하여 정답이 실제로 실행 가능한지 확인한다.
      for (let i=0;i<pack.datasets.length;i++) {
        await this.engine.prepare(pack,i);
        for (const p of pack.problems) {
          const expected = await this.engine.query(p.solution);
          if (JSON.stringify(expected.columns)!==JSON.stringify(p.columns)) throw new Error(`${p.title}: 정답 쿼리의 출력 열이 정의와 다릅니다.`);
        }
      }
      atomicJSON(path.join(this.packDirectory,`${pack.id}.json`),pack);
      this.reload();
      return {canceled:false,count:pack.problems.length};
    });
  }
}
module.exports = {PracticeService};
