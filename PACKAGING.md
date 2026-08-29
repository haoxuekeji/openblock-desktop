# HXBlock Desktop 打包说明

## 环境

- Node 16（`nvm use 16`）
- Electron **22.3.27**（已从 15 升级；升到 28+ 需重写 electron-webpack）
- 串口权限：`sudo usermod -aG dialout $USER` 后重新登录
- Linux 工具链：`npm run setup:linux-tools`（把 Darwin 的 `tools/Python` 换成 venv + obmpy/esptool）
- 外部资源：`npm run fetch:exts`（同步本地 `external-resources-v3`）
- BLE 固件：拷贝 `firmware-esp32-ble/dist/*.bin` 到 `firmwares/microPython/`

## 本机命令

```bash
nvm use 16
npm run compile
cp -r dist/renderer/* dist/main/   # electron-webpack 产物路径对齐

# Linux 未打包目录 / AppImage / deb
npm run build:linux:dir
npm run build:linux

# Windows NSIS（建议在 Windows 机器上；Linux 上需 wine）
npm run build:win

# macOS DMG（必须在 macOS 上，且可选签名/公证）
npm run build:mac
```

产物示例（本机已验证）：

- `dist/linux-unpacked/` — 可直接跑 `./hxblock-desktop --no-sandbox`
- `dist/HXBlock-Desktop_2.3.2-beta.AppImage`（约 870MB，已不含 Arduino packages 缓存）

## 体积控制

`tools/Arduino/packages` 约 1.9GB，打包前可移走（arduino-cli 可按需再下）。
Darwin 备份目录 `tools/Python.darwin-bak` 不要放进 `tools/`。

## 平台限制

| 目标 | 本机 Linux 能否出包 | 说明 |
| --- | --- | --- |
| Linux AppImage/deb | 能 | 已验证 |
| Windows NSIS | 需 Windows 或 wine | 交叉编译可能缺签名 |
| macOS DMG | 需 macOS | 公证/签名需 Apple 证书 |

## 功能对齐摘要

- BLE（ESP32/C3 BLE）通过 Electron Web Bluetooth 保留；仅隐藏浏览器专用的 WebSerial
- 串口设备仍走内置 Link
- 登录/云存默认 `https://www.haoxuekeji.com`
- speak / asr / aiChat 走同一公网 API
- MicroPython 烧录固件前缀：`esp32-ble-openblock` / `esp32c3-ble-openblock` / `esp32s3-ble-openblock`
- 注意：CI 的 `fetch:firmwares` 只拉上游 openblockcc 发布，不含以上 obble 自定义固件；发版打包必须执行上面的手工拷贝步骤，否则 Link 端烧录会找不到固件
