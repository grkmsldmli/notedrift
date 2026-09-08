// Shim for `next/image` (defensive — not used by the editor graph). Renders a
// plain <img>; supports the `{ src }` object form next/image accepts.
import type { ImgHTMLAttributes } from "react";

type NextImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string };
  alt?: string;
};

export default function Image({ src, alt = "", ...rest }: NextImageProps) {
  const url = typeof src === "string" ? src : src.src;
  return <img src={url} alt={alt} {...rest} />;
}
