/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as casting from "../casting.js";
import type * as comments from "../comments.js";
import type * as crews from "../crews.js";
import type * as groups from "../groups.js";
import type * as lookAi from "../lookAi.js";
import type * as looks from "../looks.js";
import type * as movies from "../movies.js";
import type * as narration from "../narration.js";
import type * as reelPlan from "../reelPlan.js";
import type * as reels from "../reels.js";
import type * as seed from "../seed.js";
import type * as social from "../social.js";
import type * as story from "../story.js";
import type * as worker from "../worker.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  casting: typeof casting;
  comments: typeof comments;
  crews: typeof crews;
  groups: typeof groups;
  lookAi: typeof lookAi;
  looks: typeof looks;
  movies: typeof movies;
  narration: typeof narration;
  reelPlan: typeof reelPlan;
  reels: typeof reels;
  seed: typeof seed;
  social: typeof social;
  story: typeof story;
  worker: typeof worker;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
