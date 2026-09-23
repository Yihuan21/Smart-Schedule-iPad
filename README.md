# 智能课程表 · iPad 版

这是一个纯静态 GitHub Pages 网站，AI 请求通过已有 Cloudflare Worker 转发。

## 主要功能

- iPad Chrome / Safari 友好
- 横竖屏自适应
- 安全区适配
- PWA / 添加到主屏幕
- 底部操作栏
- 第 1～20 周
- 每周独立本地保存
- 第 3/4/5 周旧缓存与打卡状态一次性清理
- 上传课程表图片
- 图片压缩后发送到 Worker
- AI 课程识别
- 低置信度结果二次核对
- 结构校验与格式修复
- 时间冲突检测
- 识别结果预览后再应用
- 课程名称、星期、开始/结束时间、地点、类型、任务、颜色可编辑
- 点击、编辑按钮、长按 650ms 都可编辑
- 删除课程
- 自动保存
- 新手帮助弹窗
- Worker 地址不包含任何 API Secret

## Worker

前端使用已有 Worker：

https://schedule-ai-proxy.yihuanchen219.workers.dev

接口：

- POST `/zhipu`
  - `{image, prompt, model?}`
- POST `/deepseek`
  - `{messages, model?, temperature?}`

Secrets 仍只保存在 Cloudflare Worker 中，不放进 GitHub。

## GitHub Pages

建议：

- Repository: Public
- Branch: `main`
- Folder: `/ (root)`
- 不需要 Node / Python / 构建步骤

