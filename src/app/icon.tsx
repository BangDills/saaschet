import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0a0a0a",
          color: "#ffffff",
          display: "flex",
          fontFamily: "Arial, sans-serif",
          fontSize: 44,
          fontWeight: 800,
          height: "100%",
          justifyContent: "center",
          letterSpacing: "-3px",
          width: "100%",
        }}
      >
        C
      </div>
    ),
    size,
  );
}
