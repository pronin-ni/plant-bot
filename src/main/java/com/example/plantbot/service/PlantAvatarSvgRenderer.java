package com.example.plantbot.service;

import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class PlantAvatarSvgRenderer {
  public String render(String plantName, PlantAvatarSpec spec) {
    Palette palette = palette(spec.palette(), spec.backgroundTone());
    String canopy = canopyPath(spec, palette);
    String accent = accentMarkup(spec, palette);
    String pot = potMarkup(spec, palette);
    String stem = stemMarkup(spec, palette);
    String densityLeaves = leavesMarkup(spec, palette);
    String label = escapeXml(initial(plantName));

    return """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Plant avatar">
          <defs>
            <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%%" stop-color="%s"/>
              <stop offset="100%%" stop-color="%s"/>
            </linearGradient>
            <linearGradient id="pot" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%%" stop-color="%s"/>
              <stop offset="100%%" stop-color="%s"/>
            </linearGradient>
            <filter id="shadow" x="-30%%" y="-30%%" width="160%%" height="160%%">
              <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#122018" flood-opacity="0.18"/>
            </filter>
          </defs>
          <rect width="128" height="128" rx="28" fill="url(#bg)"/>
          <circle cx="96" cy="28" r="26" fill="%s" opacity="0.35"/>
          <circle cx="26" cy="104" r="22" fill="%s" opacity="0.22"/>
          <g filter="url(#shadow)">
            %s
            %s
            %s
            %s
            %s
          </g>
          <g>
            <rect x="12" y="92" width="28" height="22" rx="11" fill="#ffffff" fill-opacity="0.58"/>
            <text x="26" y="107" text-anchor="middle" font-size="16" font-family="Inter, Arial, sans-serif" font-weight="700" fill="%s">%s</text>
          </g>
        </svg>
        """.formatted(
        palette.backgroundStart,
        palette.backgroundEnd,
        palette.potTop,
        palette.potBottom,
        palette.glow,
        palette.shadowGlow,
        stem,
        canopy,
        densityLeaves,
        accent,
        pot,
        palette.ink,
        label
    );
  }

  private String canopyPath(PlantAvatarSpec spec, Palette palette) {
    return switch (safe(spec.template())) {
      case "rosette" -> "<path d=\"M64 76c-16 0-29-11-34-28 12-3 24 0 34 12 10-12 22-15 34-12-5 17-18 28-34 28Z\" fill=\"%s\"/>".formatted(palette.leafMain);
      case "trailing" -> "<path d=\"M56 40c16 0 28 10 30 28 1 14-6 26-18 34-8-11-10-23-8-36 1-9 0-17-4-26Z\" fill=\"%s\"/>".formatted(palette.leafMain);
      case "succulent" -> "<path d=\"M64 28c10 0 18 7 18 16v28c0 13-8 22-18 22s-18-9-18-22V44c0-9 8-16 18-16Z\" fill=\"%s\"/>".formatted(palette.leafMain);
      case "cane" -> "<path d=\"M63 26c7 0 12 5 12 12v17c0 6 2 12 6 17 6 8 9 16 8 27-15-2-26-10-32-22-6 12-17 20-32 22-1-11 2-19 8-27 4-5 6-11 6-17V38c0-7 5-12 12-12Z\" fill=\"%s\"/>".formatted(palette.leafMain);
      default -> "<path d=\"M64 26c15 0 28 11 30 28 2 20-10 38-30 46-20-8-32-26-30-46 2-17 15-28 30-28Z\" fill=\"%s\"/>".formatted(palette.leafMain);
    };
  }

  private String leavesMarkup(PlantAvatarSpec spec, Palette palette) {
    String countMarkup = switch (safe(spec.leafDensity())) {
      case "sparse" -> "<ellipse cx=\"46\" cy=\"52\" rx=\"11\" ry=\"22\" transform=\"rotate(-26 46 52)\" fill=\"%s\" opacity=\"0.82\"/><ellipse cx=\"82\" cy=\"52\" rx=\"11\" ry=\"22\" transform=\"rotate(26 82 52)\" fill=\"%s\" opacity=\"0.82\"/>".formatted(palette.leafSoft, palette.leafSoft);
      case "lush" -> "<ellipse cx=\"40\" cy=\"54\" rx=\"12\" ry=\"24\" transform=\"rotate(-34 40 54)\" fill=\"%s\" opacity=\"0.8\"/><ellipse cx=\"88\" cy=\"54\" rx=\"12\" ry=\"24\" transform=\"rotate(34 88 54)\" fill=\"%s\" opacity=\"0.8\"/><ellipse cx=\"64\" cy=\"46\" rx=\"13\" ry=\"26\" fill=\"%s\" opacity=\"0.75\"/>".formatted(palette.leafSoft, palette.leafSoft, palette.leafHighlight);
      default -> "<ellipse cx=\"44\" cy=\"54\" rx=\"12\" ry=\"23\" transform=\"rotate(-28 44 54)\" fill=\"%s\" opacity=\"0.8\"/><ellipse cx=\"84\" cy=\"54\" rx=\"12\" ry=\"23\" transform=\"rotate(28 84 54)\" fill=\"%s\" opacity=\"0.8\"/>".formatted(palette.leafSoft, palette.leafSoft);
    };
    String shapeOverlay = switch (safe(spec.leafShape())) {
      case "heart" -> "<path d=\"M64 38c6-9 21-9 24 2 2 8-2 15-10 22-6 5-10 9-14 14-4-5-8-9-14-14-8-7-12-14-10-22 3-11 18-11 24-2Z\" fill=\"%s\" opacity=\"0.6\"/>".formatted(palette.leafHighlight);
      case "split" -> "<path d=\"M64 32c14 0 24 10 24 24 0 18-12 31-24 37-12-6-24-19-24-37 0-14 10-24 24-24Z\" fill=\"none\" stroke=\"%s\" stroke-width=\"3\" stroke-linecap=\"round\" opacity=\"0.42\"/><path d=\"M64 41v38M52 50l24 20M76 50 52 70\" fill=\"none\" stroke=\"%s\" stroke-width=\"2\" stroke-linecap=\"round\" opacity=\"0.32\"/>".formatted(palette.ink, palette.ink);
      case "needle" -> "<path d=\"M64 28 46 78M64 28 58 78M64 28 70 78M64 28 82 78\" fill=\"none\" stroke=\"%s\" stroke-width=\"4\" stroke-linecap=\"round\" opacity=\"0.62\"/>".formatted(palette.leafSoft);
      case "paddle" -> "<rect x=\"48\" y=\"34\" width=\"32\" height=\"42\" rx=\"16\" fill=\"%s\" opacity=\"0.56\"/>".formatted(palette.leafHighlight);
      case "lance" -> "<path d=\"M64 28c10 12 15 26 15 42S74 96 64 104c-10-8-15-18-15-34s5-30 15-42Z\" fill=\"%s\" opacity=\"0.42\"/>".formatted(palette.leafHighlight);
      default -> "<ellipse cx=\"64\" cy=\"56\" rx=\"18\" ry=\"28\" fill=\"%s\" opacity=\"0.4\"/>".formatted(palette.leafHighlight);
    };
    return countMarkup + shapeOverlay;
  }

  private String accentMarkup(PlantAvatarSpec spec, Palette palette) {
    return switch (safe(spec.accent())) {
      case "bloom" -> "<circle cx=\"64\" cy=\"34\" r=\"7\" fill=\"%s\" opacity=\"0.88\"/><circle cx=\"50\" cy=\"46\" r=\"5\" fill=\"%s\" opacity=\"0.74\"/><circle cx=\"78\" cy=\"46\" r=\"5\" fill=\"%s\" opacity=\"0.74\"/>".formatted(palette.accent, palette.accentSoft, palette.accentSoft);
      case "stripe" -> "<path d=\"M42 42c8 10 17 19 22 38M86 42C78 52 69 61 64 80\" fill=\"none\" stroke=\"%s\" stroke-width=\"3\" stroke-linecap=\"round\" opacity=\"0.3\"/>".formatted(palette.accent);
      case "vein" -> "<path d=\"M64 34v48M64 54 48 64M64 54 80 64\" fill=\"none\" stroke=\"%s\" stroke-width=\"2.5\" stroke-linecap=\"round\" opacity=\"0.28\"/>".formatted(palette.ink);
      default -> "";
    };
  }

  private String stemMarkup(PlantAvatarSpec spec, Palette palette) {
    if ("succulent".equals(safe(spec.template()))) {
      return "<path d=\"M64 44v36\" fill=\"none\" stroke=\"%s\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\"0.24\"/>".formatted(palette.ink);
    }
    return "<path d=\"M64 48v36\" fill=\"none\" stroke=\"%s\" stroke-width=\"4\" stroke-linecap=\"round\" opacity=\"0.34\"/>".formatted(palette.ink);
  }

  private String potMarkup(PlantAvatarSpec spec, Palette palette) {
    String rim = "glass".equals(safe(spec.potStyle())) ? "rgba(255,255,255,0.35)" : palette.ink;
    String opacity = "glass".equals(safe(spec.potStyle())) ? "0.26" : "0.12";
    return """
        <path d="M42 84h44l-5 23c-1 4-4 7-8 7H55c-4 0-7-3-8-7l-5-23Z" fill="url(#pot)"/>
        <rect x="38" y="80" width="52" height="9" rx="4.5" fill="%s" fill-opacity="%s"/>
        <path d="M51 89h26" fill="none" stroke="%s" stroke-width="2.5" stroke-linecap="round" opacity="0.18"/>
        """.formatted(rim, opacity, palette.ink);
  }

  private Palette palette(String paletteName, String backgroundTone) {
    Map<String, Palette> palettes = Map.of(
        "emerald", new Palette("#edf7f0", "#cfebd7", "#f4fffa", "#dcefe3", "#3f875b", "#5b9c70", "#7bb58f", "#204630", "#d08a7b", "#efc3b7", "#8d9f90", "#6e7c72"),
        "moss", new Palette("#eef2e6", "#d8dfc8", "#f7fbf0", "#e7ebdd", "#5d7c43", "#7d9c5e", "#9bb380", "#334327", "#c78f5c", "#e8c3a0", "#85775f", "#675842"),
        "sage", new Palette("#eef4ef", "#d6e4da", "#fbfffc", "#e5efe7", "#62846f", "#80a08a", "#9bb7a5", "#2f4a3d", "#c6a07b", "#e7d0b8", "#8f8679", "#6d6357"),
        "jade", new Palette("#edf5f4", "#d0e4e1", "#f8ffff", "#e1efed", "#3d8b84", "#5da8a0", "#84c2bc", "#1f504d", "#d69a86", "#f1cabc", "#829594", "#5c6d6c"),
        "olive", new Palette("#f5f1e5", "#e7ddbe", "#fffdf6", "#f1ead7", "#708048", "#8d9d61", "#aab57f", "#414a27", "#b8866b", "#dcc0af", "#8f775c", "#6f5943"),
        "variegated", new Palette("#f3f5ea", "#dfe4ce", "#fffef8", "#eef2dd", "#4f7b4e", "#8fb67b", "#dae5b8", "#294229", "#cb8d82", "#edbcb4", "#8d8774", "#6f6755")
    );
    Palette base = palettes.getOrDefault(safe(paletteName), palettes.get("emerald"));
    if ("warm".equals(safe(backgroundTone))) {
      return base.withBackground("#f7f1e7", "#eadcc8", "#fff6ed", "#f1e4d3");
    }
    if ("dusk".equals(safe(backgroundTone))) {
      return base.withBackground("#e8edf4", "#cad6e4", "#f4f8ff", "#dfe7f2");
    }
    if ("light".equals(safe(backgroundTone))) {
      return base.withBackground("#f8faf7", "#e6efe4", "#ffffff", "#edf4eb");
    }
    return base;
  }

  private String initial(String plantName) {
    if (plantName == null || plantName.isBlank()) {
      return "?";
    }
    String trimmed = plantName.trim();
    for (int index = 0; index < trimmed.length(); index += 1) {
      char current = trimmed.charAt(index);
      if (Character.isLetterOrDigit(current)) {
        return String.valueOf(Character.toUpperCase(current));
      }
    }
    return "?";
  }

  private String escapeXml(String value) {
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&apos;");
  }

  private String safe(String value) {
    return value == null ? "" : value.trim().toLowerCase();
  }

  private record Palette(
      String backgroundStart,
      String backgroundEnd,
      String glow,
      String shadowGlow,
      String leafMain,
      String leafSoft,
      String leafHighlight,
      String ink,
      String accent,
      String accentSoft,
      String potTop,
      String potBottom
  ) {
    private Palette withBackground(String nextStart, String nextEnd, String nextGlow, String nextShadowGlow) {
      return new Palette(nextStart, nextEnd, nextGlow, nextShadowGlow, leafMain, leafSoft, leafHighlight, ink, accent, accentSoft, potTop, potBottom);
    }
  }
}
