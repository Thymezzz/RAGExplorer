declare module "d3-sankey" {
  import { Selection } from "d3-selection";

  export interface SankeyNode {
    id: string; // Made required
    name?: string;
    value: number; // Made required
    x0: number; // Made required
    x1: number; // Made required
    y0: number; // Made required
    y1: number; // Made required
    sourceLinks: SankeyLink[]; // Made required
    targetLinks: SankeyLink[]; // Made required
    index?: number;
    depth?: number;
    height?: number;
    layer?: number;
    type: string; // Added custom property
    questionIds: string[]; // Added custom property
  }

  export interface SankeyLink {
    source: SankeyNode; // Changed to SankeyNode
    target: SankeyNode; // Changed to SankeyNode
    value: number;
    y0: number; // Made required
    y1: number; // Made required
    width: number; // Made required
    index?: number;
    questionIds: string[]; // Added custom property
  }

  export interface SankeyData {
    nodes: Array<{ id: string; type: string; questionIds: string[] }>;
    links: Array<{
      source: string;
      target: string;
      value: number;
      questionIds: string[];
    }>;
  }

  export interface SankeyLayout {
    (data: SankeyData): { nodes: SankeyNode[]; links: SankeyLink[] };
    nodeWidth(width?: number): this;
    nodePadding(padding?: number): this;
    extent(extent?: [[number, number], [number, number]]): this;
    size(size?: [number, number]): this;
    nodeId(
      id: (d: { id: string; type: string; questionIds: string[] }) => string
    ): this; // Typed 'd'
    nodeAlign(align?: (node: SankeyNode, n: number) => number): this;
    nodeSort(sort?: (a: SankeyNode, b: SankeyNode) => number): this;
    linkSort(sort?: (a: SankeyLink, b: SankeyLink) => number): this;
    iterations(iterations?: number): this;
    update(graph: { nodes: SankeyNode[]; links: SankeyLink[] }): {
      nodes: SankeyNode[];
      links: SankeyLink[];
    };
  }

  export function sankey(): SankeyLayout;
  export function sankeyLinkHorizontal(): (d: SankeyLink) => string;
  export function sankeyLeft(node: SankeyNode, n: number): number;
  export function sankeyRight(node: SankeyNode, n: number): number;
  export function sankeyCenter(node: SankeyNode, n: number): number;
  export function sankeyJustify(node: SankeyNode, n: number): number;
}
