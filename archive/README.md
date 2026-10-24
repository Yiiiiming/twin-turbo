# 历史归档 / Archive

这里记录**当前版本没有启用的历史内容**。不会参与 `build.py` 打包，不是另一份正在维护的游戏。整理保留 Git 历史与原文件内容，没有清除旧提交。

| 内容 | 当前状态 | 存放位置 |
| --- | --- | --- |
| 整理前的旧 README | 历史说明；含已过期的默认地图、AI、三圈、NEW 角标、旧幽灵配速等描述 | [原文快照](notes/README-before-2026-10-24.md) |
| 旧大型伦敦 / Three.js 原型 | 2026-10-07 已被当前紧凑版替代；不在现行构建中 | [最后完整原型 8b990a957f](https://github.com/yiiiiming/twin-turbo/tree/8b990a957f0e4474c85bb8c17fe252231c20c177) |
| 原型替换记录 | 历史提交，可核对移除/替换清单 | [迁移提交 5822f6da12](https://github.com/yiiiiming/twin-turbo/commit/5822f6da12d24cce9829f19d0b6bf63b1b2c9da2) |
| 灯塔大奖赛 `coast-grand` | 已退役，不属于六张暂时隐藏地图 | 可沿 Git 历史查看退役前的版本；不恢复到当前菜单 |
| 单独精细伦敦 Beta | 用户否定并放弃，未合入这个仓库 | 不上传本地实验副本 |

旧大型伦敦原型的历史文件包括 `city-renderer.js`、`city-landmarks.js`、`city-frontages.js`、`city-roads.js`、`city-geometry.js`、`city-placement.js`、`city-tunnel-lighting.js`、`assets/london-map.json`、`assets/london-road-cache.json` 以及当时的 Three.js 文件。通过上面的固定提交可完整恢复，无须再复制一套大型资源到当前分支。

## 不是 archive 的内容

- 后六张地图只是暂时隐藏，仍在当前 `src/` 与十二图测试中完整保留，见[当前状态](../documentation/STATUS.md)。
- `london-new-*`、`london-second-*`、`london-third-*` 是仍生效的建筑分批模块，不能按名字移到这里。
- `beijing-reference.js` 与旧布局测试数据是当前布局依赖；保留在原维护位置。
- `docs/` 是在线游戏的构建产物，`tools/` 是活跃预览工具，均不是旧版。

旧 README 中的相对路径保持原文以便审计，阅读当前可用入口请回到[仓库首页](../README.md)。
