# cf-poc-104 — 驗證 Cloudflare Worker 能否打 104:8443

這是「全 Cloudflare（純 serverless）部署」可行性的**生死驗證**。

## 為什麼需要這個

104 的 API 在非標準埠 `:8443`。Cloudflare Workers 的 `fetch()` 有個已知 bug
([GitHub #5998](https://github.com/cloudflare/workerd/issues/5998))：它會把 `:8443`
**靜默當成 `:443`**，連付費方案都修不掉。唯一繞法是用 Workers 的 `connect()` 原生
TCP socket，自己手寫 HTTP/1.1。

這個 PoC 就是要證明：

1. `connect()` + 手寫 HTTP/1.1 **能不能拿到 104 的回應**（狀態列、headers、body）
2. `Set-Cookie` **能不能正確抓到**
3. 下一個請求帶上 `Cookie` **104 接不接受**（session 串得起來 → 登入後才能查資料）

只要這三點過，全 Cloudflare 路線（Pages + Workers/Hono + D1 + Durable Object alarms）
在 `:8443` 這個最大的坑就清掉了。

## 跑法

```bash
cd cf-poc
npm install
npm run dev          # wrangler dev，本地起在 http://localhost:8787
```

### 1) 連線層測試（不需帳密，先跑這個）

```
http://localhost:8787/
```

預期：回 JSON，`connTest.status` 是 104 給的真實 HTTP 狀態碼（例如 200 / 404 /
500，重點是「有拿到回應」而不是連線錯誤）。能看到 `headers`、`bodySnippet` 就代表
**socket + 手寫 HTTP/1.1 解析整條都通了**。

### 2) 真實登入測試（自己換測試帳密）

```
http://localhost:8787/?mode=login&groupUBINo=XXX&companyID=YYY&account=ZZZ&credential=PPP
```

預期：
- `step1_login.status` = 200，`step1_login.setCookies` 有抓到 cookie，
  `bodySnippet` 是 104 的 XML-wrapped JSON（裡面有 `FunctionExecResult`）。
- `step2_withCookie.sentCookie` 非空 → 代表 cookie 串接成功。

> ⚠️ 帳密只走 query string，純本地測試用，**不要部署到正式環境用這種方式傳帳密**。
> 正式版會走 POST body + Web Crypto 解密既有的 `encryptedToken`。

## 驗證通過後的下一步

PoC 通過 → 代表 `hr104.adapter.ts` 裡所有 `axios` 對 104 的呼叫，
都可以換成這套 `httpRequest()`（connect socket 版）。屆時整包就能搬上純 Cloudflare：

| 現在 | 搬到 Cloudflare |
|---|---|
| Express 5 | Hono（或 wrangler 原生 httpServerHandler） |
| Prisma + PostgreSQL | D1（SQLite，schema 幾乎照搬，無 `@db.*` 原生型別） |
| Go in-memory `time.AfterFunc` 排程 | Durable Object alarms（秒級）或 Cron Triggers（分鐘級） |
| `jsonwebtoken` | `jose` |
| `node:crypto` AES-256-CBC | Web Crypto `crypto.subtle`（舊密文格式相容，DB 免重新加密） |
| `axios` → 104:8443 | **本 PoC 的 `connect()` socket**（解掉 :8443 的坑） |
