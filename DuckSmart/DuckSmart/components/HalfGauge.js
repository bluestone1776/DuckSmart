import React from "react";
import { View } from "react-native";
import Svg, { Path, Circle, Text as SvgText, Defs, LinearGradient, Stop } from "react-native-svg";
import { clamp } from "../utils/helpers";

export function HalfGaugeGradient({ value, size = 260 }) {
  const stroke = 16;
  const radius = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const startX = cx - radius;
  const startY = cy;
  const endX = cx + radius;
  const endY = cy;

  const d = `M ${startX} ${startY} A ${radius} ${radius} 0 0 1 ${endX} ${endY}`;

  const p = clamp(value, 0, 100) / 100;
  const angle = Math.PI * (1 - p);
  const needleX = cx + radius * Math.cos(angle);
  const needleY = cy - radius * Math.sin(angle);

  const arcLen = Math.PI * radius;

  return (
    <View style={{ alignItems: "center" }}>
      <Svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id="rg" x1="0" y1="0" x2={size} y2="0">
            <Stop offset="0%" stopColor="#D94C4C" />
            <Stop offset="55%" stopColor="#D9A84C" />
            <Stop offset="100%" stopColor="#4CD97B" />
          </LinearGradient>
        </Defs>

        <Path d={d} stroke="#2A2A2A" strokeWidth={stroke} strokeLinecap="round" fill="none" />
        <Path
          d={d}
          stroke="url(#rg)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${arcLen * p} ${arcLen}`}
        />

        <Circle cx={needleX} cy={needleY} r={10} fill="#FFFFFF" />
        <Circle cx={needleX} cy={needleY} r={6} fill="#0F0F0F" />

        <SvgText x={cx} y={cy - 12} fill="#FFFFFF" fontSize="40" fontWeight="800" textAnchor="middle">
          {Math.round(value)}
        </SvgText>
        <SvgText x={cx} y={cy + 20} fill="#BDBDBD" fontSize="12" fontWeight="700" textAnchor="middle">
          Hunt Score
        </SvgText>
      </Svg>
    </View>
  );
}
