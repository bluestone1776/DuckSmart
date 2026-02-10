// DuckSmart spread recommendation logic

import { formatWind } from "./helpers";

export function spreadRecommendation({ environment, windDeg }) {
  const wind = formatWind(windDeg);

  if (environment === "Timber") {
    return {
      name: "Small Pocket / Landing Hole",
      detail: `Keep it tight. Open a landing hole downwind. Wind: ${wind}.`,
    };
  }
  if (environment === "Marsh") {
    return {
      name: "J-Hook",
      detail: `Set the hook into the wind; keep the kill hole just off the tip. Wind: ${wind}.`,
    };
  }
  if (environment === "Field") {
    return {
      name: "Pods + Landing Zone",
      detail: `Two pods with a wide landing zone downwind. Wind: ${wind}.`,
    };
  }
  if (environment === "Open Water") {
    return {
      name: "U-Shape",
      detail: `Open end downwind; keep a clean runway to the pocket. Wind: ${wind}.`,
    };
  }
  return {
    name: "Runway Line",
    detail: `Create a runway into the wind with a clean pocket. Wind: ${wind}.`,
  };
}
