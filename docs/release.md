# Windows 签名发布与自动更新

御案的日常开发配置不包含任何签名材料。只有 GitHub Actions 发布任务会生成临时的
`src-tauri/tauri.release.conf.json`，构建完成后随临时 runner 一并销毁。

## 一次性准备

1. 生成 Tauri 更新签名密钥：

   ```powershell
   npm run tauri signer generate -- --write-keys "$HOME/.tauri/yuan.key"
   ```

2. 将私钥全文保存为仓库 Secret `TAURI_SIGNING_PRIVATE_KEY`，密码保存为
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，公钥保存为 `TAURI_UPDATER_PUBKEY`。
3. 将可信 Windows 代码签名证书导出为带密码的 PFX，再将文件转换成 Base64：

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("yuan-signing.pfx")) | Set-Clipboard
   ```

4. 将 Base64 保存为 `WINDOWS_CERTIFICATE`，PFX 密码保存为
   `WINDOWS_CERTIFICATE_PASSWORD`。

## 发布

版本号必须同时更新 `package.json`、`src-tauri/Cargo.toml` 和
`src-tauri/tauri.conf.json`。推送 `v<版本号>` 标签后，工作流会：

- 导入临时 Authenticode 证书；
- 构建并签名 NSIS 安装包；
- 生成带 Tauri 更新签名的安装包和 `latest.json`；
- 创建 GitHub Draft Release，等待人工复核后发布。

客户端只从本仓库 GitHub Release 的 HTTPS `latest.json` 获取更新元数据，并在安装前
验证 Tauri 签名。不要把 PFX、私钥或动态生成的发布配置提交到仓库。
