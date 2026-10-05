**HuaC Lab 第一阶段交付记录**

日期：2026-10-05。范围：已确认蓝图中的首页与内容组织；按作者要求，以桌面端为验收重点。

**已实现**

- HuaC Lab 品牌、明暗主题、统一导航与页脚；首页展示研究方向、精选实验、近期记录、专题和项目。
- 文章索引支持主题、类型、关键词组合筛选，发布时间／更新时间／标题排序，结果数量、无结果提示和清空筛选。状态保存在 URL，支持刷新、分享与浏览器返回。
- 搜索覆盖标题、摘要、标签和首个主题名，支持中英文混合词、全角字符及中文输入法。全文搜索属于下一阶段。
- 14 篇正式文章统一为 7 篇技术分析、2 篇实验记录、5 篇工程实践，归入 5 个专题；4 个项目与相关文章关联。
- 实验、专题、项目索引提供实际内容入口。关闭 JavaScript 后，文章、专题和主导航仍然可用。
- 两篇主题示例保留原文件与路径，但退出首页、索引、标签页、文章侧栏、相邻／相关文章、搜索语料、RSS 和 sitemap。
- 修复 Chronos 标题中冒号导致的 YAML 错误。标准路径为 `/2026-06-25-chronos-2-learning/`；过去可能产生的 `/<构建日期>-2026-06-25-chronos-2-learning/` 通过 404 页面跳转并保留查询参数与章节。关闭 JavaScript 时提供明确的文章链接。

首页的 GRU 对比来自基准原文 §6.1 的跨文件正常段：单变量 MAPE 8.64%，6 通道 MAPE 4.44%。页面说明仿真数据、RTX 3090 与 600s 预测条件，来源链接指向对应章节。此组件是汇总快照；完整实验筛选、图表和 CSV 下载属于第三阶段。

**桌面预览**

截图为 1440 × 1000 视口的完整页面，保存在仓库内：

- [浅色首页](previews/home-light.png)
- [深色首页](previews/home-dark.png)
- [文章索引](previews/archive-light.png)

**本地构建和验证**

需要 Ruby 3.3、Bundler、Node.js 20+ 与 Python 3.9+。沿用仓库 Appraisals 中的 Jekyll 3.9.4 和 4.3.3：

```bash
bundle install
bundle exec appraisal install
bundle exec ruby scripts/check-content.rb
JEKYLL_ENV=production bundle exec appraisal jekyll build --future --strict_front_matter
python3 scripts/check-output.py _site
npm ci
npx playwright install chromium
```

运行浏览器检查前，在另一个终端启动已构建站点：

```bash
bundle exec appraisal jekyll-4 jekyll serve --skip-initial-build --no-watch --host 127.0.0.1 --port 4173
```

随后执行：

```bash
npm run test:desktop
npm run preview:capture
```

非默认地址可用 `LAB_BASE_URL=http://127.0.0.1:<端口>/<子路径>/` 覆盖，末尾保留 `/`。截图脚本也读取这个变量。浏览器运行库缺失时，可按 Playwright 的系统依赖说明安装。

子路径部署验证需要构建和服务使用相同的 `baseurl`；两个构建分别放在独立目录，避免误用根目录的 404 页面。例如创建一个配置文件写入 `baseurl: /lab-review` 后：

```bash
JEKYLL_ENV=production bundle exec appraisal jekyll-3 jekyll build --future --strict_front_matter --config _config.yml,/tmp/lab-subpath.yml --destination /tmp/huac-lab-subpath
python3 scripts/check-output.py /tmp/huac-lab-subpath /lab-review
bundle exec appraisal jekyll-4 jekyll serve --skip-initial-build --no-watch --destination /tmp/huac-lab-subpath --baseurl /lab-review --host 127.0.0.1 --port 0
```

`--port 0` 自动选择空闲端口，使用服务输出中的完整地址设置 `LAB_BASE_URL` 后运行桌面检查。测试要求缺失地址返回构建产物中的 `404.html`；普通静态服务器的默认 404 页面不能验证旧链接恢复。

本次环境未全局安装 Ruby，实际使用临时目录中的 Ruby 3.3.8、上游 Jekyll 3.9.4／4.3.3 和 Playwright 1.63.0。执行了上述版本的直接 CLI 构建；未声称本地运行了完整 Bundler/Appraisal 安装或远端 CI。

**验收结果**

| 检查 | 结果 |
| --- | --- |
| 内容字段与关联 | 14 篇正式文章、2 篇保留示例、5 个专题、4 个项目通过 |
| Jekyll 4.3.3 根路径构建 | 严格 front matter、生产模式构建通过 |
| Jekyll 3.9.4 子路径构建 | `/lab-review` 构建通过 |
| 输出检查 | 两种路径各检查 9 个页面、256 个站内链接／资源，搜索 JSON、RSS、sitemap 与 canonical 地址通过 |
| 桌面浏览器 | 根路径与子路径各 14 项通过，覆盖 1280／1440／1920px、组合筛选、中文输入法、排序、历史恢复、键盘、明暗主题与无 JavaScript 浏览 |
| 旧入口 | `/page2/`、`/page3/`、`/page4/`、文章、关于、标签、Chronos 异常旧路径与普通 404 已验证 |

输出检查范围为新版入口的站内导航、资源和章节目标，以及搜索语料与 RSS／sitemap；未将历史正文中的所有外部链接纳入验收。

**维护与后续范围**

新文章需填写 `kind`、`topics`、`summary`、`tags`，`category` 与首个主题显示名一致；可用值见 `_data/article_kinds.yml` 和 `_data/topics.yml`。只有实质性内容更新才填写 `last-updated: YYYY-MM-DD`。项目关联使用完整的 `_posts/...md` 路径。运行 `scripts/check-content.rb` 可检查缺漏与无效关联。

现有 CI 新增内容与输出检查，并将配置合并顺序改为 `_config.yml,_config_ci.yml`，保证 Pages 的子路径覆盖默认值。原工作流仍只构建并上传 Pages artifact；远端 Pages 的实际发布来源尚未核实。本次不含推送或部署。

文章正文继续使用原阅读布局和外部 Bootstrap、jQuery、字体等资源；全文搜索、文章阅读增强、正文烟花调整、实验数据抽取与可交互图表留在后续阶段。原文中 PatchTST 7.13% 与 8.44% 的比较范围问题已记录在蓝图，本阶段没有重写实验结论。
