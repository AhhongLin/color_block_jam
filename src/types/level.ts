export type Color = "red" | "blue" | "green" | "yellow";

export type Side = "top" | "right" | "bottom" | "left";

export interface Door {
  row: number;
  col: number;
  side: Side;
  color: Color;
}

export interface LevelBlock {
  id: string;
  color: Color;
  cells: [number, number][];
}

export interface Level {
  id: string;
  name: string;
  cells: [number, number][];
  doors: Door[];
  blocks: LevelBlock[];
}
