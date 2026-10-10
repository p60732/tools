# 測試

```sh
node trip/tests/gas.test.js            # 後端規則（直接跑 gas/*.gs，40 項）
# 前端測試需要先在 repo 根目錄起靜態伺服器： python3 -m http.server 8765
node trip/tests/local.e2e.js           # 本機模式回歸（20 項）
sh   trip/tests/run-sync.sh            # 全家同步：兩個瀏覽器＋跑真正 gas 程式的假後端（28 項）
node trip/tests/mock-server.js 8790    # 只起假後端（家庭密碼 family123）
```

前端測試需要 Playwright（`NODE_PATH=$(npm root -g)`）。
