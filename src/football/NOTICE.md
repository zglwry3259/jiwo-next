# Football Monitor 主题来源

足球球星卡主题移植自 [NSJLUCAS/football-monitor](https://github.com/NSJLUCAS/football-monitor)（MIT）。
上游是 Vue 3 + TypeScript + Vite + Tailwind 4 的独立站点；这里按妙妙屋 X 探针的技术栈
（React 19 + TypeScript + Vite）重写为 `src/football/`，数据全部来自本探针已经拿到的
主控快照（`/api/probe`）与历史接口（`/api/series`），不引入上游的后端、Go 采集端或登录体系。

保留自上游的内容：

- 视觉与交互：17 套卡面（`assets/cards`）、立绘与取景参数（`assets/portraits`、`domain/portrait.ts`）、
  运营商与服务商标志（`assets/carriers`、`assets/providers`）、四份样式表（`styles/`，已用
  `.fb-root` / `.fb-app[data-fb-theme]` 作用域化，避免污染其它主题），以及评分、档位、运维墙、
  质量走势、地球等页面结构。
- 纯逻辑：`domain/chart.ts`、`domain/clock.ts`、`domain/network.ts`、`domain/ops.ts`、
  `domain/fleet.ts` 的算法与阈值。这些文件不含框架依赖，原样沿用。

按本探针的数据重写的内容：

- `model.ts`：把 `ProbeServer` 映射成主题自己的 `MonitorNode`，节点序号即 `/api/series?server=` 的取值。
- `domain/history.ts`：主控的历史没有数字任务号，用一张进程内映射表把探测的 `key` 固定成 1、2、3…；
  主控的桶没有时间戳，按 `bucket_sec` 从 `generated_at` 倒推。
- `domain/score.ts` 的 `liveNetworkScore`：不等历史请求，先用实时帧的桶算出首屏评分。
- 全部组件与页面：`computed/watch` → `useMemo/useEffect`，`vue-router` → hash 路由。

上游 MIT 许可原文：

```
MIT License

Copyright (c) 2026 Football Monitor contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
