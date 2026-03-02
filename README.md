# Screen Share WebRTC

这是一个基于 WebRTC 和 Socket.io 构建的实时屏幕共享应用程序，支持浏览器端的点对点屏幕流传输，并集成了远程控制功能。

## ✨ 功能特性

- **实时屏幕共享**: 基于 WebRTC 技术，实现低延迟、高清的屏幕或窗口共享。
- **远程控制**: 允许观看端控制共享端的鼠标和键盘（需要本地服务支持）。
  - 支持鼠标移动、点击、拖拽。
  - 支持键盘按键输入。
  - 支持文本粘贴（剪贴板同步）。
  - 支持鼠标滚轮滚动。
  - 支持系统音量调节。
- **局域网分享**: 自动检测本机局域网 IP，生成易于在同一网络下访问的分享链接。
- **全屏模式**: 观看端支持全屏沉浸式体验。
- **响应式设计**: 界面简洁，适配不同屏幕尺寸。

## 🛠️ 技术栈

- **前端**: React 19, Tailwind CSS, Lucide React (图标)
- **后端/信令**: Node.js, Express, Socket.io
- **构建工具**: Vite
- **语言**: TypeScript

## 🚀 快速开始

### 1. 安装依赖

确保本地已安装 Node.js (推荐 v16+)。

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

启动后，控制台会显示访问地址，通常为 `http://localhost:3000`。

### 3. 使用说明

1.  **共享端 (Broadcaster)**:
    - 打开主页，点击 "Start Sharing"。
    - 选择要共享的屏幕、窗口或标签页。
    - 复制生成的 "Share Link" 发送给观看者。
    - 如需允许远程控制，请开启 "Allow Remote Control" 开关。

2.  **观看端 (Viewer)**:
    - 在浏览器中打开分享链接。
    - 等待连接建立后即可看到共享画面。
    - 如果共享端开启了控制权限，可以直接在视频区域操作鼠标和键盘。

## 🎮 远程控制功能配置

本项目的远程控制功能依赖于运行在共享端本地的 HTTP 服务，用于将接收到的 Web 指令转换为实际的系统输入模拟。

- **接口文档**: 详见 [CONTROL_API.md](./CONTROL_API.md)
- **默认端口**: `34301`
- **请求地址**: `http://localhost:34301/api/execute`

确保您的本地控制服务（如 WinPilot 或其他自定义服务）正在运行并监听该端口，否则远程控制指令将无法生效。

## 📂 目录结构

```
screen-share-webrtc/
├── src/
│   ├── components/   # UI 组件
│   ├── lib/          # 工具函数
│   ├── pages/        # 页面组件 (Home.tsx, Watch.tsx)
│   ├── App.tsx       # 路由配置
│   └── main.tsx      # 入口文件
├── server.ts         #后端信令服务器 & 静态资源服务
├── vite.config.ts    # Vite 配置
├── tailwind.config.js# Tailwind 配置
└── CONTROL_API.md    # 远程控制接口规范文档
```

## 📝 协议说明

远程控制指令通过 Socket.io 通道从观看端发送至共享端，共享端再通过 HTTP POST 请求转发给本地服务。详细的 JSON 数据格式请参考 `CONTROL_API.md`。
