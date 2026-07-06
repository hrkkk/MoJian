# 墨笺 Markdown 编辑器

一个基于 TipTap、ProseMirror 和 Tauri 的所见即所得 Markdown 编辑器。

## 使用

Web 版本需要先构建。打开、保存单个文件时，建议通过 `localhost` 或 HTTPS 运行，并使用支持 File System Access API 的 Chromium 浏览器。

```powershell
npm.cmd run build:web
npm.cmd run preview:web
```

然后访问 Vite 输出的本地地址。

运行渲染器测试：

```powershell
node test.js
```

## Windows 桌面端

开发运行：

```powershell
npm.cmd run dev
```

构建 Windows 可执行程序和安装包：

```powershell
npm.cmd run build
```

构建产物位于 `src-tauri/target/release`，安装包位于其 `bundle` 子目录。

桌面端通过 Rust 后端使用系统原生文件选择器，并直接读取和写入磁盘文件。Web 版本使用浏览器 File System Access API。

## 已实现

- TipTap/ProseMirror 连续富文本编辑模型
- 单击放置光标、Enter 创建段落、Backspace 合并段落
- 跨段落选择、撤销与重做
- 所见即所得与 Markdown 源码模式切换
- 官方 TipTap Markdown 双向解析和序列化
- 标题、列表、任务列表、引用、代码块、表格等常用语法
- 常用格式工具栏与快捷键
- 浏览器本地自动保存
- 打开单个 Markdown 或文本文件进行编辑
- 将 Markdown/文本文件拖到窗口中直接打开
- 应用启动后默认最大化窗口
- 自动将修改写回当前磁盘文件
- 打开单个 Markdown 文件并下载编辑结果
- 明暗主题
- Tauri 2 Windows/Linux 桌面应用结构
