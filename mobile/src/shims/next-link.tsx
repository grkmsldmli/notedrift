// Shim for `next/link` in the native bundle. Renders a plain anchor. The editor's
// only links point at web routes (/tools, /help, …) that aren't in the local
// bundle, so on native those open the production site in the system browser.
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import { isNative, PRODUCTION_ORIGIN } from "@/lib/platform";
import { openExternalUrl } from "../native/externalLink";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: ReactNode;
  // Accepted and ignored so callers using Next's Link API still type-check.
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
};

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, children, prefetch: _prefetch, replace: _replace, scroll: _scroll, onClick, ...rest },
  ref,
) {
  const internal = typeof href === "string" && href.startsWith("/");
  if (internal && isNative()) {
    const url = PRODUCTION_ORIGIN + href;
    return (
      <a
        ref={ref}
        href={url}
        onClick={(e) => {
          e.preventDefault();
          void openExternalUrl(url);
        }}
        {...rest}
      >
        {children}
      </a>
    );
  }
  return (
    <a ref={ref} href={href} onClick={onClick} {...rest}>
      {children}
    </a>
  );
});

export default Link;
