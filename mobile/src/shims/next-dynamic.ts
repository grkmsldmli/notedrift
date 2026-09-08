// Shim for `next/dynamic` (defensive). Maps to React.lazy; `ssr` and `loading`
// options are irrelevant in a client-only bundle.
import { lazy, type ComponentType } from "react";

type Loader = () => Promise<{ default: ComponentType<unknown> } | ComponentType<unknown>>;

export default function dynamic(loader: Loader): ComponentType<unknown> {
  return lazy(async () => {
    const mod = await loader();
    return "default" in mod ? mod : { default: mod };
  });
}
