import React from "react";
import { View, Text } from "react-native";
import { sharedStyles as styles } from "../constants/styles";

export default function Card({ title, right, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {right ? <View>{right}</View> : null}
      </View>
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}
