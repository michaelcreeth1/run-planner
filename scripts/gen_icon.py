#!/usr/bin/env python3
"""Generate the Running Planner app icon (route-pin loop + runner)."""
import math

# --- Pin geometry ---------------------------------------------------------
CX, CY = 256.0, 214.0          # pin circle center
R_OUT = 168.0                  # outer radius of the ring
R_IN = 124.0                   # inner hole radius
TIP = (256.0, 464.0)           # pin tail tip

d = TIP[1] - CY
ang = math.acos(R_OUT / d)     # angle at center between CT and tangent point
# tangent points, measured from +x axis (y-down coords, +y toward tip)
phi1 = math.pi / 2 - ang       # right tangent point
phi2 = math.pi / 2 + ang       # left tangent point
p1 = (CX + R_OUT * math.cos(phi1), CY + R_OUT * math.sin(phi1))
p2 = (CX + R_OUT * math.cos(phi2), CY + R_OUT * math.sin(phi2))

f = lambda v: f"{v:.1f}"

pin_outer = (
    f"M {f(p1[0])} {f(p1[1])} "
    f"A {R_OUT} {R_OUT} 0 1 0 {f(p2[0])} {f(p2[1])} "
    f"L {f(TIP[0])} {f(TIP[1])} Z"
)
pin_hole = (
    f"M {f(CX + R_IN)} {f(CY)} "
    f"A {R_IN} {R_IN} 0 1 0 {f(CX - R_IN)} {f(CY)} "
    f"A {R_IN} {R_IN} 0 1 0 {f(CX + R_IN)} {f(CY)} Z"
)

# --- Runner (stroke skeleton, tuned by eye) -------------------------------
IVORY = "#FDF8E7"
W = 32  # limb stroke width

head = (312, 120, 30)
torso = [(286, 168), (246, 258)]
front_arm = [(286, 170), (338, 208), (366, 172)]
back_arm = [(284, 174), (226, 200), (206, 244)]
front_leg = [(246, 258), (318, 296), (302, 366)]
back_leg = [(246, 258), (188, 314), (134, 292)]


def poly(points):
    return "M " + " L ".join(f"{x} {y}" for x, y in points)


svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Running Planner icon">
  <defs>
    <radialGradient id="depth" cx="50%" cy="0%" r="115%">
      <stop offset="0%" stop-color="#101C2C"/>
      <stop offset="55%" stop-color="#07101C"/>
      <stop offset="100%" stop-color="#040B16"/>
    </radialGradient>
    <linearGradient id="route" x1="20%" y1="4%" x2="72%" y2="96%">
      <stop offset="0%" stop-color="#15EDC3"/>
      <stop offset="58%" stop-color="#52CF7F"/>
      <stop offset="100%" stop-color="#B5F741"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="115" fill="url(#depth)"/>
  <rect x="6" y="6" width="500" height="500" rx="110" fill="none" stroke="{IVORY}" stroke-opacity="0.05" stroke-width="4"/>
  <g transform="translate(256 256) scale(0.95) translate(-256 -256)">
    <path d="{pin_outer} {pin_hole}" fill="url(#route)" fill-rule="evenodd"/>
    <g fill="none" stroke="{IVORY}" stroke-width="{W}" stroke-linecap="round" stroke-linejoin="round">
      <path d="{poly(torso)}"/>
      <path d="{poly(front_arm)}"/>
      <path d="{poly(back_arm)}"/>
      <path d="{poly(front_leg)}"/>
      <path d="{poly(back_leg)}"/>
    </g>
    <circle cx="{head[0]}" cy="{head[1]}" r="{head[2]}" fill="{IVORY}"/>
  </g>
</svg>
"""

out = "/Users/mike/Documents/Codex/run-planner/frontend/public/icons/icon.svg"
with open(out, "w") as fh:
    fh.write(svg)
print(f"wrote {out}")

# --- Small-size variant (favicon, 16-32px): thicker ring, fewer/bolder strokes
W_S = 46
head_s = (314, 116, 38)
torso_s = [(288, 172), (244, 262)]
front_arm_s = [(288, 174), (352, 196)]
front_leg_s = [(244, 262), (322, 300), (306, 368)]
back_leg_s = [(244, 262), (182, 316), (128, 296)]

R_IN_S = 112.0
pin_hole_s = (
    f"M {f(CX + R_IN_S)} {f(CY)} "
    f"A {R_IN_S} {R_IN_S} 0 1 0 {f(CX - R_IN_S)} {f(CY)} "
    f"A {R_IN_S} {R_IN_S} 0 1 0 {f(CX + R_IN_S)} {f(CY)} Z"
)

svg_small = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Running Planner icon">
  <defs>
    <linearGradient id="route" x1="20%" y1="4%" x2="72%" y2="96%">
      <stop offset="0%" stop-color="#15EDC3"/>
      <stop offset="58%" stop-color="#52CF7F"/>
      <stop offset="100%" stop-color="#B5F741"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="115" fill="#07101C"/>
  <path d="{pin_outer} {pin_hole_s}" fill="url(#route)" fill-rule="evenodd"/>
  <g fill="none" stroke="{IVORY}" stroke-width="{W_S}" stroke-linecap="round" stroke-linejoin="round">
    <path d="{poly(torso_s)}"/>
    <path d="{poly(front_arm_s)}"/>
    <path d="{poly(front_leg_s)}"/>
    <path d="{poly(back_leg_s)}"/>
  </g>
  <circle cx="{head_s[0]}" cy="{head_s[1]}" r="{head_s[2]}" fill="{IVORY}"/>
</svg>
"""

out_small = "/Users/mike/Documents/Codex/run-planner/frontend/public/icons/icon-small.svg"
with open(out_small, "w") as fh:
    fh.write(svg_small)
print(f"wrote {out_small}")
