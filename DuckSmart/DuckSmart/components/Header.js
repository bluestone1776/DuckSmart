import React from "react";
import { View, Text, Pressable, Image } from "react-native";
import { sharedStyles as styles } from "../constants/styles";
import { ASSETS } from "../constants/assets";

export default function Header({ subtitle = "Today" }) {
  return (
    <View style={styles.headerRow}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Image source={ASSETS.logo} style={styles.logoSmall} resizeMode="contain" />
        <View>
          <Text style={styles.brand}>
            <Text style={styles.brandDuck}>Duck</Text>
            <Text style={styles.brandSmart}>Smart</Text>
          </Text>
          <Text style={styles.subHeader}>{subtitle}</Text>
        </View>
      </View>

      <Pressable style={styles.gearButton} onPress={() => {}}>
        <Text style={styles.gearText}>{"\u2699\uFE0E"}</Text>
      </Pressable>
    </View>
  );
}
