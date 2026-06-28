# Google Translate on Cloudflare

基于 Cloudflare Worker 的 Google 翻译代理，将 `translate.googleapis.com` 的响应转换为标准化 JSON 接口。

## 功能特性

- 无状态反向代理 Google 翻译 API
- 标准化 JSON 响应格式：`{code, msg, text}`
- Python 客户端库，支持重试和备用端点
- 长文本自动拆分（超过 5000 字符）
- `workers.dev` 域名检测（中国大陆被屏蔽）

## 项目结构

```
├── src/
│   └── index.js          # Cloudflare Worker 实现
├── client/
│   ├── translate.py      # Python 客户端库
│   ├── conftest.py       # 测试配置
│   └── tests/            # 客户端测试
├── test/                 # Worker 测试 (vitest)
├── package.json          # Node.js 依赖
└── requirements.txt      # Python 依赖
```

## Worker API

### 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/translate_a/single` | 翻译接口（代理 Google 翻译） |
| `GET` | `/health` | 健康检查端点 |
| `GET` | `/openapi.json` | 获取 OpenAPI 规范 |

### 翻译端点 `GET /translate_a/single`

#### 请求参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `q`  | 是   | 待翻译文本（需 URL 编码） |
| `tl` | 是   | 目标语言代码 |
| `sl` | 否   | 源语言代码（默认 `auto`） |
| `client` | 是 | 必须为 `gtx` |
| `dt` | 是   | 必须为 `t` |

### 响应格式

**成功：**
```json
{
  "code": 0,
  "msg": "ok",
  "text": "翻译后的文本"
}
```

**失败：**
```json
{
  "code": 1,
  "msg": "错误描述"
}
```

### 健康检查端点 `GET /health`

用于运维探活，供监控系统判断服务是否存活。该端点不会调用上游 Google 翻译服务，始终返回 HTTP 状态码 200 的 JSON 响应。

**返回内容：**
```json
{
  "status": "ok",
  "environment": "production"
}
```

- `status`：服务状态，存活时固定为 `ok`。
- `environment`：当前运行环境标识，取值来自 `ENVIRONMENT` 环境变量（详见下文）。

### OpenAPI 规范端点 `GET /openapi.json`

用于获取描述 Worker HTTP API 的 OpenAPI 3.x 规范文档（JSON 格式），可据此理解端点契约、生成客户端代码或 API 文档。

通过一次 GET 请求即可获取完整规范：

```bash
curl https://<your-worker-domain>/openapi.json
```

返回 HTTP 状态码 200，`content-type` 为 `application/json`，响应体即完整的 OpenAPI 规范，涵盖 `/translate_a/single`、`/health`、`/openapi.json` 端点及标准化响应 schema。

## 环境变量

| 变量 | 含义 | 取值 |
|------|------|------|
| `ENVIRONMENT` | 标识当前运行环境，会在 `GET /health` 的响应中回显 | 常见取值为 `production`、`staging`；若未配置则回退为 `unknown` |

`ENVIRONMENT` 通过 `wrangler.toml` 的 `[vars]` 段进行配置：

```toml
[vars]
ENVIRONMENT = "production"
```

## Python 客户端

```python
from client.translate import translate

result = translate("Hello, world!", tl="zh-CN")
print(result)  # "你好，世界！"
```

### 客户端功能

- **URL 编码**：正确编码源文本
- **指数退避重试**：失败时指数退避（最多 5 次）
- **长文本拆分**：超过 5000 字符自动拆分
- **备用端点**：主端点失败后回退到 `clients5.google.com`
- **域名警告**：使用 `workers.dev` 域名时发出警告

## 开发

### 本地开发

启动本地开发服务器（基于 `wrangler dev`）：

```bash
npm install
npm run dev
```

服务启动后即可在本地访问 `/translate_a/single`、`/health` 与 `/openapi.json` 等端点进行调试。

### Worker 测试

```bash
npm test
```

### 客户端测试

```bash
cd client
pytest
```

## 部署

本项目支持两种部署方式：在本地手动推送部署，或通过 GitHub Actions 在合并到 `main` 分支后自动部署。两种方式都依赖 Cloudflare API Token 进行鉴权。

### 准备工作

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/profile/api-tokens) 创建 API Token。
   - 推荐使用 **Edit Cloudflare Workers** 模板，或自定义包含 `Account → Workers Scripts → Edit` 权限的 Token。
   - 妥善保存生成的 Token，它只会显示一次。
2. 按需在 `wrangler.toml` 的 `[vars]` 段中调整 `ENVIRONMENT` 等环境变量。

### 方式一：本地推送部署

适合首次部署、调试或临时发布。

1. 安装依赖：

   ```bash
   npm install
   ```

2. 配置 Cloudflare 凭据。推荐通过环境变量提供 API Token，避免泄露：

   ```bash
   # macOS / Linux
   export CLOUDFLARE_API_TOKEN="你的_token"

   # Windows PowerShell
   $env:CLOUDFLARE_API_TOKEN = "你的_token"

   # Windows CMD
   set CLOUDFLARE_API_TOKEN=你的_token
   ```

   也可以使用 `npx wrangler login` 通过浏览器进行 OAuth 登录授权。

3. （可选）部署前本地校验：

   ```bash
   npm test          # 运行 Worker 测试
   npx wrangler dev  # 本地启动并手动验证端点
   ```

4. 部署到 Cloudflare：

   ```bash
   npm run deploy
   ```

   该命令底层执行 `wrangler deploy`，会将 `src/index.js` 发布为名为 `googletranslate-on-cloudflare` 的 Worker。部署成功后终端会输出可访问的 Worker 域名。

### 方式二：GitHub 自动部署

仓库已内置 GitHub Actions 工作流（`.github/workflows/`），实现「推送即测试、合并即部署」的流程：

- **CI（`ci.yml`）**：在任意 `push` 与 `pull_request` 上触发，安装依赖并运行 `npm test`。
- **CD（`deploy.yml`）**：仅在代码推送/合并到 `main` 分支时触发，自动执行 `npx wrangler deploy` 部署到生产环境。该工作流使用 `production-deploy` 并发组，避免多次部署相互覆盖。

#### 一次性配置

1. 在 GitHub 仓库页面进入 **Settings → Secrets and variables → Actions**。
2. 点击 **New repository secret**，新增名为 `CLOUDFLARE_API_TOKEN` 的 Secret，值为上文创建的 API Token。

   > CD 工作流会在部署前校验该 Secret 是否存在，缺失或为空时会直接报错并终止，不会进行未鉴权部署。

3. （可选）绑定自定义域名：新增名为 `DOMAIN` 的配置，值填入标准域名格式，例如 `translate.api.example.com`（任意域名均可）。该值可放在 **Variables**（变量，推荐——域名并非敏感信息）或 **Secrets**（机密）中，工作流两者都支持，会优先读取变量。

   - 设置后，CD 会在部署时自动将 Worker 绑定到该自定义域名（`custom_domain`），并禁用默认的 `*.workers.dev` 域名（`workers_dev = false`）。这样可以规避 `workers.dev` 在部分网络环境下被屏蔽的问题。
   - 该变量为**可选**配置：不设置或留空时，工作流跳过此步骤，Worker 继续使用默认的 `workers.dev` 域名。
   - 域名所在的区域（Zone）必须托管在与 API Token 同一个 Cloudflare 账户下，且 Token 需具备绑定自定义域名所需的权限（Workers 脚本编辑 + 对应 Zone 的 DNS 编辑）。
   - 工作流会先对域名格式做校验，格式非法时直接报错终止，避免写入无效配置。
   - 绑定自定义域名时，wrangler 需要确定 Cloudflare 账户。工作流会自动用 API Token 查询区域列表（`GET /zones`），找到拥有该自定义域名的那个区域，并使用其所属账户的 ID，因此**无需**额外配置账户 ID。若需手动指定账户，可另外新增名为 `CLOUDFLARE_ACCOUNT_ID` 的仓库变量来覆盖自动解析结果。

#### 触发部署

完成配置后，按照常规 Git 流程操作即可：

```bash
git add .
git commit -m "你的改动说明"
git push origin main
```

推送到 `main`（或合并 PR 到 `main`）后，GitHub Actions 会自动运行并完成生产部署。可在仓库的 **Actions** 标签页查看部署进度与日志。

> 建议日常通过 Pull Request 协作：PR 会触发 CI 校验，待测试通过并合并到 `main` 后再由 CD 自动部署，从而保证只部署经过测试的代码。
