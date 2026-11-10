# 协作维护

## 参与方式

| 方式 | 做法 |
|---|---|
| Pull Request | Fork → 修改 → 提 PR |
| 直接提交 | 加入 Collaborators 后开分支提交 |
| 使用工具 | 打开在线链接或单文件版 |

main 为受保护分支，合并走 PR + 1 审核。

## Fork + PR

```bash
git clone https://github.com/<账号>/circuit-sim-studio.git
cd circuit-sim-studio
git remote add upstream https://github.com/fnirsievan-stack/circuit-sim-studio.git

git checkout -b feat/my-change
# 本地验证：双击 index.html，或 python3 -m http.server 8000
# 改过元件库/外观后运行 node build.js

git add -A && git commit -m "改动简述" && git push -u origin feat/my-change
# 到 upstream 提 PR
```

同步上游：`git fetch upstream && git rebase upstream/main`

## 直接提交

```bash
git checkout main && git pull
git checkout -b fix/xxx
# 改动 + 本地验证
git push -u origin fix/xxx
# 提 PR → 审核 → 合并
```

## 合并后自动发布

`.github/workflows/deploy-pages.yml` 在合并到 main 后自动 `node build.js`，把单文件版作为唯一 `index.html` 发布到 GitHub Pages。PR 阶段自动跑语法与构建校验。

发布产物只有这一个自包含页面，源码与文档不会作为网页暴露。

## 提交规范

- 元件新增在 `components.js` 的 `CS.COMPONENTS` 补全 `name / cat / pkg / terminals / draw`，保持绘制风格一致。
- 提交信息用中文简述改动，一个 PR 只做一件事。
- 改动涉及 `components.js` / `app.js` / `styles.css` 后运行 `node build.js`。
- 生成物、工程文件、导出的图片/视频见 `.gitignore`，不入库。
