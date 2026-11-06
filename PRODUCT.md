# Telay

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

访问自己设备上 HTTP 应用的用户，包含手机与桌面浏览器。日常任务是配对设备并打开应用，不是浏览技术演示。

## Product Purpose

提供通用连接入口：粘贴连接器输出的 tc 配对地址，连接后独立显示设备上的应用。网站不承接业务中继流量，不要求用户自建中继服务器。

## Capabilities and Constraints

- 保留 Tailcat 公共 DERP 加密后备和 WebRTC 局域网直连优先，实际协商成功才显示直连。
- 初始协商仍依赖公共 DERP。相同网段不保证直连，不扫描网段。
- 连接器仅访问配置的 loopback HTTP 上游与同源 WebSocket；DSH 是可选接入示例，不修改其源码。
- 配对地址作为凭证，仅在当前 origin 的 localStorage 记住最多五条成功连接记录；可清除、不上传、不自动连接，并提示共享设备风险。独立应用页自己维护连接，不依赖 iframe、parent 或 opener。
- 上游 GET 缓存遵循 HTTP 缓存头，按配对凭证摘要隔离，存于浏览器 CacheStorage；支持条件校验与 304，no-store 不存，未知 Vary/Range 旁路，写操作失效缓存。连接引擎与站点资源使用原生 HTTP cache，内容版本路径加缓存头配置；实际缓存效果取决于托管响应头，不假定所有平台支持 _headers。
- 保留 wget/curl 安装、Windows ZIP；页面不展示源码与许可证入口，下载包仍提供第三方许可和源码。命令与二进制统一 Telay 名称；--web 为连接网站，--upstream 为本机服务 URL。安装与启动是两步，安装不自动执行连接器。
- Telay 默认按浏览器的受支持语言优先级使用简体中文、英文或日文，未匹配时回退英文；支持主动选择并记忆、恢复自动。切换不刷新或断开连接，不改变上游应用或终端连接器的语言。
- 试用公共服务无 SLA；支持 SSE，现有限制包括非 SSE 长 HTTP 流、上游自带 Service Worker 与跨域登录。

## Brand Commitments

用户确认 Claude 式温暖、留白、克制的视觉气质。用 Telay / 连接设备表达通用服务，不复制 Claude 品牌标识。首屏只留配对与连接，安装、帮助和诊断渐进披露，删除宣传与演示内容。

## Product Principles

- 一个页面只有一个主要操作。
- 简化展示，不删除连接能力或必要安全提醒。
- 错误说明原因与恢复动作，不伪造状态、进度或测速结果。
- 不修改外部应用，不安装用户电脑上的插件或自动钩子。
