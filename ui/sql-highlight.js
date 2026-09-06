// ponytail: 기본 MySQL 모드의 표시용 분류다. SQL 모드별 분석이 필요해지면 전용 파서를 사용한다.
const sqlKeywords = new Set(('SELECT FROM WHERE AS DISTINCT ALL JOIN INNER LEFT RIGHT CROSS OUTER ON USING GROUP BY HAVING ORDER ASC DESC LIMIT OFFSET UNION INTERSECT EXCEPT WITH RECURSIVE OVER PARTITION ROWS RANGE BETWEEN UNBOUNDED PRECEDING FOLLOWING CURRENT ROW WINDOW CASE WHEN THEN ELSE END AND OR XOR NOT IS NULL TRUE FALSE IN EXISTS LIKE REGEXP RLIKE ESCAPE DIV MOD INTERVAL COLLATE BINARY INSERT INTO VALUES UPDATE SET DELETE CREATE ALTER DROP TABLE VIEW INDEX PRIMARY KEY FOREIGN REFERENCES DEFAULT UNIQUE CHECK CONSTRAINT DATABASE IF REPLACE TRUNCATE EXPLAIN DESCRIBE SHOW USE WITHIN NATURAL LATERAL EXCLUDE TIES BOTH LEADING TRAILING SEPARATOR DAY MONTH YEAR HOUR MINUTE SECOND').split(' '));
function tokenizeSQL(sql) {
  // 문자열·인용 식별자·주석을 먼저 소비하여 내부의 키워드를 건드리지 않는다.
  const pattern = /(--(?=[\s\x00-\x20]|$)[^\r\n]*|#[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:\\[\s\S]|''|[^'\\])*(?:'|$)|"(?:\\[\s\S]|""|[^"\\])*(?:"|$))|(`(?:``|[^`])*(?:`|$))|((?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\b|0x[\da-f]+\b)|([\p{L}\p{N}_$]+)|([\s\S])/giu;
  const tokens = [];
  for (const match of sql.matchAll(pattern)) {
    const text = match[0];
    const kind = match[1] ? 'comment' : match[2] ? 'string' : match[3] ? '' : match[4] ? 'number' : match[5] ?
      (sqlKeywords.has(text.toUpperCase()) ? 'keyword' : /^\s*\(/.test(sql.slice(match.index + text.length)) ? 'function' : '') : '';
    const previous = tokens[tokens.length-1];
    if (!kind && previous?.kind === '') previous.text += text;
    else tokens.push({text,kind});
  }
  return tokens;
}

// HTML로 해석하지 않고 텍스트 노드로만 표시하여 입력 SQL을 안전하게 보존한다.
function highlightSQL(target, sql) {
  const fragment = document.createDocumentFragment();
  for (const {text,kind} of tokenizeSQL(sql)) {
    const node = document.createElement('span');
    if (kind) node.className = `sql-${kind}`;
    node.textContent = text;
    fragment.append(node);
  }
  target.replaceChildren(fragment);
}
