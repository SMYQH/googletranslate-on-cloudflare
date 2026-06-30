# 🌐 Google Translate on Cloudflare

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Python 3.11](https://img.shields.io/badge/Python-3.11-blue?logo=python&logoColor=white)](https://www.python.org/)
[![CI/CD](https://img.shields.io/badge/GitHub%20Actions-Deploy-2088FF?logo=githubactions&logoColor=white)](./.github/workflows/)

基于 Cloudflare Worker 的 Google 翻译无状态反向代理，将 `translate.googleapis.com` 的响应转换为标准化的 JSON 接口，并提供开箱即用的 Python 客户端。

## ✨ 核心特性

- 🚀 **无状态代理**：基于 Cloudflare Edge Network，全球低延迟。
- 📦 **标准化响应**：统一输出 `{code, msg, text}` 格式的 JSON，告别 Google 原生复杂的数组结构。
- 🐍 **Python 客户端**：内置指数退避重试、长文本自动拆分（>5000 字符）及备用端点回退。
- 🛡️ **域名防屏蔽**：支持自定义域名绑定，规避 `workers.dev` 在部分网络环境下的连通性问题。
- 📖 **OpenAPI 支持**：内置 `/openapi.json` 端点，方便生成各类语言的客户端代码。

## 📑 目录

- [快速开始](#-快速开始)
- [Worker API 文档](#-worker-api-文档)
- [Python 客户端](#-python-客户端)
- [部署指南](#-部署指南)
- [项目结构](#-项目结构)
- [开发指南](#-开发指南)

---

## 📡 Worker API 文档

### 翻译接口 `GET /translate_a/single`
代理 Google 翻译核心接口，返回标准化 JSON。

**请求参数 (Query Parameters):**

| 参数 | 必填 | 类型 | 说明 |
|------|:----:|------|------|
| `q` | ✅ | string | 待翻译文本（需 URL 编码） |
| `tl` | ✅ | string | 目标语言代码（如 `zh-CN`, `en`） |
| `sl` | ❌ | string | 源语言代码（默认 `auto`） |
| `client` | ✅ | string | 必须为 `gtx` |
| `dt` | ✅ | string | 必须为 `t` |

**响应示例:**

✅ **成功 (HTTP 200)**
```json
{
  "code": 0,
  "msg": "ok",
  "text": "翻译后的文本"
}
```

❌ **失败**
```json
{
  "code": 1,
  "msg": "错误描述"
}
```

### 辅助接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查。返回 `{"status": "ok", "environment": "..."}`，不调用上游服务。 |
| `GET` | `/openapi.json` | 获取 OpenAPI 3.x 规范文档，用于代码生成。 |

---

## 🐍 Python 客户端

- **URL 自动编码**：无需手动处理特殊字符。
- **指数退避重试**：网络波动时自动重试（最多 5 次）。
- **长文本拆分**：自动将超过 5000 字符的文本分块请求。
- **高可用回退**：主端点失败时，自动切换至 `clients5.google.com` 备用通道。
- **环境检测**：若检测到使用被屏蔽的 `workers.dev` 域名，会输出警告提示。

---

## 🌍 部署指南

本项目支持**本地手动部署**与 **GitHub Actions 自动化部署**。

### 准备工作
1. 获取 [Cloudflare API Token](https://dash.cloudflare.com/profile/api-tokens)（需具备 `Edit Cloudflare Workers` 权限）。
2. 配置环境变量：
   ```bash
   export CLOUDFLARE_API_TOKEN="your_token_here"
   ```

### 方式一：本地手动部署
适合首次部署或临时调试。
```bash
npm run deploy
```
> 执行后，终端将输出分配的 `*.workers.dev` 域名。

### 方式二：GitHub Actions 自动部署 (推荐)
仓库已内置 CI/CD 流程，实现**「推送即测试、合并即部署」**。

1. **配置 Secrets**：在 GitHub 仓库 `Settings -> Secrets -> Actions` 中添加 `CLOUDFLARE_API_TOKEN`。
2. **配置自定义域名 (可选)**：在 `Variables` 中添加 `DOMAIN`（如 `translate.example.com`）。
   - *优势*：自动绑定自定义域名并禁用 `workers.dev`，解决部分地区网络屏蔽问题。
3. **触发部署**：
   ```bash
   git push origin main
   ```
   合并至 `main` 分支后，CD 工作流会自动完成生产环境发布。

---

## 📂 项目结构

```text
├── src/
│   └── index.js          # Cloudflare Worker 核心逻辑
├── client/
│   ├── translate.py      # Python 客户端库
│   └── tests/            # 客户端单元测试
├── test/                 # Worker 单元测试 (Vitest)
├── .github/workflows/    # CI/CD 自动化流程
├── package.json          # Node.js 依赖与脚本
└── requirements.txt      # Python 依赖
```

---

## 🛠️ 开发指南

### 本地调试
```bash
npm run dev
```
启动后可直接访问 `http://localhost:8787/health` 验证服务状态。

### 运行测试
```bash
# Worker 测试 (Vitest)
npm test

# Python 客户端测试 (Pytest)
cd client && pytest
```

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
在提交 PR 前，请确保所有测试用例（Worker 和 Python 客户端）均已通过。

## 📄 许可证

本项目基于 APGL V3 许可证开源 - 详见 [LICENSE](LICENSE) 文件。
