export type Color = "red" | "blue" | "green" | "yellow" | "pink" | "orange" | "darkgreen" | "purple";

export type Side = "top" | "right" | "bottom" | "left";

// [row, col]. A tuple (not a {row, col} object) because spec.md section 3
// authors these by hand in JSON, where a flat pair is far less noisy than
// a list of objects. Door position stays as named fields below — spec.md
// gives a door its own row/col rather than a tuple, since it's a single
// point rather than a list, and the names read better one-off.
export type CellCoord = [row: number, col: number];

export interface Door {
  row: number;
  col: number;
  side: Side;
  color: Color;
}

export interface LevelBlock {
  id: string;
  color: Color;
  cells: CellCoord[];
}

export interface Level {
  id: string;
  name: string;
  cells: CellCoord[];
  doors: Door[];
  blocks: LevelBlock[];
}
