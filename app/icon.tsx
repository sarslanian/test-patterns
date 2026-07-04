import { ImageResponse } from "next/og";

export const size = { width: 48, height: 48 };
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

/** Tab / bookmark favicon — miniature color bars */
export default function Icon() {
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
            width: 36,
            height: 32,
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          {BAR_COLORS.map((c) => (
            <div key={c} style={{ flexGrow: 1, height: 32, background: c }} />
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
