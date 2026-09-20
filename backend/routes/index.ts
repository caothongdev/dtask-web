import { userRoutes } from "./users";
import { taskRoutes } from "./tasks";
import { rewardRoutes } from "./rewards";
import { miscRoutes } from "./misc";
import type { Route } from "./types";

export type { Route };

export const routes: Route[] = [
  ...userRoutes,
  ...taskRoutes,
  ...rewardRoutes,
  ...miscRoutes,
];
