# Nexus Mods 文件直下

进入具体文件的下载页后，自动向 Nexus Mods 索取下载地址并交给浏览器处理，省去前端五秒倒计时。

## 安装

1. 在浏览器安装 Tampermonkey（油猴）。
2. 打开下方安装链接，在油猴中确认安装。
3. 登录 Nexus Mods，照常点击 Manual Download，进入文件下载页后自动请求链接。

[安装脚本](https://raw.githubusercontent.com/LnGXi/nexus-direct-download/main/nexus-direct-download.user.js)

页面右下角会显示处理状态。接口失败时可以点击“重新索取链接”。

## 更新

从 GitHub 上面的链接安装后，油猴会按照自身的更新设置检查新版本。已经手动粘贴安装过初版的用户，需要从该链接安装一次发布版，才能获得更新地址。脚本名称和 namespace 保持与初版一致。

发布到 Greasy Fork 后，从 Greasy Fork 安装的用户由 Greasy Fork 提供更新。维护者更新本仓库时递增脚本头部的 @version，再同步到 Greasy Fork。

自动更新用于分发已发布的修补。Nexus 修改页面结构或下载接口后，仍需维护者适配并发布新版本。

## 当前功能

- 读取新版下载组件及开放 Shadow DOM 中的文件信息。
- 处理页面提供的下载地址和旧版 GenerateDownloadUrl 接口。
- 避免同一页面的重复自动请求。
- 切换文件后丢弃旧请求的下载结果。
- 显示登录失效、请求超时、限流等错误，并提供重试入口。

## 验证与反馈

初版手动下载已收到使用者反馈可用。开发时通过了 14 项模拟检查，覆盖接口参数、签名链接、错误响应、重复请求和切换文件等情况。管理器下载包含在代码和模拟检查中，实站兼容情况需要继续反馈。

失效时请在 Issues 中提供游戏名称、Mod 页面链接、浏览器和油猴版本，以及右下角的错误文字。

## 实现参考

下载接口和新版组件结构参考了 Nexus No Wait ++ 的公开实现。本仓库脚本独立编写。

[参考项目](https://github.com/torkelicious/nexus-no-wait-pp)

## 许可

MIT，见 LICENSE 文件。
