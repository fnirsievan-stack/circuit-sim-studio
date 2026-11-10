# GitHub 仓库

- 仓库：`https://github.com/fnirsievan-stack/circuit-sim-studio`
- 在线版：`https://fnirsievan-stack.github.io/circuit-sim-studio/`
- 分支：`main`

## 关联远程

```bash
git remote add origin https://github.com/fnirsievan-stack/circuit-sim-studio.git
git branch -M main
git push -u origin main
```

HTTPS 推送用 Personal Access Token 代替密码，或配置 SSH key 后用 SSH 地址。

## 参与维护

```bash
git clone https://github.com/fnirsievan-stack/circuit-sim-studio.git
cd circuit-sim-studio
git checkout -b feat/my-change
# 改动 + 本地验证（index.html / node build.js）
git add -A && git commit -m "改动简述" && git push -u origin feat/my-change
# 在 GitHub 提 PR
```

合并到 `main` 后 GitHub Actions 自动构建并发布在线版。详见 `CONTRIBUTING.md`。
