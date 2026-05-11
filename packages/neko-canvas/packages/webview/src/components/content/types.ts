import type { CanvasBlock, CanvasNode, ContainerSection } from '@neko/shared';

export interface FieldBindingUpdate {
  path: string;
  value: unknown;
}

export interface NodeContentRenderContext {
  node: CanvasNode;
  allNodes: CanvasNode[];
  selectedNodeIds: string[];
  isSelected: boolean;
  depth: number;
  onUpdateBinding?: (update: FieldBindingUpdate) => void;
  onSelectNode?: (nodeId: string, multi: boolean) => void;
  onRemoveChild?: (containerId: string, childId: string) => void;
}

export interface ContainerRendererProps {
  section: ContainerSection;
  context: NodeContentRenderContext;
}

export interface BlockRendererContext extends NodeContentRenderContext {
  block: CanvasBlock;
}

export type BlockRenderer = (context: BlockRendererContext) => React.ReactNode;

export type BlockRendererRegistry = Partial<Record<CanvasBlock['kind'], BlockRenderer>>;
