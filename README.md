# Smart-Schedule-iPad

iPad / Chrome 友好的智能课程表。默认使用现有 Cloudflare Worker，不改变原有 `/zhipu` 与 `/deepseek` 接口；同时允许用户在网页右上角设置中切换自定义 AI。

## AI 兼容方式

### 默认模式（推荐）
- 识图：现有 Worker `/zhipu`
- 结构校验：现有 Worker `/deepseek`
- Worker 地址固定为：`https://schedule-ai-proxy.yihuanchen219.workers.dev`
- 默认模式不会把你的 DeepSeek / 智谱 Key 放进 GitHub Pages。

### 自定义模式
右上角 `⚙` → `AI 服务设置` → `使用自定义 AI`。

支持：
- OpenAI Chat Completions 兼容接口
- OpenAI Responses API
- Gemini 原生 `generateContent`
- Anthropic Claude Messages API

协议可以选择“自动识别”。对于大量采用 OpenAI-compatible 协议的模型平台，只需要填写 Base URL、API Key 和模型名即可。

> 自定义模式的 API Key 保存在当前浏览器 localStorage，并直接发送给你填写的服务地址。公开部署时，建议使用自己的后端/代理，而不是把个人 Key 写进网页源码。

## 数据隔离

当前课程数据保存在浏览器 localStorage，并按周次分开保存。不同设备/浏览器默认不会共享课程数据；当前版本还没有账号系统，因此同一浏览器配置文件下使用同一个网站的人会看到同一份本地数据。

如果以后需要真正的“账号级多用户隔离 + 多设备同步”，需要在 Cloudflare Worker 后增加认证和按用户 ID 隔离的数据库/存储层。

## GitHub Pages

Repository → Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/ (root)` → Save。
