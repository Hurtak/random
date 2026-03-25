import { type ComponentType } from "react";

import { CoinPage } from "./coin-page.tsx";

export type PageId = "coin";

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
];

export const pageComponents: Record<PageId, ComponentType> = {
  coin: CoinPage,
};
