---
name: Telay
description: 温暖、留白、克制的设备连接界面
colors:
  accent: "#a74d35"
  accent-dark: "#8e3f2b"
  ink: "#302d29"
  muted: "#6c675f"
  paper: "#f7f5f0"
  surface: "#eeebe4"
  line: "#d4cfc5"
  danger: "#a33429"
  white: "#ffffff"
  selection: "#e9d1c3"
typography:
  title:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "30px"
    fontWeight: 500
    lineHeight: "36px"
    letterSpacing: "-0.025em"
  brand:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "18px"
    fontWeight: 500
    lineHeight: "28px"
    letterSpacing: "-0.025em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "24px"
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  control:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  caption:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "20px"
  menu:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  field:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  code:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "24px"
rounded:
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "28px"
  "8": "32px"
  "9": "36px"
  "10": "40px"
  "12": "48px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.white}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.accent-dark}"
  button-quiet:
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-quiet-hover:
    backgroundColor: "{colors.surface}"
  field:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.field}"
    rounded: "{rounded.lg}"
    padding: "16px"
  field-disabled:
    backgroundColor: "{colors.surface}"
  disclosure-summary:
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    padding: "16px 0"
  menu-panel:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    padding: "8px"
    width: "288px"
  menu-item:
    textColor: "{colors.ink}"
    typography: "{typography.menu}"
    rounded: "{rounded.md}"
    padding: "12px 8px"
  code-block:
    backgroundColor: "{colors.surface}"
    typography: "{typography.code}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: Telay

## Overview

沿用用户确认的 Claude 式温暖、留白、克制气质，只表达 Telay 自身，不复制其品牌标识。以清晰的操作、安静的说明和渐进披露组织信息；不增加宣传、演示或装饰性内容。

本记录提取当前入口、独立连接页及应用内连接控件。首屏单栏是连接表面的现有布局，不是所有未来页面的全局约束。

## Colors

主色为低饱和暖褐红：`accent` 用于主要操作、焦点与输入光标，`accent-dark` 用于主按钮悬停。中性色以 `paper` 为页面底色，`surface` 承载命令、选中项及安静按钮的悬停；`ink` 为正文，`muted` 为说明，`line` 为边框与分隔，`white` 为输入底色和主按钮文字。`danger` 仅表达错误；`selection` 用于选中文本。

## Typography

使用系统无衬线字体，不引入品牌字体。页面标题采用 `title`，Telay 字标采用 `brand`；主要操作标签使用 `label`，安静操作与折叠标题使用 `control`，安装正文使用 `body`，状态及安全说明使用 `caption`。紧凑菜单使用 `menu`；配对地址和命令分别采用等宽的 `field`、`code`。诊断数值使用等宽数字。

## Layout

连接页主体居中，最大宽度为（512px），不保留页脚或来源/许可证入口。手机和桌面保留同一操作顺序；从（640px）起仅增加页头左右留白与主体顶部留白。安装、帮助与诊断通过折叠逐步展开，而非并列铺开。

应用内连接控件位于视口右下角，不包裹或重新设计外部应用。入口菜单的宽度受视口限制；运行时菜单另有高度限制与内部滚动，避免在小屏溢出。

## Elevation & Depth

静态表面不使用投影。以暖色底层、细边框和分隔线区分层次；菜单通过定位覆盖内容，不加入抬升效果。键盘焦点采用主色双像素焦点环及双像素间隔，运行时控件使用等效轮廓。

## Shapes

使用轻圆角：`lg` 对应主按钮、输入、命令容器与运行时菜单入口，`md` 对应安静操作，`xl` 对应展开的菜单。输入和菜单用细实线边框；折叠箭头由两条细线组成，不引入额外装饰图形。

## Components

- 主按钮：最小高度（48px），正常、连接中、打开中和已连接状态沿用同一外观；忙碌时禁用，使用小尺寸加载图标与底部细线扫动；按压轻微缩放，就绪箭头出现并随悬停轻移，不表示百分比进度。安静按钮与菜单操作的最小触控高度为（44px）。
- 配对输入：最小高度（56px），密码输入、等宽文字，不自动补全；无效时改变边框并关联错误说明，连接期间禁用。
- 折叠：原生 `details` / `summary`，整行可操作；安装和帮助的箭头随展开状态反向，内部文字保持克制。
- 导航：页头显示 Telay 首页链接与平面的「中 EN 日」语言入口，原生 details 展开选择自动/简体中文/英文/日文；无边框、阴影或立体感，外部点击与 Escape 收起。页面删除实验说明、来源和许可证链接，下载包保留第三方许可。连接菜单收纳新标签页、诊断和断开；应用内菜单另含全屏和语言选择，重新配对只在断开后出现。
- 安装工具切换：`wget` / `curl` 使用安静按钮，选中态以底色、字重和文字色区分，并保留 `aria-pressed`。命令容器使用柔和底色与独立复制按钮。
- 下载与启动：三个系统行配朴素图标，五个平台包及二进制统一 telay 名称；推荐 --web 与 --upstream，旧 --site 仅兼容。上游 URL 输入只留当前页内存，不保存或上传。
- 最近连接：有成功记录时在输入下显示原生选择器和清除按钮，仅显示简短应用名与地址末尾，不展示完整凭证；没有记录不占空间。地址默认预填但不自动连接，保存与缓存均只在本浏览器，保留共享设备提醒。
- 状态与反馈：连接状态使用 `role="status"`，错误使用 `role="alert"` 并包含恢复动作。颜色变化采用短过渡；尊重减少动态效果偏好。

## Do's and Don'ts

- Do 保留可见的键盘焦点、触控面积和不只依赖颜色的状态说明。
- Do 用折叠承载次要帮助，同时保留必要安全提醒和恢复动作。
- Don't 复制 Claude 品牌标识，新增营销或演示内容。
- Don't 伪造连接状态、速度或进度，或为了简化界面删除连接能力。
- Don't 将连接页的单栏布局扩展为其他表面的硬性规则，或改造外部 DSH 应用。

## Transport Contract

保留通用、独立页面和局域网直连优先的方案，不增加界面控件。连接时协商 `http-stream-v1` 与 `http-cache-v1`；旧连接器的普通 HTTP/WS 继续可用，但禁用不可靠缓存，SSE 需更新连接器。

普通 HTTP 保持有界缓冲，SSE 根据上游 `text/event-stream` 类型流式传输，支持原生 EventSource 与 POST fetch、单块信用背压、取消与 Last-Event-ID。首部 90 秒，SSE 正文不设总时限；断线使当前流报错，不自动重放写请求。业务连接由独立应用页维护，Service Worker 仅适配同源请求。

上游可缓存响应及标准缓存策略存于此 origin 的 CacheStorage，按配对凭证摘要隔离；SSE 不进入完整响应缓存。最近地址与语言偏好保留 localStorage；站点和加密引擎使用原生 HTTP 缓存，效果取决于托管响应头。不修改上游源码，不新增数据库或自建中继。
