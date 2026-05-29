# Icons

本目录提供图标的统一调用入口 `Icon`，以及脚本生成的图标组件与类型。

## 使用

```tsx
import { Icon } from "@neoblock/ui";

export function Example() {
  return (
    <>
      <Icon
        name="symbol_resize"
        mode="default"
        thickness="Light"
        width={24}
        height={24}
      />
      <Icon
        name="symbol_resize"
        mode="fill"
        thickness="Bold"
        width={24}
        height={24}
      />
      <Icon id="symbol_resize--default--Light" width={24} height={24} />
    </>
  );
}
```

## Props 约定

- `name`：来自 Figma 导出文件名里的 `name=...`，例如 `symbol_resize`
- `mode`：来自 `mode=default|fill`
- `thickness`：来自 `thickness=Bold|Standard|Light`
- `id`：拼接后的唯一键，格式为 `${name}--${mode}--${thickness}`，优先级高于 `name/mode/thickness`

`Icon` 额外透传所有标准 `SVG` props（例如 `width`、`height`、`className`、`style`、`onClick` 等）。

建议：

- 图标颜色使用 `currentColor`，在调用侧用 `style={{ color: ... }}` 或父级 `color` 控制
- 如果需要可访问性文本，传入 `aria-label`，否则图标默认 `aria-hidden`

## 生成产物

生成目录：

- `generated/`：自动生成的图标组件与注册表

说明：

- `generated/registry.ts` 会导出 `icons` 映射、`IconName` / `IconMode` / `IconThickness` / `IconKey` 类型，以及每个图标的具名导出组件
- 不要手工修改 `generated/` 下的任何文件，重新生成会覆盖

## 生成命令

SVG 输入目录（允许任意子目录层级）：

- `packages/ui/assets/icons/**`

命名格式（字段顺序不要求一致）：

- `thickness=Bold|Standard|Light, name=[type]_[name], mode=default|fill.svg`

生成：

```bash
npm -w @neoblock/ui run icons:gen
```

## 常见问题

### 生成时提示 Duplicate icon key

表示存在多个 SVG 解析后得到相同的 `${name}--${mode}--${thickness}`。
当前策略是保留首次扫描到的那个 SVG，并跳过后续重复项；建议清理重复文件以避免不确定性。
