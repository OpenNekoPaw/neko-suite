# PSD Fixture 策略

本目录预留给 neko-sketch PSD 导入回归测试使用的真实兼容性样本。

## 范围

- `ag-psd` 生成样本保留在单元测试或集成测试中。
- 本目录只放外部编辑器生成的 PSD，例如 Photoshop、Photopea、Krita，或确认可提交的用户样本。
- 不把生成样本当作外部编辑器兼容性的证明。

## 建议样本

- 单个 raster 图层。
- 多 raster 图层，并带有明确的视觉层级顺序预期。
- 嵌套 group，包括 pass-through group。
- 常见且已支持的混合模式。
- 必须产生 `PsdImportIssue` 的不支持特性，例如文本层、智能对象、蒙版、调整层和图层样式。

## Manifest

新增外部 PSD 样本时，同步更新 `manifest.json`。测试会读取 manifest 并验证：

- 画布尺寸。
- 顶层图层顺序。
- 总图层数。
- 必须出现或禁止出现的 `PsdImportIssue`。

示例：

```json
{
  "version": 1,
  "fixtures": [
    {
      "name": "photopea-pass-through-group",
      "file": "photopea-pass-through-group.psd",
      "expected": {
        "canvas": { "width": 512, "height": 512 },
        "topLevelLayerNames": ["Background", "Effects"],
        "totalLayerCount": 4,
        "requiredIssues": [
          { "code": "group-isolation-mismatch", "layerPath": ["Effects"] }
        ],
        "forbiddenIssues": [
          { "code": "parse-failed" }
        ]
      }
    }
  ]
}
```

## 隐私

Fixture 不能包含私有作品、客户文件、嵌入凭据，或不能存入本仓库的版权资产。
