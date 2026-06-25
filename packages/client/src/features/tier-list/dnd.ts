/** Shared drag-and-drop data contracts for pragmatic-drag-and-drop. */

export type CardData = {
  kind: "card";
  itemId: string;
  listId: string;
};

export type ListData = {
  kind: "list";
  listId: string;
};

export function isCardData(data: Record<string, unknown>): data is CardData {
  return data.kind === "card";
}

export function isListData(data: Record<string, unknown>): data is ListData {
  return data.kind === "list";
}
