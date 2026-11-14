"use client";
import { useEffect, useRef, useState } from "react";
import { CHAIN_NAMES, chainCode, tokenDisplay } from "./token-display";

type IconToken = {
  symbol: string;
  name?: string;
  logo?: string;
  color?: string;
  chain?: string;
};
export function TokenIcon({
  token,
  size = 32,
  chainBadge = false,
}: {
  token: IconToken;
  size?: number;
  chainBadge?: boolean;
}) {
  const [failed, setFailed] = useState("");
  const image = useRef<HTMLImageElement>(null);
  const logo = token.logo ?? tokenDisplay(token.symbol).logo;
  // A cached image error can happen before React hydrates and attaches onError.
  useEffect(() => {
    if (logo && image.current?.complete && !image.current.naturalWidth)
      setFailed(logo);
  }, [logo]);
  const hue =
    Array.from(token.symbol).reduce((n, c) => n + c.charCodeAt(0) * 7, 0) % 360;
  const label = `${token.name || token.symbol} logo`;
  const chain = token.chain && chainCode(token.chain);
  return (
    <span
      className="token-glyph token-icon"
      style={{
        width: size,
        height: size,
        background: token.color || `hsl(${hue} 45% 65%)`,
      }}
    >
      {logo && failed !== logo ? (
        <img
          ref={image}
          src={logo}
          alt={label}
          width={size}
          height={size}
          onError={() => setFailed(logo)}
        />
      ) : (
        <span className="token-initials" role="img" aria-label={label}>
          {token.symbol
            .replace(/^t(?=[A-Z])/, "")
            .slice(0, 2)
            .toUpperCase()}
        </span>
      )}
      {chainBadge && chain && (
        <span className="token-chain-badge">
          <ChainIcon
            chain={chain}
            size={Math.max(12, Math.round(size * 0.4))}
          />
        </span>
      )}
    </span>
  );
}
export function ChainIcon({
  chain,
  size = 20,
}: {
  chain: string;
  size?: number;
}) {
  const code = chainCode(chain);
  return (
    <TokenIcon
      token={{
        symbol: chain,
        name: code ? CHAIN_NAMES[code] : chain,
        logo: code ? `/chains/${code}.png` : undefined,
      }}
      size={size}
    />
  );
}
