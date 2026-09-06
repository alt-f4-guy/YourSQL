// 기존 MySQL 실행 파일로 앱 전용 서버를 구동하고 읽기 쿼리만 실행한다.
const fs = require('node:fs');
const path = require('node:path');
const {mysqlCandidates,validSocket} = require('./platform.cjs');
const windows = process.platform === 'win32';
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomBytes } = require('node:crypto');
const mysql = require('mysql2');
const runFile = promisify(execFile);
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const quoted = name => '`'+name+'`';

class Engine {
  constructor(directory) {
    this.directory = directory;
    this.ready = false;
    this.message = 'MySQL 준비 중';
  }
  async start() {
    if (this.ready) return;
    if (this.starting) return this.starting;
    this.starting = this.initialize().catch(async error=>{
      this.message = `MySQL을 시작하지 못했습니다: ${error.message}`;
      await this.stop();
      throw error;
    }).finally(()=>{this.starting=null;});
    return this.starting;
  }
  async initialize() {
    const candidates = mysqlCandidates();
    const binary = candidates.find(file=>fs.existsSync(file));
    if (!binary) throw new Error('MySQL 서버 실행 파일을 찾을 수 없습니다. MySQL 8.0 이상을 설치하세요.');
    fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    const data = path.join(this.directory,'mysql-data');
    const staging = path.join(this.directory,'mysql-initializing');
    const log = path.join(this.directory,'mysql.log');
    if (!fs.existsSync(data)) {
      if (fs.existsSync(staging)) throw new Error(`이전 초기화가 끝나지 않았습니다. ${staging} 폴더를 확인하세요.`);
      fs.mkdirSync(staging,{mode:0o700});
      this.message = '처음 실행을 위한 연습 데이터베이스를 준비하고 있습니다.';
      await runFile(binary,['--no-defaults','--initialize-insecure',`--datadir=${staging}`,`--log-error=${log}`],{timeout:90000,windowsHide:true});
      fs.renameSync(staging,data);
    }
    // 비정상 종료 뒤 남은 서버는 저장된 소켓과 실제 데이터 경로를 확인한 뒤 재사용한다.
    const socketFile=path.join(this.directory,'mysql-socket');
    if (fs.existsSync(socketFile)) {
      try {
        const socket=fs.readFileSync(socketFile,'utf8');
        if (!validSocket(socket)) throw new Error('잘못된 전용 소켓 경로');
        this.admin=await this.connectAdmin(socket,data);
        this.socketPath=socket;this.socketDirectory=windows?null:path.dirname(socket);
      } catch {this.admin=null;}
    }
    if (!this.admin) {
    // Unix 소켓 경로 길이 제한 때문에 짧은 임시 폴더를 사용한다. 권한은 소유자만 허용한다.
    if (windows) {
      // 같은 사용자로 실행한 MySQL의 로컬 명명 파이프를 사용한다. TCP는 열지 않는다.
      this.socketPath = '\\\\.\\pipe\\yoursql-'+randomBytes(16).toString('hex');
    } else {
      this.socketDirectory = fs.mkdtempSync(path.join('/tmp','aura-sql-'));
      fs.chmodSync(this.socketDirectory,0o700);
      this.socketPath = path.join(this.socketDirectory,'mysql.sock');
    }
    fs.writeFileSync(socketFile,this.socketPath,{mode:0o600});
    this.child = spawn(binary,['--no-defaults',`--datadir=${data}`,`--socket=${windows?this.socketPath.slice('\\\\.\\pipe\\'.length):this.socketPath}`,...(windows?['--enable-named-pipe']:[]),`--pid-file=${path.join(this.directory,'mysql.pid')}`,`--log-error=${log}`,
      '--skip-networking','--mysqlx=OFF','--skip-log-bin','--performance-schema=OFF','--innodb-buffer-pool-size=67108864','--innodb-redo-log-capacity=33554432','--max-allowed-packet=4194304','--local-infile=OFF','--secure-file-priv=NULL'],{stdio:'ignore',windowsHide:true});
    let spawnError;
    this.child.on('error',error=>{spawnError=error;});
    this.child.on('exit',()=>{this.ready=false;});
    for (let attempt=0;attempt<200;attempt++) {
      if (spawnError) throw spawnError;
      if (this.child.exitCode !== null) throw new Error(`서버가 종료되었습니다. ${log}에서 오류를 확인하세요.`);
      try {
        this.admin = await this.connectAdmin(this.socketPath,data);
        break;
      } catch { if (this.admin) this.admin.destroy(); this.admin=null; await delay(150); }
    }
    if (!this.admin) throw new Error('연습 서버 시작 시간이 초과되었습니다.');
    }
    const [version] = await this.admin.query('SELECT VERSION() AS version');
    this.version = version[0].version;
    this.password = randomBytes(24).toString('hex');
    await this.admin.query("CREATE USER IF NOT EXISTS 'learner'@'localhost' IDENTIFIED BY ?",[this.password]);
    await this.admin.query("ALTER USER 'learner'@'localhost' IDENTIFIED BY ?",[this.password]);
    await this.admin.query('CREATE DATABASE IF NOT EXISTS practice CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
    await this.admin.query("GRANT SELECT ON practice.* TO 'learner'@'localhost'");
    this.ready = true;
    this.message = `MySQL ${this.version} · 로컬 전용`;
  }
  async connectAdmin(socketPath,data) {
    const raw=mysql.createConnection({socketPath,user:'root',connectTimeout:1000});
    raw.on('error',()=>{this.ready=false;this.message='MySQL 연결이 끊겼습니다. 재연결해 주세요.';});
    const connection=raw.promise();
    try {
      const [rows]=await connection.query({sql:'SELECT @@datadir AS directory',timeout:2000});
      if (fs.realpathSync(rows[0].directory)!==fs.realpathSync(data)) throw new Error('다른 데이터베이스 서버에는 연결하지 않습니다.');
      return connection;
    } catch(error) {connection.destroy();throw error;}
  }
  async prepare(pack, index) {
    if (!this.ready) throw new Error('MySQL 연결을 먼저 확인하세요.');
    // 이 데이터베이스는 앱이 직접 시작한 전용 서버 안에만 존재한다.
    await this.admin.query('DROP DATABASE IF EXISTS practice');
    await this.admin.query('CREATE DATABASE practice CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
    for (const table of pack.tables) {
      await this.admin.query(`CREATE TABLE practice.${quoted(table.name)} (${table.columns.map(c=>`${quoted(c.name)} ${c.type}`).join(', ')})`);
      const rows = pack.datasets[index].rows[table.name];
      if (rows.length) await this.admin.query(`INSERT INTO practice.${quoted(table.name)} VALUES ?`,[rows]);
    }
  }
  async query(sql) {
    if (!this.ready) throw new Error('MySQL 연결이 끊겼습니다. 다시 연결해 주세요.');
    if (typeof sql !== 'string' || sql.length > 50000 || !sql.trim()) throw new Error('SQL을 1~50,000자 사이로 작성하세요.');
    const leading = sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|#[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/,'');
    if (!/^(SELECT|WITH)\b/i.test(leading)) throw new Error('조회용 SELECT 또는 WITH 쿼리만 실행할 수 있습니다.');
    const connection = mysql.createConnection({socketPath:this.socketPath,user:'learner',password:this.password,database:'practice',
      multipleStatements:false,rowsAsArray:true,supportBigNumbers:true,bigNumberStrings:true,dateStrings:true,connectTimeout:2000});
    // 취소 직후 쿼리 응답보다 늦게 도착한 연결 종료 이벤트도 처리한다.
    connection.on('error',()=>{});
    const started = Date.now();
    try {
      await connection.promise().query('SET SESSION max_execution_time=3100');
      await connection.promise().query('SET SESSION cte_max_recursion_depth=1000');
      await connection.promise().query('START TRANSACTION READ ONLY');
      return await new Promise((resolve,reject)=>{
        let done = false, bytes = 0, fields = [], rows = [];
        const finish = (error) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve({columns:fields.map(f=>f.name),numeric:fields.map(f=>[0,1,2,3,4,5,8,9,13,246].includes(f.columnType)),rows,elapsedMs:Date.now()-started});
        };
        const abort = async message => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          // 서버 제한을 힌트로 해제하거나 SLEEP을 호출해도 실제 연결을 강제로 종료한다.
          try { await this.admin.query(`KILL CONNECTION ${Number(connection.threadId)}`); } catch {}
          connection.destroy();
          reject(new Error(message));
        };
        const timer = setTimeout(()=>{void abort('실행 제한 시간 3초를 초과하여 중단했습니다.');},3000);
        const query = connection.query(sql);
        query.on('fields',value=>{fields=value;});
        query.on('result',row=>{
          if (done) return;
          bytes += Buffer.byteLength(JSON.stringify(row));
          if (rows.length >= 1000 || bytes > 2*1024*1024) { void abort('결과 제한(1000행 또는 2MB)을 초과했습니다.'); return; }
          rows.push(row);
        });
        query.on('error',error=>finish(new Error(error.errno === 3024 || error.errno === 1317 ? '실행 제한 시간 3초를 초과하여 중단했습니다.' : `MySQL 오류: ${error.message}`)));
        query.on('end',()=>finish());
      });
    } finally { connection.destroy(); }
  }
  async stop() {
    this.ready = false;
    if (this.admin) {
      try { await this.admin.query({sql:'SHUTDOWN',timeout:2000}); } catch {}
      this.admin.destroy();
      this.admin=null;
    }
    const child = this.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(5000)]);
    }
    this.child=null;
    if (this.socketDirectory && (!child || child.exitCode !== null || child.signalCode !== null)) {
      fs.rmSync(this.socketDirectory,{recursive:true,force:true});
      this.socketDirectory=null;
    }
  }
}
module.exports = {Engine};
