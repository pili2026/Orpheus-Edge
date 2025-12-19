declare module 'vue-grid-layout' {
  import type { DefineComponent } from 'vue'

  export interface LayoutItem {
    i: string
    x: number
    y: number
    w: number
    h: number
    static?: boolean
    minW?: number
    maxW?: number
    minH?: number
    maxH?: number
  }

  export interface GridLayoutProps {
    layout: LayoutItem[]
    colNum?: number
    rowHeight?: number
    isDraggable?: boolean
    isResizable?: boolean
    verticalCompact?: boolean
    useCssTransforms?: boolean
    margin?: [number, number]
  }

  export const GridLayout: DefineComponent<GridLayoutProps>
  export const GridItem: DefineComponent<LayoutItem>
}
