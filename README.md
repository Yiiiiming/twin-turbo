# Twin Turbo

[打开正式游戏](https://yiiiiming.github.io/twin-turbo/) · [当前内容与保留项](documentation/STATUS.md) · [历史归档](archive/README.md)

浏览器街机赛车。当前公开六张城市地图：伦敦、北京、上海、里约、奥斯汀、巴黎；提供幽灵挑战、本地双人和新手教程。正式比赛为单圈。

选图时界面、地标投影、入场列车、道路和普通楼房使用城市主题色：伦敦/巴黎紫色、北京红色、奥斯汀 UT 橙色、里约绿色、上海冰蓝银灰。城市上空为极光，真实地标保留原有建筑颜色。氮气余量集成在时速盘上，车尾火焰也随余量变化。

## 仓库目录

| 位置 | 用途 | 是否属于当前版本 |
| --- | --- | --- |
| [`src/`](src/) | 游戏逻辑、城市模型、渲染、界面样式 | 当前源码 |
| [`index.html`](index.html) | 本地开发入口，加载 `src/` | 当前源码 |
| [`assets/`](assets/) | 场景图、海报及来源说明 | 当前资源；含隐藏地图资源 |
| [`docs/`](docs/) | **GitHub Pages 正式发布产物** | 线上运行入口，不是文档目录 |
| [`tests/`](tests/) | 玩法、界面、模型、路线保护测试 | 开发维护 |
| [`tools/`](tools/) | 连接当前源码的建筑/场景预览页 | 开发工具，不进入游戏菜单 |
| [`scripts/`](scripts/)、[`build.py`](build.py) | 打包脚本 | 开发维护 |
| [`vendor/`](vendor/) | 字体和历史第三方组件许可 | 许可保留，不代表运行时依赖 |
| [`documentation/`](documentation/) | 当前状态、保留项说明 | 当前文档 |
| [`archive/`](archive/) | 旧说明与历史版本索引 | 历史资料，不参与构建 |

## 本地开发与发布

需要 Node.js、npm 和 Python 3：

```sh
npm install
npm test
npm start
```

打开 `http://127.0.0.1:8765/`；浏览器模块需要 HTTP 服务，不使用 `file://` 打开源码页。

```sh
npm run build
```

构建生成 `dist/` 网页版和本地离线文件 `Twin Turbo.html`。`dist/` 与离线文件是本地产物，不提交到仓库根目录。发布时将验证后的 `dist/` 内容同步到 `docs/`，保留 `docs/.nojekyll`；GitHub Pages 使用 `main` 分支的 `/docs`。正式链接保持不变。

成绩与幽灵使用现有独立服务：`https://twin-turbo-records-yiiiiming.heym0701.chatgpt.site`。本次目录整理不修改记录分类、数据或浏览器存储键。

## 维护约定

全部十二张保留地图仍接受回归测试；后六张只是隐藏，详见[状态清单](documentation/STATUS.md)。现有路线受 [`AGENTS.md`](AGENTS.md) 和路线指纹保护；未经用户明确授权不得改变道路或比赛进度检查点。旧说明中已撤下的模式、旧配速规则、旧默认地图等只作历史记录，以当前源码和状态清单为准。
