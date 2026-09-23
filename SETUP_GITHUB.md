# GitHub Pages 部署

1. 把本目录全部文件上传到 GitHub 仓库根目录。
2. Repository → Settings → Pages。
3. Build and deployment 选择 `Deploy from a branch`。
4. Branch 选择 `main`，文件夹选择 `/ (root)`。
5. Save，等待 GitHub Pages 完成部署。

## AI

默认情况下无需填写任何 API Key：网页直接调用你已经配置好的 Cloudflare Worker：

`https://schedule-ai-proxy.yihuanchen219.workers.dev`

默认 AI 路径保持不变：
- `/zhipu`：图片识别
- `/deepseek`：课程结构校验

如果某个用户想使用自己的 AI：

`右上角 ⚙ → AI 服务设置 → 使用自定义 AI`

然后可以选择“自动识别”，或手动选择：
- OpenAI Chat Completions 兼容
- OpenAI Responses
- Gemini 原生
- Claude Messages

自定义模式要求用户自己提供 Base URL、API Key 和模型。Key 仅保存在该浏览器的 localStorage 中，并直接发送到用户填写的服务地址。

## 重要

不要把真实 API Key 写进 `index.html`、`app.js` 或 GitHub 仓库。
