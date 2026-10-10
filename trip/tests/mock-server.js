/* 本機假後端：直接跑 gas/*.gs（Node 模擬 Apps Script），給前端端對端測試用
   用法：node mock-server.js [port]   家庭密碼：family123 */
const http = require('http');
const { makeEnv, setup } = require('./gas-sim');
const port = +(process.argv[2] || 8790);
const g = setup(makeEnv({ quiet: true }));
const srv = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.url === '/__admin/logout') { g.LOGOUT_EVERYONE(); res.writeHead(200, cors); return res.end('{}'); }
  if (req.url === '/__admin/dump') { res.writeHead(200, cors); return res.end(JSON.stringify(Object.fromEntries(g.__sheets[g.__props.SHEET_ID].sheets.map(s => [s.name, s.getLastRow() - 1])))); }
  if (req.method === 'GET') { res.writeHead(200, cors); return res.end(g.doGet().content); }
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    const out = g.doPost({ postData: { contents: body } }).content;
    res.writeHead(200, cors); res.end(out);
  });
});
srv.listen(port, () => console.log('mock GAS on http://localhost:' + port));
