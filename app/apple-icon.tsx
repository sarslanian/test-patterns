import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const BAR_COLORS = [
  "#bfbfbf",
  "#bfbf00",
  "#00bfbf",
  "#00bf00",
  "#bf00bf",
  "#bf0000",
  "#0000bf",
];

/** iOS home-screen icon — miniature color bars */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#09090b",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 128,
            height: 112,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {BAR_COLORS.map((c) => (
            <div key={c} style={{ flexGrow: 1, height: 112, background: c }} />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
