# Reelillion requirements coverage

需求来源：根目录《电影主题稀有答案游戏（原名 Filmillion）：可行性与开发方案》，包含 v1.1 规则细则、v1.2 系列化扩展，以及 **2026-11-01 新增 v1.3 片尾字幕与像素电影院**。本次可追踪执行合同见 [requirements-v1.3.md](requirements-v1.3.md)。此表描述当前代码覆盖情况，不将本地实现、CI、生产部署、人工验收或业务结果合并为同一状态。

- `implemented`：已有对应实现；线上可用性仍需发布证据。
- `pending`：需要完成验证、人工审核、配置或当前交付范围内的后续工作。
- `planned`：方案中的后续能力，当前版本未提供完整产品流程。

## v1.3 本轮改造（先定义，再开发）

需求先于代码改造建立；以下状态更新于 2026-11-01 本地实现与三轮浏览器复查之后。浏览器证据见 [browser-review-v1.3.md](browser-review-v1.3.md)，原 MVP 的旧记录不替代本轮验收。`implemented` 在本节表示已有实现及所注明的本地验证，不表示同 SHA CI 或生产发布已经完成。

| 需求 | 状态 | 当前覆盖与验收边界 |
| --- | --- | --- |
| 根目录需求更新 v1.3，建立可追踪实施合同 | implemented | 保留 v1.0–v1.2 原文，新增第 9 节及 requirements-v1.3.md；原 Notion 页已通过既有 Chrome 登录的独立需求会话追加完整 v1.3，留存截图，未修改其他页面或认证/权限。 |
| 首屏像素电影院中央大银幕，原地点击开局，无另页/营销 hero | implemented | 原创 Cinema 场景承载首屏；390/768/1440px 及中间宽度实际查看，点击原地进入问题，加载不自动建立计时局。首轮将 CTA 改为 Play today’s reel，明确开始答题。 |
| 所有游戏状态由银幕承载，题目/输入/操作稳定 | implemented | 开始、提问、反馈、零分、超时、成绩均在银幕；最终 40s Practice 七题每次提交前后输入框文档 Y 坐标均为 528.8359375，按钮位置至多 1px 差。小屏补全与键盘已操作。 |
| 七题/700 分/五档计分与服务器时限不变 | implemented | 未改服务端合同；浏览器检查 Daily 20s 恢复弃答/零分，Practice 40s 未知重试、正确/错题/超时及主动 Next；最终用目录内有效答案完成 685 分七题练习局。自动化检查结果由发布执行者单独记录。 |
| 十级累计字幕路标，0 分 Opening frame | implemented | credits.ts 用固定阈值派生，包含边界测试；零分结果显示 Opening frame，600 与 700 场景已在本地查看，不将职业解释为价值排名或十道题。 |
| 结算按新增分数推进，零分不动，可跳过并尊重减少动态 | implemented | 位置按累计分数连续计算；已实际点击 Skip credits animation，游戏内 Reduce motion 已测得 transitionDuration 为 0s。系统级 prefers-reduced-motion 真值切换未模拟，CSS/监听已实现；见未验证项。 |
| 所有完局落幕，600+ 主彩蛋，700 特别版 | implemented | 本地实际查看 0 分落幕、600 完局彩蛋重播/跳过、六题已 600 不提前彩蛋、700 完美版静态；只在结果分支挂载。开发验收不证明真实玩家解锁率，600 门槛仍待分布校准。 |
| 分享最终路标、总分、七个图标、模式/时长，不剧透 | implemented | buildCreditsShare 保留七图标/模式/时长与真实百分位边界；Copy result 的实际内容已核验。原生/复制/手动回退均保留，原地下一局清空 shareStatus/shareFallback；未向他人投递原生分享。 |
| 旧记录/Practice/Archive 兼容，API/D1 无迁移 | implemented | 由已锁定答案派生，不重算旧分；本轮未改 Worker/API/D1 schema，Daily 恢复与 Practice 已实测，Archive 继续用原合同与共享呈现。生产旧记录/Archive 复验随本轮发布证据记录。 |
| 相关玩法说明与实际字幕呈现一致 | implemented | 首页说明与 how-to-play 已解释单题五档、累计十路标、0/600/700、首屏开局、Next、模式和来源；玩法页阈值直接引用共享常量，正文保持 DM Sans。 |
| 最多三轮 390/768/1440px 复查，问题与截图可追踪 | implemented | 已完成本轮三轮，记录位置/现象/修改理由/复查；第三轮 320/390/600/768/800/1100/1440px 文档宽度均等于视口，控制台 warn/error 为空。见 browser-review-v1.3.md；真机和辅助阅读器仍未验证。 |
| 同 SHA GitHub Quality → Cloudflare Git 自动部署 → 线上一致性 | pending | 本轮提交、检查、部署、线上状态须重新核对；旧版成功不能替代新版本发布。 |
| 音效、付费/广告、完整付费包、职业词 SEO 页面、真实分享率增长 | planned | 明确不在本轮交付内；不因视觉改造而标记完成。 |

## 游戏 MVP

| 需求 | 状态 | 当前覆盖与边界 |
| --- | --- | --- |
| 使用 Reelillion，电影主题、英文用户、手机优先 | implemented | 独立品牌、电影术语、胶片放映室视觉；不使用 Filmillion 品牌。商标检索不是代码完成的证明。 |
| 首页直接可玩，无需账号 | implemented | Astro 静态页面与 Preact 游戏组件；随机设备标识，无邮箱/账号注册。 |
| 全球同一每日七题，America/New_York 午夜重置 | implemented | 后端按纽约日期确定题目；处理夏令时，首日为 2026-10-30 ET。 |
| 每题 20 秒，一题一个锁定答案，满分 700，无速度加分 | implemented | 后端计时与锁定，下一题由显式操作开始。 |
| 40 秒无障碍模式，分享卡注明 ⏱ | implemented | 开局前可选择 Extra time；结果及分享注明模式。可访问性与不同辅助技术的实测另列验收。 |
| 自动补全仅在三个字符后出现，不透露答案合法性 | implemented | 搜索完整支持目录，不按当前题过滤；返回片名和年份。 |
| 不认识的片名可重试，已知不合题目锁定零分 | implemented | 未知与错误分开，错误提供一个合格示例；有限目录不代表电影不存在。 |
| 大小写、标点、冠词、编辑距离与常见简称/原名 | implemented | 标题规范化、别名和最多两处编辑；短片名更严格，续集数字不模糊替换。别名覆盖仍需持续扩充。 |
| 重名/翻拍按题目条件判断，防冷门版本刷分 | implemented | 自由标题、显式年份及自动补全 ID 均进入同名版本比较；多个版本合格时用更知名版。 |
| 续集分别计，长片含动画/纪录片，不含剧集/短片 | implemented | Wikidata 分类、英文 Wikipedia 条目和至少 40 分钟的目录条件；详情见数据来源说明。 |
| 每设备每天一次计分，关闭页面当前题零分 | implemented | D1 唯一约束、再次开始时放弃当前未锁定题。清除存储可产生新设备标识，并非严格的一人一次认证。 |
| 跨午夜的旧 Daily 不继续影响旧日稀有度 | implemented | 下次 API 访问时补齐未答题零分并结束旧局，补齐记录不进入稀有度样本。 |
| 连续天数保存在本地 | implemented | 浏览器完成记录与 streak；换浏览器或清除数据会中断本地连续性。多标签页与跨日结果回看需纳入验收。 |
| 真实浏览器 390/768/1440px、关键交互、最多三轮复查 | implemented | 已执行三轮，修复并复查开关、计时 SVG、平板溢出和结算定位；见 browser-review.md。真机与辅助阅读器仍未验证。 |

## 稀有度、结果与分享

| 需求 | 状态 | 当前覆盖与边界 |
| --- | --- | --- |
| 五档 10/30/60/85/100 分及电影术语、emoji | implemented | Blockbuster、Matinee、Indie、Cult Classic、One in a Reelillion；零分用 ⬛。 |
| 初始先验，随后混合真实玩家选择 | implemented | 每题归一化公共电影知名度权重，按 `(choices + 200 × prior) / (respondents + 200)` 混合。先验不是实际玩家占比。 |
| 提交时分数锁定，后来选择不降分 | implemented | 首次答案的分数、档位、估计占比写入 D1；重复提交保持原结果。 |
| 每题真实选择比例实时展示 | implemented | 完局结果读取当前实际合格 Daily 统计；无样本时留空，不生成虚构玩家数据。 |
| 每题最常见三项、最冷门三项 | implemented | 仅从实际收到的合格 Daily 作答生成，可能不足三项或为空；不把先验榜单冒充玩家榜单。 |
| The one nobody said 与一句介绍 | implemented | 从本题支持答案中找出尚无合格 Daily 选择的电影；提供年份、条件说明和准确来源链接。 |
| 总分、每题档位、百分位、streak | implemented | 百分位仅对 Daily 且至少二十个完局提供；不足时不展示排名。目标分布仍未校准。 |
| 不剧透文字成绩卡 | implemented | 包含品牌、游戏编号、总分、七个档位 emoji、streak/模式和域名；系统分享/剪贴板失败有手动复制回退。 |
| 分享卡中的百分位文字 | implemented | 有足够真实 Daily 完局样本时，结果页与文字分享卡均显示按同分处理的真实百分位。 |
| Challenge a friend，同题并排比分 | implemented | 用日期和分数生成挑战链接，结果显示朋友分数与自己的分数。URL 中的朋友分数由分享方提供，未做服务器签名认证。 |
| Practice/Archive 不污染 Daily | implemented | 不写合格 Daily 稀有度样本；不计 Daily streak。Practice 使用先验，Archive 使用历史 Daily 统计。 |
| 异常集中提交防刷 | implemented | 每设备日唯一、同源检查、请求限长、端点限速；低于 700ms 的 Daily 答案不进入公共统计。分布式刷设备的强防护尚未完成。 |
| 风险章节建议仅计午夜后前三小时的答案 | pending | 与 v1.1 全天动态混合规则有冲突；当前按 v1.1 使用全天合格首次 Daily 作答，没有实现或宣称前三小时窗口。 |
| 普通玩家均分 250–350、约 1% 达 600+ | pending | 这是内测校准目标，尚无 50–100 人内测或实际分布证据。 |

## 数据与题目编辑

| 需求 | 状态 | 当前覆盖与边界 |
| --- | --- | --- |
| 可追溯 Wikidata 合法答案与 Wikimedia 知名度来源 | implemented | 生成器保存 SPARQL 来源、电影事实、浏览量及其覆盖/回退标记；不使用 IMDb/TMDB 或海报素材。 |
| 一开始即可计分，不等待玩家积累 | implemented | 每个支持电影有正权重；未成功取得浏览量的电影明确使用 Wikidata sitelinks 回退，不编造浏览量。 |
| 提前准备三十天题目及答案表 | implemented | 确定性日期选择器、三十天 schedule 与质量报告生成器；最终生成规模和快照覆盖以 `metadata.json`、`quality.json` 为准。 |
| 每题至少三十个可核实答案 | implemented | 数据校验会拒绝低于三十个答案的题；目录有查询上限，不是所有合法电影的完整全集。 |
| 同日类型不重复、演员/导演三十天不重复 | implemented | 当前七类为 studio、decade、genre、country、runtime、cast、award；演员池轮转保障三十天不重复；尚未安排导演题，不能据此声称导演库已完成。 |
| 热身、限制、人物、Director's Cut 递进 | implemented | 当前以制片公司/年代开局、人物在第六题、奖项压轴；完整难度体验仍需玩家测试。 |
| 合法数、前三集中度与长尾质量检查 | implemented | 自动输出答案数、前三先验份额、最低先验和实测权重覆盖；内容是否有趣仍需要编辑判断。 |
| 独立人工审题后发布 | pending | 自动事实检查不是独立人工编辑审核。当前没有完成逐题人工签核的证据。 |
| 节日/热点主题日、奥斯卡周 | planned | 当前按确定性七类轮转；未实现节日自动切换或热点运营排期。 |
| 特殊题目如会说话动物、火车场景的人工补充 | planned | 当前优先使用客观结构化条件；未声称已完成这些人工题。 |
| 不同主题可配置、未来共享引擎 | implemented | 品牌、域名、术语、分值、emoji、时区、颜色有主题配置；通用匹配和计分逻辑独立。 |
| Songillion/其他主题独立数据、统一账号与付费 | planned | 本项目只实现 Reelillion；音乐/书籍目录、域名购买、跨站账号与 All Access 均未完成。 |

## 页面结构、SEO 与商业模式

| 需求 | 状态 | 当前覆盖与边界 |
| --- | --- | --- |
| `/` 游戏、玩法与 FAQ | implemented | 可玩的 Daily 入口、玩法说明、档位说明及 FAQ。 |
| `/how-to-play/` | implemented | 时间、答案合法性、五档、重开、存储与模式规则。 |
| `/archive/` 最近七天免费重玩 | implemented | 按 ET 日期列出过去七天，排除今天/未来/上线前日期；首日有真实空状态。 |
| 存档免费看题、历史独立详情、七天以上付费 | planned | 当前提供最近七天重玩；没有完整历史详情内容层、老存档订阅或支付解锁。 |
| `/unlimited/` | implemented | 页面和免费普通 Practice 入口可用，明确区别于尚在开发的专门 Unlimited 产品。 |
| 付费 Unlimited 或看广告解锁 | planned | 未接入收款、订阅、广告 SDK 或看广告解锁。免费 Practice 不是完成了付费流程的证据。 |
| `/packs/{theme}/` 五主题 | implemented | Oscars、Horror、Disney、Anime、90s 的介绍页面及索引；均明确标注开发中。 |
| 五个可完整游玩的付费主题包 | planned | 目录尚未为每包提供完整且审过的七题集合；没有主题包购买或假购买按钮。 |
| `/daily-movie-games/` 与 `/movie-games-like-wordle/` | implemented | 原创比较页，直接链接已核验原站，披露 Reelillion 为自有产品。没有伪造搜索量或排行。 |
| canonical、metadata、社交卡、robots、sitemap、404 | implemented | 由布局、公共素材及静态路由提供；搜索引擎收录/曝光不是代码即可证明的结果。 |
| 游戏站公开展示昨天罕见答案 | planned | 当前有个人完局发现区，没有单独的昨日公开答案栏目。 |
| Rarest Answers 同团队披露与链接 | implemented | Reelillion 页脚披露同团队并链接主站。 |
| Rarest Answers 当日 hints/answers 页面、反向链接和首页卡片 | pending | 需要在另一个站点仓库实施及走其发布流程；本项目没有代替该站发布内容。 |
| 广告收入、付费 All Access 和统一账号 | planned | 当前没有广告结算、付费、订阅管理或账号系统。 |

## 冷启动、运营与发布验收

| 需求 | 状态 | 当前覆盖与边界 |
| --- | --- | --- |
| 创建 GitHub 仓库并提交推送 | implemented | coolbat/reelillion 已创建并推送；首个应用版本为 61b6c3d，后续变更继续走相同门禁。 |
| 同一提交的 GitHub `Quality` 检查通过 | implemented | 工作流定义 Node 24 安装、类型检查、测试、数据检查、构建和 Wrangler dry-run；实际同 SHA CI 状态需独立记录。 |
| 检查通过后 Cloudflare 自动部署 | implemented | `ci:gate` 验证同 SHA 的最新 GitHub Actions `Quality` 成功，`deploy:ci` 才执行远程迁移和自动发布。平台 Git 连接及成功部署仍需验收。 |
| D1 绑定与迁移 | implemented | Wrangler 配置含 DB 绑定与迁移文件；生产表建立及 API 持久性需通过自动部署和线上请求确认。 |
| Cloudflare/Spaceship DNS 与 TLS | implemented | 已切换 Cloudflare NS，主域名与 www 通过 Worker custom domain 绑定，HTTPS 200 已验证。旧停放记录保留于备份名称。 |
| commit、必需检查、Cloudflare 记录、线上版本一致 | implemented | 61b6c3d 的 Quality 通过、Cloudflare Git build 门禁与版本 4104fda9 对应；生产 assets 字节相符，D1 Practice 七题通过。见 release-evidence.md。 |
| 联系 10–20 位短视频博主、录屏与专属包 | planned | 本次没有联系外部人员、发送邮件或制作已交付的博主主题包。 |
| Reddit 发帖、Product Hunt、聚合站收录 | planned | 未发布帖子或提交目录；需要独立授权和各平台规则检查。 |
| 自有渠道分发与答案站 SEO 联动 | pending | Reelillion 出站链接已完成；Rarest Answers 的入站推广与内容发布尚待执行。 |
| 50–100 人内测、留存与 DAU 跟踪 | pending | 未完成真实内测、分析采集与留存报表。不能将开发测试调用当成真实用户。 |
| 两周/12-15 KPI 决策、Songillion 扩展门槛 | planned | 业务目标保留为方案目标，当前没有达标证据，也未启动第二产品。 |

## 仍需独立交付证据

1. 完整数据快照生成与自动校验结果，以及独立人工审题记录。
2. 最终提交的 GitHub `Quality` 结果、Cloudflare 自动部署记录与版本一致性。
3. 自定义域名、DNS、TLS、线上 D1 持久性和关键游戏流程验收。
4. 最多三轮浏览器复查记录与 390px、768px、1440px 实际截图。
5. 支付/广告、完整主题包、跨站答案内容、推广、内测和留存数据的后续实施。
