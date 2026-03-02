# 远程控制接口文档 (Remote Control API)

本项目支持通过本地 HTTP 服务接收并执行远程控制指令。以下是接口规范和 JSON 数据格式说明。

## 接口说明

- **URL**: `http://localhost:34301/api/execute`
- **Method**: `POST`
- **Content-Type**: `application/json`

前端页面 (`Home.tsx`) 会将接收到的远程操作（鼠标、键盘）转换为符合以下格式的 JSON 数据，并发送给本地服务。

---

## JSON 指令格式

所有指令统一包含 `action` 字段，值为 `"input_control"`。具体操作类型由 `type` 字段区分。

### 1. 鼠标移动 (Mouse Move)

用于控制鼠标光标移动到指定位置。

```json
{
  "action": "input_control",
  "type": "mouse_move",
  "x": 1920,          // 绝对屏幕坐标 X
  "y": 1080,          // 绝对屏幕坐标 Y
  "absolute": true    // 标识是否为绝对坐标
}
```

### 2. 鼠标点击 (Mouse Click)

用于触发一次完整的点击动作（按下 + 抬起）。

```json
{
  "action": "input_control",
  "type": "mouse_click",
  "button": "left",   // "left" | "right" | "middle"
  "double": false     // 是否双击 (当前实现默认为 false)
}
```

### 3. 鼠标按下 (Mouse Down) - [新增支持拖拽]

用于模拟鼠标按键按下，配合 `mouse_move` 和 `mouse_up` 可实现拖拽操作。

```json
{
  "action": "input_control",
  "type": "mouse_down",
  "button": "left"    // "left" | "right" | "middle"
}
```

### 4. 鼠标抬起 (Mouse Up) - [新增支持拖拽]

用于模拟鼠标按键抬起。

```json
{
  "action": "input_control",
  "type": "mouse_up",
  "button": "left"    // "left" | "right" | "middle"
}
```

### 5. 键盘输入 (Keyboard Input)

用于模拟键盘按键操作。

```json
{
  "action": "input_control",
  "type": "keyboard",
  "key": "enter",     // 按键名称 (小写), 如 "a", "enter", "backspace", "ctrl", "esc"
  "mode": "press"     // "press" (点击, 默认) | "down" (按下) | "up" (抬起)
}
```

---

## 前端实现逻辑

- **文件**: `src/pages/Home.tsx`
- **逻辑**: 
    1. 通过 WebSocket (`socket.on("control-event")`) 接收来自观看端 (`Watch.tsx`) 的原始 DOM 事件数据。
    2. 将原始事件数据（如 `mousemove`, `mousedown`, `keydown`）映射为上述 JSON 格式。
    3. 坐标转换：将归一化坐标 (0.0 - 1.0) 乘以当前屏幕分辨率 (`window.screen.width/height`) 转换为绝对坐标。
    4. 使用 `fetch` 发送 POST 请求到本地服务接口。

### 6. 文本输入 (Input Text)

直接发送文本字符串（支持 Unicode）。

```json
{
  "action": "input_control",
  "type": "text",
  "text": "Hello World" // 要输入的文本内容
}
```

### 7. 鼠标滚动 (Mouse Scroll)

模拟鼠标滚轮操作。

```json
{
  "action": "input_control",
  "type": "mouse_scroll",
  "delta": 120        // 滚动值，正数向上，负数向下 (通常 120 为一格)
}
```

### 8. 系统音量 (System Volume)

控制系统音量。

```json
{
  "action": "input_control",
  "type": "volume",
  "mode": "up"        // "up" (音量+) | "down" (音量-) | "mute" (静音)
}
```
