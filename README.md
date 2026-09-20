# MiTranslator

在网页上右键选择 **Translate this page**，把整页翻译成你设置的语言。默认是简体中文。不经过 Google，页面文字会发送到腾讯交互翻译。

适用于 Chrome 和 Edge（Manifest V3）。

## 安装

1. 打开 `chrome://extensions`（Edge 用 `edge://extensions`）。
2. 打开右上角「开发者模式」。
3. 点「加载已解压的扩展程序」，选择本仓库里的 `extension` 目录，不要选仓库根目录。

改过 `src/` 之后，先在仓库根目录执行 `bun run build`，再到扩展管理页点刷新。

## 使用

- 在网页上右键，选择 **Translate this page**。点工具栏图标效果相同。
- 译文会替换页面上的原文。代码块、输入框里已有的内容，以及已经是目标语言的文字会跳过。
- 右上角会显示进度。译完后点「显示原文」，或再点一次菜单，可以还原。
- `chrome://` 页面和 PDF 阅读器无法注入扩展，图标上会显示红色 `!`。

## 设置语言

默认翻译为简体中文。要改的话：

1. 右键工具栏上的扩展图标，选择 **选项**。
2. 在「翻译为」里选语言，点 **保存**。

也可以选「跟随浏览器语言」。已经译过的页面需要先显示原文，再翻译一次。

## 开发

需要 [Bun](https://bun.sh/)。

```bash
bun install
bun test
bun run build
```

`src/` 是源码，`extension/` 是加载到浏览器里的构建结果。
