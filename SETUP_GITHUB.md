# 从零配置 GitHub Pages（iPad 操作）

## 1. 新建仓库

GitHub → 右上角 `+` → `New repository`

建议仓库名：

`Smart-Schedule-iPad`

设置：

- Owner：你的 GitHub 账号
- Repository name：Smart-Schedule-iPad
- Description：iPad AI Smart Schedule
- Public
- Add README：不要勾选
- .gitignore：不要选
- License：不要选

点击 `Create repository`。

## 2. 上传项目文件

进入新仓库：

`Add file` → `Upload files`

把这个工程解压后的全部文件和文件夹上传。

必须保证根目录直接看到：

- index.html
- app.js
- style.css
- modules/
- manifest.webmanifest
- sw.js
- icon-192.png
- icon-512.png

特别注意：不要变成 `Smart-Schedule-iPad/smart-schedule-ipad/index.html` 这种双层目录。

上传后点击：

`Commit changes`

## 3. 开启 GitHub Pages

进入：

`Settings` → `Pages`

在 `Build and deployment`：

- Source：`Deploy from a branch`
- Branch：`main`
- Folder：`/(root)`

点击 `Save`。

等待 GitHub Pages 完成部署。

网址格式：

`https://你的用户名.github.io/Smart-Schedule-iPad/`

## 4. 第一次测试

打开网址：

1. 点 `?`
2. 点 `关闭`
3. 点 `手动添加课程`
4. 修改课程名称、时间、颜色
5. 刷新页面
6. 检查课程是否仍在
7. 再测试上传课程表图片

## 5. iPad 添加到主屏幕

Safari 打开网站：

分享 → `添加到主屏幕`

如果已经打开 PWA，之后可以像 App 一样使用。

## 6. AI 测试

上传一张清晰完整的课程表图片。

正常流程：

图片 → 压缩 → `/zhipu` → JSON → 低置信度二次核对 → `/deepseek` 结构校验 → 冲突检测 → 预览 → 应用 → 本地保存

如果 AI 报错：

先不要修改 Worker Secret。

先确认 Worker 根地址仍然显示：

`{"ok":true,"service":"schedule-ai-proxy","endpoints":["/zhipu","/deepseek"]}`

