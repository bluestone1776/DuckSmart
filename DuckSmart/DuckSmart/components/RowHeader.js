import React from "react";
import { View, Text } from "react-native";
import { sharedStyles as styles } from "../constants/styles";

export default function RowHeader({ title, pill }) {
  return (
    <View style={styles.sheetHeaderRow}>
      <Text style={styles.sheetTitle}>{title}</Text>
      <View style={styles.sheetPill}>
        <Text style={styles.sheetPillText}>{pill}</Text>
      </View>
    </View>
  );
}
