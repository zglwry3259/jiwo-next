import type { CSSProperties } from 'react'

/** 允许把 CSS 自定义属性（--xxx）和内联样式一起传，省掉每个组件写一次断言。 */
export type Vars = CSSProperties & Record<`--${string}`, string | number | undefined>
