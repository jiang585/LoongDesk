# image2 视觉资产记录

项目内视觉素材由内置 imagegen/image2 路径生成，最终文件位于：

- `src/assets/generated/imperial-desk.png`：桌面主背景
- `src/assets/generated/xiao-anzi-v2.png`：独立透明背景的 2D 国风 Q 版小安子立绘
- `src/assets/generated/imperial-seal-icon-v2.png`：墨色、青玉、朱砂和低饱和金构成的玉玺应用图标源图
- `src-tauri/icons/`：由图标源图生成的桌面与移动规格

主视觉提示词要点：新中式皇帝书案、深色红木、宣纸、朱砂印、宫格窗影、右侧小太监肖像、中央大面积 UI 留白；禁止文字、水印、现代电子产品、过度装饰和伪汉字。

图标提示词要点：深墨圆形底、青玉玺、极简螭龙轮廓、朱砂方印和低饱和金边；禁止文字、桌案场景、人物、商标和难以在 16px 下识别的细碎元素。

新版小安子与玉玺图标均使用内置生成模式完成；小安子采用纯色键背景生成后通过项目内标准去背流程导出透明 PNG，未使用 CLI 模型降级路径。
