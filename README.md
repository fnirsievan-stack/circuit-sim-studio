# 电路仿真动画工作台 · CircuitSim Studio

纯前端、零依赖的电路 / 电流 / 元器件仿真动画工具。支持 1080P / 2K / 4K 视频导出、入场/出场动画、元件库（直插/贴片/芯片）、自定义元件、撤销重做、画布缩放平移。

## 使用方式

- **在线版**：浏览器打开 `https://fnirsievan-stack.github.io/circuit-sim-studio/`，无需安装、无需账号。
- **离线版**：获取 ZIP（含 `circuitsim-standalone.html`），解压后双击该文件，浏览器打开即可，断网可用。

基本操作：从元件库拖入画布或搜索元件 → 左键连接引脚 → 设置参数与动画 → 导出视频。

## 本地运行（开发预览）

- 直接双击 `index.html`（file:// 可用）。
- 或本地起服务：`python3 -m http.server 8000`，访问 `http://localhost:8000`。

## 目录结构

| 文件 | 作用 |
|---|---|
| `index.html` | 页面骨架与 UI 布局 |
| `components.js` | 元件库（70+ 元件），新增元件在此添加 |
| `app.js` | 主逻辑：渲染、电流方向 BFS、连线、选中/删除、撤销重做、导出、交互 |
| `custom.js` | 自定义元件（浏览器 localStorage 存储） |
| `styles.css` | 样式 |
| `build.js` | 把上述文件内联，生成单文件 `circuitsim-standalone.html` |

## 重新生成单文件分享版

```bash
node build.js
```

生成的 `circuitsim-standalone.html` 为零依赖单文件，可压缩成 ZIP 分发（部分聊天软件会拦截单独的 .html 文件）。

## 新增 / 修改元件

在 `components.js` 的 `CS.COMPONENTS` 中按既有格式新增一项：

```js
CS.COMPONENTS['my_part'] = {
  name: '示例元件', cat: 'passive', pkg: 'th',   // pkg: th 直插 / smd 贴片 / ic 芯片
  defaults: { label: '', value: 100 },
  terminals: CS.pinH(2),                          // 引脚布局
  draw(ctx, p, e) { /* 实物外观绘制 */ },
  edges: [[0,1]]                                  // 导通引脚对（可选）
};
```

新增后运行 `node build.js` 重新生成即可。

## 已知边界

- 视频导出为 WebM（依赖浏览器 MediaRecorder，个别极旧浏览器不支持）。
- 交流源为恒定方向，未做正弦交变。
- 芯片 IC 默认按黑盒处理，不参与导通计算。
- 自由节点导线（无元件端点）仅由代码生成，UI 暂不直接创建。
