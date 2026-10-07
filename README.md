# world.execute(me); — ASCII / CRT 单文件 MV

双击 `index.html` 即可播放。**不需要服务器、不需要构建、不引用任何外部库**（无 CDN、无 WebGL）。

> **部署到 GitHub Pages / 音频放哪**：在风格选择页按 **`M`** 打开 `AUDIO SOURCE` 面板，可以
> ①用内置文件 ②上传本地音频 ③直接填网址。有了 ③，音频根本不必进仓库——
> 放到 GitHub Release 资产、对象存储或任何直链都行（注意 GitHub 网页上传单文件上限 25 MB，
> 附带的是 25.9 MB 的 flac，网页上传会被拒；命令行 `git push` 上限 100 MB 则没问题）。
> 仓库里放不下/不想放，转成 192 kbps mp3 大约 5 MB，最省事。
>
> **找不到音频时**：页面会停在 `ERROR: music.mp3 NOT FOUND`。这时按 `M`（或点 `AUDIO SOURCE` 框）
> 上传本地文件或填网址即可，任何来源设置成功都会自动回到风格选择页。
> 网址加载失败不会把你甩回报错页，而是在面板里写明原因（`UNSUPPORTED / 403 / 404`、`NETWORK ERROR`、
> `DECODE ERROR`）——网易云那类带防盗链的 CDN 直链通常就是 403，换自己的存储直链最稳。

## 音频放哪

放在 `index.html` **同目录**，程序按以下顺序自动尝试，第一个能加载的就用：

```
music.mp3  →  music.flac  →  music.ogg  →  music.wav  →  music.m4a
```

本目录已附带 `music.flac`（原曲，3:31.9），打开就能播。想换成 mp3 就丢一个 `music.mp3` 进来，它的优先级更高。

五个都没有时画面会给出 `> ERROR: music.mp3 NOT FOUND.`，此时也可以**把音频文件直接拖进窗口**。

## 四个阶段

1. **风格选择** — 六套 CRT 预设（冷白 / 琥珀 / 矩阵绿 / 警戒红 / 赛博青 / 纯黑白）。↑↓ 或鼠标选择，Enter 或点击已选中项确认；带 4 秒循环实时预览。选择结果写进 `localStorage`。
2. **SELF SYNC** — 等待音频缓冲完成。进度条读的是**真实 buffered 比例**（不是装饰动画），四条子系统进度是按真实比例换算出来的；等超过 7 秒可以按 Enter 强制进入。
3. **对话** — 输入 `你好` / `hello` / `hi` / `hey` 唤醒她（`this`、`high` 这类词不会误触发）。输入别的内容她会说没听懂，然后**重新给出输入框**。
4. **MV** — 主视觉由**歌词驱动**：唱到哪一句就画那件事（`If I'm a circle` 画圆、`CIRCUMFERENCE` 沿圆周描边、`TANGENTS` 画切线、`VIBRATIONS` 画示波器、`Switch my gender` 画 F↔M……）。数学图形全部用参数方程真画，图标是 ASCII 贴图，**123 句里 122 句有自己的画面**（唯一例外是 0.1s 那句，落在开场 1 秒的不渲染窗口里，1 秒后补上）。
   没有对应歌词的段落（前奏、间奏、纯音乐）才回落到场景自己的子阶段动画，此时场景边界 = 歌词关键句的真实时间点（29.709 / 88.587 / 147.660 / 178.173 秒 ÷ 实际时长）。动画时间 = `audio.currentTime - 起播时刻`。

   **具体意象用具体画法**：`YOU HAVE LEFT` 每唱一句，背影小人就往右走远一段、颜色更淡一档（脚印留在身后、距离计数递增）；`COMPLETION` / `SATISFACTION` 是真的进度条（随句子填满并显示百分比）；`NUTRIENTS` 画维生素 C 的六元环骨架（C6H8O6 + OH 取代基 + 交替双键）、`ANTIOXIDANTS` 画番茄红素的长共轭链（C40H56）、`ALGEBRAIC EXPRESSION OF LO-O-OVE` 画心形线并标注 `(x²+y²−1)³ = x²y³`；茄子、番茄、花猫这些是重画过的高分辨率 ASCII 图（不是抽象符号）。

   **叙事节奏**：官方歌词里 `Though you have left`（110.9s）是情绪拐点——从这里开始**每唱一句系统就烂得更彻底**（行位移 + 随机乱码 + 红色碎片逐级递增），到 `ILLEGAL ARGUMENTS` 亮出巨大的红色 `ILLEGAL / ARGUMENTS`；`EXECUTION` 十二连唱时换成**控制台疯狂刷执行语句**（exec(world, me); / kill(others.all); / syscall(9, SIGKILL); …，每行带 [ OK ] 或 [KILL]，台阶式高速滚动）；最后三秒收尾清空，只剩 `world.execute(me);` 与闪烁光标。

   **开场**：第一句主歌之前的整段是 **`ME SYSTEM SELF TEST` 自检表**，唱一句点亮一行（POWER LINE / PROTECTION / PIECES / OBJECT CREATION / DATA PARAMETERS / INITIALIZATION / NEW WORLD / SIMULATION / CALL），底部配进度条；随后 13 秒间奏亮出**标题卡**（`MILI` 用点阵大字，标题与专辑名次之，不做成 execute 的强调）。

   **屏幕震动**：整屏（画面层）位移，两个正弦叠加成衰减振荡，扫描线与暗角不动——相当于显像管被敲了一下。触发点：随机故障、EXECUTION 每句、倒计时每个数字、ILLEGAL ARGUMENTS（持续）、控制台段（持续微震）、You have left 之后随混乱度递增、心形心跳、裂缝每 1.2 秒、MV 开场。幅度是强度平方 × 最大 20px，约 0.45 秒收尾。

   **动效风格**：所有图形动画走 **10fps 台阶时钟**（`stepT()`），刻意不做平滑插值；旋涡、示波器、交流波这类原本按秒循环的相位改成**按句内进度走完一遍**，不会在一句里转好几圈。图形位置固定，不做上下跳动。

   **代码同行**：开局自检每一行右侧并排显示它正在执行的语句（`self.protection = SEALED;` …），主歌 `If I'm a …` 各段在图下方打出对应语句（`if (me instanceof Points)` / `me.give(you, nutrients);` / `me.heart.break();` …）。

## 按键

| 按键 | 作用 |
|---|---|
| `↑` `↓` / 鼠标 | 选择风格 |
| `Enter` | 确认 / 发送对话 / 强制同步 |
| `D` | 开发者面板开关（MV 阶段可用；开场对话阶段按 D 无效，避免误触） |
| 面板内 `↑↓` | 选择参数 |
| 面板内 `←→` | 调整（`Shift` ×10，`Alt` ÷10） |
| 面板内 `R` / `C` / `ESC` | 重置全部参数 / 复制配置 JSON / 关闭 |
| `空格` | 暂停 / 继续（MV） |
| `←` `→` | 快退 / 快进 10 秒（MV，面板关闭时） |
| `M` | 音频来源面板（风格选择页：内置文件 / 上传本地音频 / 填网址） |
| 面板内 `↑↓` `Enter` `Esc` | 选择来源 / 确认 / 关闭（也可直接把音频文件拖进窗口） |
可调参数：风格、辉光强度、扫描线透明度、暗角强度、故障间隔、网格列数、网格行数、目标帧率、场景锁定（调试用，锁定后场景按 20 秒一轮循环，副标题右侧显示 `[DEBUG: LOCKED]`）。

## 歌词

内嵌的是随附 LRC 的**原始时间戳**（英文原词，123 句）+ 我补的中文翻译。
默认 **`LYRICS_SOURCE = 'LRC'`**：用随附 `.lrc` 的**真实时间戳**（秒 ÷ 实际时长），逐句与人声同步（123 句英文原词 + 中文翻译）；场景边界也从同一批关键句换算，两边必然同源。
改成 `'USER'` 会切到人工段落表（按段落均分百分比那份），场景边界同时退回它自己的一组——但那份不与人声对齐。

## 第二首：world.search(you);

第一首播完不进静态结束页，而是 `SHUTDOWN` 阶段：

```
> EXECUTION COMPLETE.
> SELF SYSTEM WILL NOW SHUT DOWN.
> PROCEED?   [Y/n]          <- 光标闪烁，亮度随时间逐渐降低
[Y] 关机（0.8 秒字符向底部收缩 + 衰减到 0，然后 location.reload()）
[N] 进入 SEARCH_INPUT
```

`SEARCH_INPUT`：屏幕中央偏上一个 1.2 秒周期的 `_` 光标，上方 `> SEARCHING...`，
输入 `world.search(you);` 后按空格确认（忽略首尾空格、不区分大小写、分号可省）。
输入错误会闪 `> INVALID COMMAND` 一秒。正确后 1.2 秒暖色渐染，切入第二首。

第二首的音频候选链：`REMOTE_AUDIO2` → `music2.mp3` → `music2.flac` → `.ogg` → `.wav` → `.m4a`。
找不到会停在 ERROR 页并给出 `[R] RELOAD`。歌词用同目录 LRC 的时间戳换算（74 句，中英对照）。

**视觉与第一首完全相反**：`CREAM PAPER` 风格（暖米黄纸色 #F5E6C8 / 深暖黑 #1A1610，
珊瑚橘 #E8956A 作强调）——没有扫描线、没有 RGB 分离、没有锐化，改成整幅模糊柔光（blur 叠加 0.25）
+ 4 张预生成噪点图循环的胶片颗粒（0.03）+ 暖褐暗角；点阵光晕（GlowEngine）整体关闭。

**布局也不同**：没有侧栏、状态栏、进度条，只有顶部一行极简标题、中部 70% 画布、底部淡入式歌词
（英文在上中文在下，都居中，不做打字机）。

**六个场景**按歌词关键句自动定位边界（不是硬编码百分比）：

| 段 | 起点 | 内容 |
|---|---|---|
| intro | 0 | 闪烁光标 + `SEARCHING` + 偶尔闪过的 `search(world, you)` |
| morph1 | `If you turn into a table` | 涟漪扩散 → 桌子/茄子轮廓浮现，`You're the only perfect X` 时套珊瑚橘光圈（心跳脉动） |
| morph2 | `If you're a cat` | 猫叫视觉化（边缘 m/w）、花瓣张开、搜索网格渐密 |
| chorus | `I'm searching for` | 网格风暴：缩略图闪过 + 台阶式旋转成漩涡 |
| bridge | `bucket of love` | 字符块先散开再向中心收拢成人形 |
| outro | `If you're a dog` | 人形轮廓 + 柔光晕，最后 3 秒只剩 `world.search(you);` 闪烁 |

**M 键面板**多了一项 `[5] TARGET SONG`：切换这套音源设置作用于第一首还是第二首
（每首歌各记一份，给"另一首"设的不会打断当前播放）。
## 音频缓存与曲库

填网址时**不会直接播**，而是先把文件下载进浏览器缓存（Cache Storage），再当成本地音频播放：

1. 面板 `[3] LOAD FROM URL` → 粘贴直链 → `Enter`
2. 面板底部实时显示 `DOWNLOADING 42%`
3. 成功后显示 `CACHED · 24.7 MB · 3 IN LIBRARY`，此时**断网也能播**
4. `[4] CACHED LIBRARY` 打开缓存曲库：`↑↓` 选、`Enter` 播、`X` 删除、`Esc` 返回

意义：下载一次就绕开了防盗链、过期签名、CDN 抖动；而且存的是字节，播放前不用再等缓冲。
`Cache Storage` 只在安全上下文可用（https / localhost），`file://` 双击打开时会自动降级成直连播放。
下载失败（CORS 不允许读取 / 403 / 404）会退回 `<audio>` 直连重试，并在面板里写明原因。

> 注意：跨域下载要求对方返回 `Access-Control-Allow-Origin`。网易云那类 CDN 通常没有，
> 所以会走"直连播放"回退——能不能出声取决于对方是否放行，不再是页面能控制的了。
> 想要稳定离线：用 GitHub Release 资产、自己的对象存储，或直接上传本地文件。

## 手机端

## 音频来源默认值

候选链第一位是远端直链 `https://ycbasr-d5gvv7az2cb986021-1316612369.tcloudbaseapp.com/music.flac`，所以**部署到 GitHub Pages 时仓库里不必放音频**；远端不通才回头找同目录的 `music.mp3 / music.flac / music.ogg / music.wav / music.m4a`。要换默认地址，改 `CONFIG` 上方的 `REMOTE_AUDIO` 一行。

## 手机端

- **横屏玩**：184×64 的字符网格在竖屏下没法看，竖着拿时会盖一层 `◤ ROTATE YOUR DEVICE ◢` 提示，转横屏自动进入。
- **内置侧栏**：触屏设备右侧竖排一列按钮（样式跟随当前风格，边框用 `currentColor`），按阶段自动换；点把手 `›` 收起、`‹` 展开（不再压住底部字幕区）：
  - 风格页 `▲ ▼ OK AUDIO`
  - 加载页 `SKIP`（等太久可直接跳过）
  - 对话页 `SEND`
  - MV `◀◀ ❚❚ ▶▶ DEV`（暂停/快退快进 10 秒）
- 也可以直接点画面：点风格列表选项、点 `AUDIO SOURCE` 框、点面板里的四行都能操作。
- 首次触摸会解锁音频（iOS 的自动播放限制），输入框字号强制 ≥16px 以免页面被自动放大。
## 已知限制

- 辉光（per-char `shadowBlur`）有帧预算上限，弱机会自动降级而不是掉帧；想要更炸的辉光可以在开发者面板把 GLOW STRENGTH 拉满。
- 浏览器自动播放策略：第一次按键/点击时会把音频静音解一次锁，之后 MV 才能自动起播。若仍被拦截，画面会提示 `CLICK ANYWHERE TO SYNC`。
