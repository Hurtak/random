import { type ComponentType } from "react";

import { CoinPage } from "./coin-page.tsx";
import { DicePage } from "./dice-page.tsx";

export type PageId = "coin" | "dice";

type PageDefinition = {
  description: string;
  id: PageId;
  label: string;
};

export const pages: ReadonlyArray<PageDefinition> = [
  {
    description: "3D coin flip",
    id: "coin",
    label: "Coin",
  },
  {
    description: "Physics dice room",
    id: "dice",
    label: "Dice",
  },
];

export const pageComponents: Record<PageId, ComponentType> = {
  coin: CoinPage,
  dice: DicePage,
};
