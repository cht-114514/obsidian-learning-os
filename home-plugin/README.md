# 首页（meinc-home）

Me.Inc 首页。打开先看到「继续做」，然后是阅读、复习、输出、写作、项目；Timebox、复利、Agent、AI 信箱在下一层。输出和写作共用编辑器，草稿在 `手记/草稿/`。阅读进度、划线和复习回合记在 `agent-inbox/meinc-home/activity-<deviceId>.jsonl`，不改外部原文。

运行时目录：`.obsidian/plugins/meinc-home/` 与 `.obsidian-mobile/plugins/meinc-home/`

本目录为源码。运行时只同步 `main.js`、`styles.css`、`manifest.json`（手机上不能 `require` 额外 js）。`problem-note.js` 与 `timebox.js` 只给测试用。

## 行为

- 启动时打开首页（设置可关）
- Timebox 在日期右侧（小窗，不铺全屏）。复利芯片在 Timebox 左边：每天记三问，写入 `资料库/复利/`，一周一份（文件名是周一）。开始小窗可选时长（预设 + 步进）、看今日/本周统计；运行中点卡片或底栏倒计时打开控制小窗（暂停、加时、提前完成、放弃）；结束有收尾卡（可选「做到哪了」、再来一块）。会话统计按设备写入 `agent-inbox/meinc-timebox/sessions-<deviceId>.json`，多设备 iCloud 合并读取；运行状态仍在插件 `data.json`。已取代 FocusFlow 番茄钟。
- 复习 → 今日混排队列（LexiDeck 词句 + 已读红楼梦推送 + 手动加入的资料库文章）；角标为待复习数
- 学习/输出 → 语文 / 数学 / 英语 / 物理 / 化学 / 地理；隐藏红楼梦推送夹、词汇夹与背诵默写笔记（可从复习屏「更多」进入）
- 复习进度账本：`agent-inbox/meinc-home/review-ledger.json`（iCloud 同步，不放插件 data.json）
- AI 信箱 → 顶部写信给 Grokbot；下面是未处理推送与回信（虚拟列表，不复制文件）
- 手记 / 项目库 → 实时列出子项（`项目库/_模板` 沉底）
- 今日日记 → 核心 Daily notes
- 资料库 → `资料库/`（与手记、项目库相同的文件夹浏览；可新建、移动、重命名、删除）
- 离开首页后左下角房子回到首页
- 学科 / 手记 / 项目库文件夹内可新建笔记和文件夹，条目「…」可移动、重命名、删除（进废纸篓）

不写四主区索引笔记。

v0.2 外观按 iOS：大标题日期、Control Center 色块、Settings 分组列表。

## AI 信箱

处理箱，不是聊天。推送点开是预览；「已读」才从列表消失。原文仍在原资料夹。写信 append 到 `agent-inbox/meinc-mailbox/INBOX.md`，只监听这一份笔记的保存，debounce 后 POST Grok Bot webhook。核验推送点「已读」也会 debounce POST 同一 webhook（`event: inbox_read`），并镜像到 `agent-inbox/meinc-mailbox/ACK.md` 与 `inbox-done.json`。回信在 `agent-inbox/meinc-mailbox/threads/`。红楼梦 / 早报 / 回信的「已读」只记状态，不叫醒。

当前流：

- `honglou` → `基础学科/语文/红楼梦/每日推送`，类型 `read`
- `check-push` → `项目库/高考工程/核验推送`，类型 `read`
- `hotbrief` → `项目库/信息收集`（只收文件名含「每日热点早报」），类型 `read`
- `grok-reply` → `agent-inbox/meinc-mailbox/threads`（排除 README），类型 `read`

以后的限时复测：在 `INBOX_STREAMS` 加一行即可。`type: "quiz"` 预留给交卷才算处理，这次没有答题引擎。

状态记在插件 `data.json` 的 `inboxDone`。首次启用会把目录里已有推送标成已处理，但留下最近 4 篇未读，避免箱子全空，也不把更早的旧文整批灌进来。

Webhook URL 与 sender key 只放插件设置，不写进 vault。桌面版打开 routine「Me.Inc 信箱唤醒」，复制字段本身：`https://api2.cursor.sh/automations/webhook/…` 和 `crsr_…`。不要贴 `grokbot://` 跳转链接。`data.json` 一般不跟 iCloud 走，手机要另贴一次。
