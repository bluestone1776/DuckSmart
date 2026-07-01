// components/IntroVideo.js

import React, { useEffect, useRef } from "react";
import { View, StyleSheet, StatusBar, Dimensions } from "react-native";
import { Video, ResizeMode } from "expo-av";

const VIDEO = require("../assets/opening_video.mp4");

const { width } = Dimensions.get("window");

export default function IntroVideo({ onDone }) {
  const videoRef = useRef(null);
  const finishedRef = useRef(false);

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;

    if (typeof onDone === "function") {
      onDone();
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      finish();
    }, 5500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.wrap}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <Video
        ref={videoRef}
        source={VIDEO}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isLooping={false}
        useNativeControls={false}
        onPlaybackStatusUpdate={(status) => {
          if (status?.didJustFinish) {
            finish();
          }
        }}
        onError={() => {
          finish();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
  },
  video: {
    width,
    aspectRatio: 16 / 9,
    backgroundColor: "#000000",
  },
});