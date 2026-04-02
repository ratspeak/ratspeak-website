#!/usr/bin/env python3
"""Generate Ratspeak branding icon set at multiple resolutions."""

import os
import math
import cairosvg
from PIL import Image, ImageDraw, ImageChops
from io import BytesIO

SIZES = [16, 32, 64, 128, 256, 512, 1024]
OUT = os.path.dirname(os.path.abspath(__file__))

# Brand colors
EMBER = "#BB6C43"
DARK_BG = "#4A413C"
WHITE_BG = "#FFFFFF"
LIGHT_BG = "#EBEFEE"  # Frost — light background

# The logo paths extracted from file.svg
LOGO_PATHS = """<path fill="{fill}" d="
M327.968170,501.158813
	C314.612823,508.030457 301.568787,514.718689 288.564667,521.483704
	C283.906769,523.906799 279.202484,524.608093 275.045868,520.980713
	C271.050140,517.493652 271.258057,512.871216 272.630554,508.048492
	C275.226746,498.926086 277.457489,489.699310 280.078735,480.584534
	C281.032684,477.267426 280.404602,475.510132 277.138275,473.917603
	C255.839752,463.533234 245.614563,446.289917 245.664932,422.656921
	C245.753387,381.157562 245.548752,339.657227 245.748459,298.158630
	C245.856934,275.621063 256.634552,259.571350 276.933105,249.976730
	C283.680115,246.787582 291.072327,246.010666 298.402832,245.996140
	C355.735321,245.882507 413.068329,245.826920 470.400726,245.953217
	C495.215057,246.007874 516.635620,265.694244 519.515930,290.025574
	C520.601440,299.195160 520.117065,308.321594 520.208130,317.464325
	C520.367493,333.462463 520.288940,349.463715 520.204651,365.463074
	C520.173462,371.381287 518.885925,372.034637 513.767273,369.133392
	C498.898499,360.705811 498.908051,360.705780 498.895477,343.646637
	C498.884583,328.813538 498.917877,313.979889 498.806915,299.147430
	C498.661743,279.741821 486.175995,267.275574 466.771118,267.263916
	C410.938477,267.230347 355.105713,267.234070 299.273132,267.318817
	C279.539673,267.348785 267.321625,279.364319 267.234802,299.048218
	C267.051025,340.713257 267.036682,382.379395 267.091003,424.044922
	C267.113922,441.620758 277.671661,453.848572 295.433075,456.579468
	C310.833984,458.947418 307.835663,458.978485 304.513245,471.318420
	C303.301056,475.820587 302.049133,480.312103 300.827454,484.811737
	C300.352844,486.559753 299.660675,488.316254 300.922791,490.332825
	C304.477539,490.202850 307.243988,487.866058 310.306793,486.457275
	C314.992493,484.302002 319.612335,481.945374 324.042511,479.308594
	C328.778992,476.489532 333.171173,476.591064 338.227417,478.730042
	C355.379700,485.986206 373.439697,488.836792 391.953949,487.719757
	C430.976227,485.365417 461.990295,468.126495 484.598419,436.222687
	C489.789673,428.896973 493.712006,420.739441 496.427124,412.077515
	C497.173920,409.695099 496.943207,408.002960 494.736664,406.520660
	C489.598328,403.068848 487.334564,398.047638 487.697083,391.962555
	C487.911255,388.368195 486.577209,386.133850 483.493866,384.241180
	C461.578094,370.788574 438.601746,360.130676 412.766998,356.866028
	C403.647125,355.713593 394.491638,355.670685 385.352783,356.729248
	C376.092834,357.801788 372.642639,358.017365 369.743683,347.737213
	C368.119751,341.978455 365.708679,336.467560 362.237030,331.471436
	C356.277893,322.895477 346.678650,319.018188 337.450958,321.631073
	C328.924500,324.045410 321.828003,333.468597 321.315216,343.136169
	C320.632874,356.000641 327.026306,371.922455 346.664215,374.878113
	C350.070923,375.390869 352.587311,376.980225 353.164948,380.743591
	C353.696350,384.205414 352.023376,386.530762 349.328644,388.251556
	C347.399170,389.483704 345.130554,389.393860 343.003998,389.008881
	C325.701508,385.876862 313.839172,376.012024 308.730072,359.239349
	C303.682312,342.667816 306.623260,327.487061 319.940338,315.423248
	C336.414337,300.499634 361.240723,303.856476 373.402649,322.510590
	C376.135284,326.701935 378.695312,331.062408 380.191284,335.834625
	C381.411041,339.725739 383.562256,341.029144 387.539886,340.768951
	C406.495819,339.528900 425.148529,341.259247 443.288330,347.180908
	C469.205597,355.641449 492.633240,368.823700 514.465332,384.974976
	C521.504395,390.182495 521.016174,397.617035 519.753296,405.007080
	C515.097656,432.250000 501.282715,454.401276 481.015900,472.623566
	C460.482239,491.085724 436.542145,502.917938 409.196136,507.517273
	C385.769257,511.457428 362.774963,509.704773 340.176849,502.297943
	C336.390533,501.056946 332.583923,498.310944 327.968170,501.158813
z"/>
<path fill="{fill}" d="
M414.192688,335.384125
	C405.752502,335.933838 397.647217,334.864838 389.538544,335.841949
	C386.999908,336.147858 385.783569,334.056091 384.801819,332.068085
	C380.734650,323.832214 376.210083,315.948059 368.774628,310.165710
	C366.479370,308.380737 367.227142,307.004120 369.431213,305.623901
	C379.533966,299.297333 389.616943,299.216583 399.186523,306.485565
	C408.523376,313.577728 414.075836,323.092621 414.192688,335.384125
z"/>
<path fill="{fill}" d="
M417.092285,390.209412
	C410.664825,388.775787 407.339386,384.601837 408.099579,379.437195
	C408.811401,374.601044 413.308868,370.908020 418.309540,371.053436
	C423.116180,371.193207 426.941650,375.015869 427.266174,380.003448
	C427.630859,385.607910 424.177490,389.218689 417.092285,390.209412
z"/>
<path fill="{fill}" d="
M430.829620,418.712555
	C429.468231,419.233032 428.588959,420.254486 427.026154,419.591888
	C426.810333,417.599304 428.520233,416.826111 429.772278,416.066620
	C441.624939,408.876678 453.852112,402.563873 467.791992,400.418243
	C469.449615,400.163086 471.076508,399.823425 472.692566,400.525970
	C474.423706,401.278534 475.233917,402.656433 475.093933,404.493347
	C474.921997,406.748901 473.272125,407.602539 471.339203,407.794617
	C465.711426,408.353851 460.116180,409.053802 454.587433,410.298187
	C446.442780,412.131348 438.565125,414.683960 430.829620,418.712555
z"/>
<path fill="{fill}" d="
M448.634430,432.622101
	C455.166016,424.816742 461.543457,417.301025 470.213623,412.353058
	C473.172333,410.664520 477.325500,407.477448 479.700378,412.176666
	C482.088440,416.901886 476.907593,417.667999 473.973694,418.989105
	C464.900238,423.074677 457.385437,429.349976 449.847137,435.628479
	C448.674011,436.605560 447.946289,438.424225 445.793304,438.039856
	C445.617737,435.721130 447.392334,434.492981 448.634430,432.622101
z"/>"""

# Logo content bounding box (from path analysis)
LOGO_VB = "243 243 282 282"
# For padding in app icons, use a slightly larger viewBox
# Logo spans ~245-522 in a 768 space. Center is ~384.
# We want the logo centered with ~20% padding on each side for app icons
PADDED_VB = "205 205 358 358"  # more breathing room for app icons

# Android adaptive icons: 108dp canvas with 72dp safe zone (inner 66.67%)
# Logo content is 282 units wide, centered at ~384.
# For safe zone: logo should occupy 66.67% of canvas → canvas = 282/0.6667 ≈ 423
# Padding each side: (423-282)/2 ≈ 70.5 → origin shifts by 70.5
ADAPTIVE_VB = "62 62 644 644"


# ── iOS squircle helpers ──

def superellipse_points(size, n=5.0, num_points=2000):
    """Generate polygon points for an iOS-style squircle (superellipse).

    Apple's icon shape uses continuous curvature (~superellipse with n≈5),
    giving the characteristic 'squircle' look with ~20% effective corner radius.
    """
    points = []
    cx = cy = size / 2.0
    a = b = size / 2.0
    for i in range(num_points):
        t = 2.0 * math.pi * i / num_points
        cos_t = math.cos(t)
        sin_t = math.sin(t)
        x = cx + a * abs(cos_t) ** (2.0 / n) * (1 if cos_t >= 0 else -1)
        y = cy + b * abs(sin_t) ** (2.0 / n) * (1 if sin_t >= 0 else -1)
        points.append((x, y))
    return points


def make_squircle_mask(size, n=5.0):
    """Create an anti-aliased iOS squircle mask at the given pixel size.

    Renders at 2x then downsamples with LANCZOS for smooth edges.
    """
    ss = size * 2
    mask = Image.new('L', (ss, ss), 0)
    draw = ImageDraw.Draw(mask)
    points = superellipse_points(ss, n)
    draw.polygon(points, fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    return mask


def apply_squircle(img, n=5.0):
    """Apply an iOS squircle mask — areas outside become transparent."""
    size = img.size[0]
    mask = make_squircle_mask(size, n)
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    r, g, b, a = img.split()
    a = ImageChops.multiply(a, mask)
    img.putalpha(a)
    return img


def make_svg(bg_rect, fill_color, viewbox, extra_before="", extra_after=""):
    """Build a complete SVG string."""
    paths = LOGO_PATHS.format(fill=fill_color)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}">
{bg_rect}{extra_before}{paths}{extra_after}
</svg>'''


def svg_to_png(svg_string, size):
    """Render SVG string to a PIL Image at the given square size."""
    png_data = cairosvg.svg2png(
        bytestring=svg_string.encode('utf-8'),
        output_width=size,
        output_height=size,
    )
    return Image.open(BytesIO(png_data))


def save_png(img, path):
    """Save a PIL image as PNG with optimization."""
    img.save(path, "PNG", optimize=True)
    print(f"  {os.path.basename(path)} ({img.size[0]}x{img.size[1]})")


def generate_variant(name, svg_string, subdir):
    """Generate all sizes for a single variant."""
    d = os.path.join(OUT, subdir)
    os.makedirs(d, exist_ok=True)
    print(f"\n--- {name} ---")
    for size in SIZES:
        img = svg_to_png(svg_string, size)
        save_png(img, os.path.join(d, f"ratspeak-{subdir}-{size}x{size}.png"))


def generate_ios_variant(name, svg_string, subdir):
    """Generate iOS icons with squircle mask at all sizes.

    iOS guidelines:
    - 1024x1024 for App Store, smaller for devices
    - Squircle shape (superellipse, ~20% continuous-curvature corner radius)
    - No transparency — solid background fills the squircle
    - Must look good in both light and dark system modes
    """
    d = os.path.join(OUT, subdir)
    os.makedirs(d, exist_ok=True)
    print(f"\n--- {name} ---")
    for size in SIZES:
        img = svg_to_png(svg_string, size)
        img = apply_squircle(img, n=5.0)
        save_png(img, os.path.join(d, f"ratspeak-{subdir}-{size}x{size}.png"))


def generate_android_variant(name, svg_composite, svg_foreground, bg_color, subdir):
    """Generate Android icons: Play Store composite + adaptive icon layers.

    Android guidelines:
    - Play Store: 512x512 full-bleed square PNG, no shadows, no rounded corners
    - Adaptive icons (108dp): separate foreground + background layers
      - Foreground: logo centered in 72dp safe zone (inner 66.67% of 108dp canvas)
      - Background: solid color layer
      - System applies shape mask (circle, squircle, rounded square, etc.)
    """
    d = os.path.join(OUT, subdir)
    os.makedirs(d, exist_ok=True)

    # ── Play Store composite (full-bleed square, no transparency) ──
    print(f"\n--- {name} — composite ---")
    for size in SIZES:
        img = svg_to_png(svg_composite, size)
        # Flatten alpha — Android Play Store requires no transparency
        if img.mode == 'RGBA':
            flat = Image.new('RGB', img.size, (255, 255, 255))
            flat.paste(img, mask=img.split()[3])
            img = flat
        save_png(img, os.path.join(d, f"ratspeak-{subdir}-{size}x{size}.png"))

    # ── Adaptive foreground (logo on transparent, safe-zone padded) ──
    fg_dir = os.path.join(d, "adaptive-foreground")
    os.makedirs(fg_dir, exist_ok=True)
    print(f"\n--- {name} — adaptive foreground ---")
    for size in SIZES:
        img = svg_to_png(svg_foreground, size)
        save_png(img, os.path.join(fg_dir, f"ratspeak-{subdir}-foreground-{size}x{size}.png"))

    # ── Adaptive background (solid color) ──
    bg_dir = os.path.join(d, "adaptive-background")
    os.makedirs(bg_dir, exist_ok=True)
    print(f"\n--- {name} — adaptive background ---")
    for size in SIZES:
        # Parse hex color to RGB tuple
        hex_c = bg_color.lstrip('#')
        rgb = tuple(int(hex_c[i:i+2], 16) for i in (0, 2, 4))
        img = Image.new('RGB', (size, size), rgb)
        save_png(img, os.path.join(bg_dir, f"ratspeak-{subdir}-background-{size}x{size}.png"))


def main():
    print("Generating Ratspeak branding icon set...\n")

    # ── 1. Transparent background (logo only) ──
    svg_transparent = make_svg("", EMBER, LOGO_VB)
    generate_variant("Transparent background", svg_transparent, "transparent")

    # ── 2. White background ──
    vb = LOGO_VB  # tight crop with white bg
    svg_white = make_svg(
        f'<rect x="243" y="243" width="282" height="282" fill="{WHITE_BG}"/>',
        EMBER, vb
    )
    generate_variant("White background", svg_white, "white-bg")

    # ── 3. App icon — Dark (ember logo on dark bg, rounded corners) ──
    # iOS/Android: square icon, OS applies mask. Rounded rect for preview.
    # Use padded viewbox so logo has breathing room
    rx = 58  # ~16% corner radius for app-icon feel
    svg_app_dark = make_svg(
        f'<rect x="205" y="205" width="358" height="358" rx="{rx}" fill="{DARK_BG}"/>',
        EMBER, PADDED_VB
    )
    generate_variant("App icon (dark)", svg_app_dark, "app-dark")

    # ── 4. App icon — Light (dark logo on light bg, rounded corners) ──
    svg_app_light = make_svg(
        f'<rect x="205" y="205" width="358" height="358" rx="{rx}" fill="{WHITE_BG}"/>',
        DARK_BG, PADDED_VB
    )
    generate_variant("App icon (light)", svg_app_light, "app-light")

    # ── 5. App icon — Dark, no rounded corners (square, for OS masking) ──
    svg_app_dark_sq = make_svg(
        f'<rect x="205" y="205" width="358" height="358" fill="{DARK_BG}"/>',
        EMBER, PADDED_VB
    )
    generate_variant("App icon square (dark)", svg_app_dark_sq, "app-dark-square")

    # ── 6. App icon — Light, no rounded corners (square, for OS masking) ──
    svg_app_light_sq = make_svg(
        f'<rect x="205" y="205" width="358" height="358" fill="{WHITE_BG}"/>',
        DARK_BG, PADDED_VB
    )
    generate_variant("App icon square (light)", svg_app_light_sq, "app-light-square")

    # ── 7. iOS Dark (squircle, dark bg, ember logo) ──
    svg_ios_dark = make_svg(
        f'<rect x="205" y="205" width="358" height="358" fill="{DARK_BG}"/>',
        EMBER, PADDED_VB
    )
    generate_ios_variant("iOS icon (dark)", svg_ios_dark, "ios-dark")

    # ── 8. iOS Light (squircle, white bg, dark logo) ──
    svg_ios_light = make_svg(
        f'<rect x="205" y="205" width="358" height="358" fill="{WHITE_BG}"/>',
        DARK_BG, PADDED_VB
    )
    generate_ios_variant("iOS icon (light)", svg_ios_light, "ios-light")

    # ── 9. Android Dark (full-bleed square + adaptive layers) ──
    # Composite: logo on dark bg, padded for visual balance (Play Store icon)
    svg_android_dark_comp = make_svg(
        f'<rect x="205" y="205" width="358" height="358" fill="{DARK_BG}"/>',
        EMBER, PADDED_VB
    )
    # Foreground: logo on transparent, safe-zone padded (inner 66.67%)
    svg_android_dark_fg = make_svg("", EMBER, ADAPTIVE_VB)
    generate_android_variant(
        "Android icon (dark)",
        svg_android_dark_comp, svg_android_dark_fg, DARK_BG, "android-dark"
    )

    # ── 10. Android Light (full-bleed square + adaptive layers) ──
    svg_android_light_comp = make_svg(
        f'<rect x="205" y="205" width="358" height="358" fill="{WHITE_BG}"/>',
        DARK_BG, PADDED_VB
    )
    svg_android_light_fg = make_svg("", DARK_BG, ADAPTIVE_VB)
    generate_android_variant(
        "Android icon (light)",
        svg_android_light_comp, svg_android_light_fg, WHITE_BG, "android-light"
    )

    # ── Also save the SVG sources ──
    svg_dir = os.path.join(OUT, "svg-sources")
    os.makedirs(svg_dir, exist_ok=True)
    sources = {
        "logo-transparent.svg": svg_transparent,
        "logo-white-bg.svg": svg_white,
        "app-icon-dark.svg": svg_app_dark,
        "app-icon-light.svg": svg_app_light,
        "app-icon-dark-square.svg": svg_app_dark_sq,
        "app-icon-light-square.svg": svg_app_light_sq,
        "ios-dark.svg": svg_ios_dark,
        "ios-light.svg": svg_ios_light,
        "android-dark-composite.svg": svg_android_dark_comp,
        "android-dark-foreground.svg": svg_android_dark_fg,
        "android-light-composite.svg": svg_android_light_comp,
        "android-light-foreground.svg": svg_android_light_fg,
    }
    print("\n--- SVG sources ---")
    for fname, content in sources.items():
        path = os.path.join(svg_dir, fname)
        with open(path, 'w') as f:
            f.write(content)
        print(f"  {fname}")

    # ── Summary ──
    # 6 original variants × 7 sizes = 42
    # 2 iOS variants × 7 sizes = 14
    # 2 Android variants × (7 composite + 7 foreground + 7 background) = 42
    png_count = (6 * len(SIZES)) + (2 * len(SIZES)) + (2 * 3 * len(SIZES))
    print(f"\nDone! Generated {png_count} PNGs + {len(sources)} SVGs = {png_count + len(sources)} files total.")
    print(f"Output: {OUT}/")


if __name__ == "__main__":
    main()
