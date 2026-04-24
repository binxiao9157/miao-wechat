import React from "react";

interface PawLogoProps {
  size?: number;
  className?: string;
  id?: string;
}

export default function PawLogo({ size = 48, className = "", id }: PawLogoProps) {
  return (
    <img
      src="/logo.png"
      width={size}
      height={size}
      className={className}
      alt="logo"
    />
  );
}
